/**
 * AI patch protocol.
 *
 * The model can emit one or more ```sd-patch fenced JSON blocks inside its
 * response. Each block is parsed, validated against the AiPatch zod schema,
 * and rendered as a proposal in the AiPanel. Apply/Discard/Revert is handled
 * with a full before-snapshot stored on the message; Cmd+Z still works
 * because applyPatches commits every change in ONE setState call (zundo's
 * handleSet coalesces it into a single history entry).
 */
import { z } from 'zod';
import type { Edge, Node } from '@xyflow/react';
import type {
  EdgeData,
  NodeData,
  Protocol,
  Tone,
} from '@/types';
import { findCatalogItem } from '@/lib/catalog';
import { useCanvas } from '@/lib/store/canvasStore';
import { uid } from '@/lib/utils';
// Importing the registry here triggers `register()` for every capability —
// dynamic set_* ops are appended to AiPatchSchema below at module load time.
import { capabilityRegistry } from '@/lib/capabilities';

type SDNode = Node<NodeData>;
type SDEdge = Edge<EdgeData>;

const ASYNC_PROTOCOLS: Protocol[] = ['kafka', 'amqp', 'mqtt', 'websocket'];

const VALID_PROTOCOLS: Protocol[] = [
  'rest',
  'grpc',
  'graphql',
  'websocket',
  'signalr',
  'amqp',
  'kafka',
  'mqtt',
  'sql',
  'redis',
  'tcp',
];

/**
 * Common AI/user shortcuts that aren't actual wire protocols. Coerced to
 * the closest real protocol so the patch still validates.
 */
const PROTOCOL_ALIASES: Record<string, Protocol> = {
  sqs: 'amqp',
  sns: 'amqp',
  rabbitmq: 'amqp',
  pubsub: 'amqp',
  http: 'rest',
  https: 'rest',
  json: 'rest',
  ws: 'websocket',
  wss: 'websocket',
  proto: 'grpc',
  protobuf: 'grpc',
  postgres: 'sql',
  mysql: 'sql',
  cassandra: 'sql',
  mongo: 'sql',
  mongodb: 'sql',
  redisproto: 'redis',
};

// Tolerant: known protocol passes through, alias gets coerced, anything
// else is dropped to undefined — the apply step then picks a sensible
// default based on source/target tones.
const ProtocolSchema = z.preprocess((val) => {
  if (typeof val !== 'string') return undefined;
  const lower = val.toLowerCase().trim();
  if ((VALID_PROTOCOLS as string[]).includes(lower)) return lower;
  if (lower in PROTOCOL_ALIASES) return PROTOCOL_ALIASES[lower];
  return undefined;
}, z.enum(VALID_PROTOCOLS as [Protocol, ...Protocol[]]).optional());

const PositionSchema = z
  .object({ x: z.number(), y: z.number() })
  .partial()
  .transform((p) => ({ x: p.x ?? 0, y: p.y ?? 0 }));

const AddNodeSchema = z.object({
  op: z.literal('add_node'),
  type: z.string(), // catalog type id, e.g. "redis"
  label: z.string().optional(),
  meta: z.string().optional(),
  position: PositionSchema.optional(),
  /** Local handle for cross-references in the same patch list. */
  ref: z.string().optional(),
  /** Optional parent group — id, $ref, or label. Position becomes relative. */
  parent: z.string().optional(),
});

const AddEdgeSchema = z.object({
  op: z.literal('add_edge'),
  source: z.string(),
  target: z.string(),
  protocol: ProtocolSchema, // already optional via preprocess
  description: z.string().optional(),
  async: z.boolean().optional(),
});

const AddGroupSchema = z.object({
  op: z.literal('add_group'),
  label: z.string(),
  position: PositionSchema.optional(),
  size: z
    .object({ width: z.number(), height: z.number() })
    .partial()
    .optional(),
  ref: z.string().optional(),
});

const UpdateNodeSchema = z.object({
  op: z.literal('update_node'),
  id: z.string(),
  patch: z.record(z.unknown()),
});

const UpdateEdgeSchema = z.object({
  op: z.literal('update_edge'),
  id: z.string(),
  patch: z.record(z.unknown()),
});

const RemoveNodeSchema = z.object({
  op: z.literal('remove_node'),
  id: z.string(),
});

const RemoveEdgeSchema = z.object({
  op: z.literal('remove_edge'),
  id: z.string(),
});

/**
 * Statik op'lar — type narrowing'ten faydalansın diye discriminatedUnion.
 * Switch/case'te `p.op === 'add_node'` deyince TS `p.type`'ı görür.
 */
const StaticPatchUnion = z.discriminatedUnion('op', [
  AddNodeSchema,
  AddEdgeSchema,
  AddGroupSchema,
  UpdateNodeSchema,
  UpdateEdgeSchema,
  RemoveNodeSchema,
  RemoveEdgeSchema,
]);

/**
 * Capability set_* op'ları registry'den dinamik üretilir. Her capability
 * `{ op: literal('set_<id>'), id: string, value: <cap.schema>, mode? }`
 * şeklinde bir patch op'u olarak AI'a açılır. Yeni capability eklemek =
 * tek satır `register(...)` çağrısı; bu blok değişmiyor (Open/Closed).
 */
/**
 * Recover from a common LLM mistake: emitting capability fields at the top
 * level of the op (`{op, id, protocols: [...]}`) instead of wrapping them
 * under `value` (`{op, id, value: {protocols: [...]}}`).
 *
 * If `value` is missing but the op carries other domain-specific keys (i.e.
 * keys that are not `op` / `id` / `mode` / `value`), bundle them into a
 * synthesised `value` object so the schema parse succeeds.
 */
const META_KEYS = new Set(['op', 'id', 'mode', 'value']);

function coerceCapabilityOp(input: unknown): unknown {
  if (input == null || typeof input !== 'object') return input;
  const obj = input as Record<string, unknown>;
  if ('value' in obj) return input;
  // Synthesize value from leftover keys.
  const synthesised: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (!META_KEYS.has(k)) synthesised[k] = obj[k];
  }
  // No domain keys at all → leave as-is, schema will rightly reject.
  if (Object.keys(synthesised).length === 0) return input;
  return { ...obj, value: synthesised };
}

const DYNAMIC_SET_OP_SCHEMAS = capabilityRegistry.all().map((cap) => ({
  op: cap.patchOp,
  schema: z.preprocess(
    coerceCapabilityOp,
    z.object({
      op: z.literal(cap.patchOp),
      id: z.string(),
      value: cap.schema,
      /** Default capability'nin mergeStrategy'sinden gelir; UI override edebilir. */
      mode: z.enum(['replace', 'augment']).optional(),
    }),
  ),
}));

/**
 * Combined parser: önce static union dener, başarısızsa dinamik set_*
 * şemalarını sırayla dener. Top-level z.union istemiyoruz çünkü TS tuple
 * inference dynamic uzunlukta bozuluyor.
 */
type DynamicSetOp = {
  op: `set_${string}`;
  id: string;
  value: unknown;
  mode?: 'replace' | 'augment';
};

export type AiPatch = z.infer<typeof StaticPatchUnion> | DynamicSetOp;

export const AiPatchSchema = {
  safeParse(input: unknown): { success: true; data: AiPatch } | { success: false; error: { issues: Array<{ message: string }> } } {
    const staticTry = StaticPatchUnion.safeParse(input);
    if (staticTry.success) {
      return { success: true, data: staticTry.data as AiPatch };
    }
    // Dinamik set_* op olabilir mi
    if (
      typeof input === 'object' &&
      input !== null &&
      typeof (input as { op?: unknown }).op === 'string' &&
      ((input as { op: string }).op).startsWith('set_')
    ) {
      const opStr = (input as { op: string }).op;
      const matching = DYNAMIC_SET_OP_SCHEMAS.find((s) => s.op === opStr);
      if (matching) {
        const dyn = matching.schema.safeParse(input);
        if (dyn.success) {
          return { success: true, data: dyn.data as DynamicSetOp };
        }
        return { success: false, error: dyn.error };
      }
      return {
        success: false,
        error: { issues: [{ message: `Unknown capability op "${opStr}"` }] },
      };
    }
    return { success: false, error: staticTry.error };
  },
} as const;

/** Patch op listesi — prompt builder bunu AI'a "destekli op'lar" diye verir. */
export function listKnownOps(): string[] {
  return [
    'add_node',
    'add_edge',
    'add_group',
    'update_node',
    'update_edge',
    'remove_node',
    'remove_edge',
    ...capabilityRegistry.all().map((c) => c.patchOp),
  ];
}

export interface PatchSnapshot {
  nodes: SDNode[];
  edges: SDEdge[];
}

export interface ParsedPatchBlock {
  /** Original raw text (so the panel can hide it from rendered chat). */
  raw: string;
  patches: AiPatch[];
  /** Per-patch validation errors (parse-tolerant — show but skip on apply). */
  errors: string[];
}

// Match every fenced code block; we'll inspect the body to decide if it's a
// patch. Models in the wild use ```sd-patch, ```json, or even just ``` —
// we handle all three.
const ANY_FENCE_RE = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;

/**
 * Common LLM JSON failures, normalized in-place:
 *   - smart quotes (“ ” ‘ ’) → regular quotes
 *   - line + block comments
 *   - trailing commas before } or ]
 *   - // inside JSON values is left alone (only line-leading // stripped)
 *
 * Bu pre-clean'i atladığımızda nemotron/qwen sıkça `// neden` yorumu yazıyor
 * ya da Türkçe metinde " yerine “ basıyordu — `Invalid JSON` hatası buradan
 * geliyordu.
 */
function preCleanJson(input: string): string {
  let s = input;
  // Smart quotes → straight
  s = s.replace(/[“”″]/g, '"');
  s = s.replace(/[‘’′]/g, "'");
  // Block comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments — sadece satır başında ya da boşluktan sonra (URL'leri kırmamak için)
  s = s.replace(/(^|\s)\/\/[^\n]*/g, '$1');
  // Trailing commas
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // Eksik virgül: yan yana iki object/array element. String-aware bir
  // şekilde uyguluyoruz — quote içindeki "} {" patternlerine dokunma.
  s = injectMissingCommas(s);
  return s;
}

/**
 * `}{`, `} {`, `}\n{` gibi yan yana element'lere virgül enjekte eder.
 * AI sıkça uzun array'lerde virgül atlıyor (özellikle inline tek satırda).
 * String içindeki braceler skipleniyor.
 */
function injectMissingCommas(s: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    out += c;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    // c bir element-bitirici mi? (`}` veya `]`)
    if (c === '}' || c === ']') {
      // sonraki anlamlı karakter bir element-başlatıcı mı?
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      if (j < s.length) {
        const next = s[j]!;
        if (next === '{' || next === '[' || next === '"') {
          out += ',';
        }
      }
    }
  }
  return out;
}

/**
 * Best-effort brace/bracket balance repair. AI bazen iç-içe array/object
 * kapanışlarını eksik bırakıyor (örn. tables array'in `]`'ini atlayıp
 * doğrudan dış object'i kapatıyor). Stack'ı yürütüp eksik kapatıcıları
 * doğru sırada ekler. String içindeki brace'lere dokunmaz. Mismatch
 * durumunda (örn. `}` beklerken `]` görüldüğünde) kayıp olduğunu varsayıp
 * önce eksik kapatıcıyı enjekte eder.
 */
function repairBraces(s: string): string {
  let out = '';
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;
  let opened = false;        // ilk container açıldı mı
  let topLevelClosed = false; // ilk container kapandı mı

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;

    // Top-level kapandıktan sonra gelen junk karakterleri ignore et.
    // (AI bazen array kapandıktan sonra ek key/value yazıyor — ör.
    // `[...],"mode":"augment"}]` gibi dangling.)
    if (topLevelClosed) {
      if (/\s/.test(c)) out += c;
      continue;
    }

    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === '\\') {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      out += c;
      inString = !inString;
      continue;
    }
    if (inString) {
      out += c;
      continue;
    }
    if (c === '{' || c === '[') {
      out += c;
      stack.push(c);
      opened = true;
    } else if (c === '}' || c === ']') {
      const expected: '{' | '[' = c === '}' ? '{' : '[';
      // Eşleşene kadar stack'i pop et; pop edilen her yanlış kapatıcıyı önce yaz.
      while (stack.length > 0 && stack[stack.length - 1] !== expected) {
        const wrong = stack.pop();
        out += wrong === '{' ? '}' : ']';
      }
      if (stack.length > 0) {
        stack.pop();
        out += c;
      }
      // else: unmatched closer — drop it (extra `}` veya `]`).
      if (opened && stack.length === 0) {
        topLevelClosed = true;
      }
    } else {
      out += c;
    }
  }
  // Hâlâ açık kalanları kapat.
  while (stack.length > 0) {
    const top = stack.pop();
    out += top === '{' ? '}' : ']';
  }
  return out;
}

/**
 * Greedy {...} object extractor — string içindeki `{`/`}` karakterlerini
 * sayma sırasında atlar. Aksi halde `{"path": "/api/{id}"}` gibi payload'lar
 * derinlik sayacını bozardı.
 */
function extractTopLevelObjects(s: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

let lastJsonError: string | null = null;

/** Son `parseLenientJson` çağrısının ham hatasını döndürür — debug/UI için. */
export function getLastJsonError(): string | null {
  return lastJsonError;
}

/**
 * Tries to read the body as either a JSON array, a single JSON object, or a
 * sequence of objects on consecutive lines (no commas/brackets — common
 * model failure mode). Returns parsed array or null.
 */
function parseLenientJson(body: string): unknown[] | null {
  lastJsonError = null;
  const cleaned = preCleanJson(body).trim();
  if (!cleaned) return null;

  // 1. Try as-is (array or single object).
  try {
    const v = JSON.parse(cleaned);
    return Array.isArray(v) ? v : [v];
  } catch (e) {
    lastJsonError = (e as Error).message;
  }

  // 2. Wrap in [] if the body looks like newline/comma separated objects.
  if (/^\s*\{/.test(cleaned) && /\}\s*$/.test(cleaned)) {
    const joined = `[${cleaned.replace(/\}\s*[\n,]+\s*\{/g, '},{')}]`;
    try {
      const v = JSON.parse(joined);
      if (Array.isArray(v)) return v;
    } catch (e) {
      lastJsonError = (e as Error).message;
    }
  }

  // 3. Brace repair fallback — eksik `}` / `]` kapatıcılarını ekle.
  const repaired = repairBraces(cleaned);
  if (repaired !== cleaned) {
    try {
      const v = JSON.parse(repaired);
      return Array.isArray(v) ? v : [v];
    } catch (e) {
      lastJsonError = (e as Error).message;
    }
  }

  // 4. Greedy {...} extraction — string-aware.
  const candidates = extractTopLevelObjects(repaired);
  const objects: unknown[] = [];
  for (const slice of candidates) {
    try {
      objects.push(JSON.parse(slice));
    } catch {
      /* skip individual */
    }
  }
  return objects.length > 0 ? objects : null;
}

/** True if a parsed value looks patch-shaped (has the `op` discriminator). */
function looksLikePatch(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { op?: unknown }).op === 'string'
  );
}

/**
 * Parses every fenced block. Recognizes ` ```sd-patch `, ` ```json `, and
 * unlabeled fences if their body parses to objects with an `op` field. This
 * tolerance is essential — local models routinely emit ```json instead of
 * the documented ```sd-patch fence.
 *
 * We track which fences were patch-bearing so the chat renderer can hide
 * exactly those (and not other innocent JSON blocks).
 */
export function parsePatches(text: string): ParsedPatchBlock[] {
  const out: ParsedPatchBlock[] = [];
  for (const match of text.matchAll(ANY_FENCE_RE)) {
    const raw = match[0];
    const fenceLang = (match[1] ?? '').toLowerCase();
    const body = match[2] ?? '';

    const explicitPatchFence = fenceLang === 'sd-patch';
    const candidate = parseLenientJson(body);

    // Skip non-patch blocks (regular code samples, plain text, etc.).
    if (!explicitPatchFence) {
      if (!candidate || candidate.length === 0) continue;
      if (!candidate.some(looksLikePatch)) continue;
    }

    const errors: string[] = [];
    const patches: AiPatch[] = [];
    if (!candidate) {
      const detail = getLastJsonError();
      errors.push(
        `Invalid JSON inside fenced block${detail ? ` — ${detail}` : ''}`,
      );
      out.push({ raw, patches, errors });
      continue;
    }
    for (let i = 0; i < candidate.length; i++) {
      const r = AiPatchSchema.safeParse(candidate[i]);
      if (r.success) patches.push(r.data);
      else {
        // Path bilgisini de yaz — kullanıcı hangi alanın eksik olduğunu
        // doğrudan görebilsin (örn. "value.tables.0.columns.0.type=Required").
        // Konsola tam input'u da basıyoruz ki AI çıktısı debug edilebilsin.
        // eslint-disable-next-line no-console
        console.warn('[sd-patch] op #' + i + ' validation failed:', candidate[i], r.error.issues);
        const issueText = r.error.issues
          .map((x) => {
            const path =
              (x as { path?: ReadonlyArray<PropertyKey> }).path?.join('.') ||
              '<root>';
            return `${path}=${x.message}`;
          })
          .join('; ');
        errors.push(`#${i}: ${issueText}`);
      }
    }
    out.push({ raw, patches, errors });
  }
  return out;
}

/**
 * Strips every fence we recognized as patch-bearing so the chat doesn't
 * show raw JSON to the user. Non-patch fences (regular code) are kept.
 */
export function stripPatchFences(text: string): string {
  let out = text;
  const blocks = parsePatches(text);
  for (const b of blocks) {
    if (b.patches.length > 0 || b.errors.length > 0) {
      out = out.replace(b.raw, '');
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/* -------------------------------------------------------------------------- */
/*                              apply / revert                                */
/* -------------------------------------------------------------------------- */

interface ApplyContext {
  nodes: SDNode[];
  edges: SDEdge[];
  refMap: Map<string, string>;
  lastNodeId: string | null;
  warnings: string[];
}

/** Slugify: "Meeting Service" → "meeting-service", non-alnum → "-". */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveRef(token: string, ctx: ApplyContext): string | null {
  if (!token) return null;
  if (token === '$last') return ctx.lastNodeId;
  if (token.startsWith('$')) {
    const name = token.slice(1);
    const fromRef = ctx.refMap.get(name);
    if (fromRef) return fromRef;
    // Fallback: many models stick `$` in front of existing node ids by
    // mistake. If the bare name (or any prefix-match id) exists, accept it.
    return resolveRef(name, ctx);
  }
  // Exact id match
  if (ctx.nodes.some((n) => n.id === token)) return token;
  // Prefix match — model often shortens "postgres-abc123" to "postgres".
  const byPrefix = ctx.nodes.find(
    (n) => n.id.startsWith(`${token}-`) || n.data?.label === token,
  );
  if (byPrefix) return byPrefix.id;
  // Slug match — AI sıkça label'ı kebab-case olarak yazıyor
  // ("auth-svc" / "meeting-service") ama bu ne id ne tam label.
  // Hem label hem id slugify edilip token slug'iyla karşılaştırılır.
  const tokenSlug = slugify(token);
  if (!tokenSlug) return null;
  const bySlug = ctx.nodes.find((n) => {
    const labelSlug = n.data?.label ? slugify(n.data.label) : '';
    const idSlug = slugify(n.id);
    return (
      labelSlug === tokenSlug ||
      idSlug === tokenSlug ||
      // Kısaltma fuzzy: "auth-svc" === "auth-service" ya da tam içine düşüyor mu
      labelSlug.startsWith(tokenSlug) ||
      tokenSlug.startsWith(labelSlug) ||
      idSlug.startsWith(tokenSlug)
    );
  });
  return bySlug ? bySlug.id : null;
}

function defaultProtocolFor(
  source: SDNode | undefined,
  target: SDNode | undefined,
): Protocol {
  const tones: Tone[] = [
    source?.data.tone as Tone,
    target?.data.tone as Tone,
  ].filter(Boolean);
  if (tones.includes('queue')) return 'kafka';
  if (tones.includes('data')) return 'sql';
  if (tones.includes('cache')) return 'redis';
  return 'rest';
}

function buildNodeFromPatch(
  p: z.infer<typeof AddNodeSchema>,
  position: { x: number; y: number },
): SDNode | null {
  const item = findCatalogItem(p.type);
  if (!item) return null;
  const id = uid(item.type);
  const protocol = item.supportedProtocols?.[0] ?? 'rest';
  const caps = new Set(item.capabilities ?? []);
  const node: SDNode = {
    id,
    type: 'sd',
    position,
    data: {
      type: item.type,
      category: item.category,
      tone: item.tone,
      label: p.label ?? item.label,
      meta: p.meta ?? item.description,
      config: { ...(item.defaultConfig ?? {}) },
      ...(caps.has('schema') ? { schema: { tables: [] } } : {}),
      ...(caps.has('api')
        ? { api: { protocols: [{ kind: protocol, endpoints: [] }] } }
        : {}),
      ...(caps.has('consuming')
        ? { consuming: { handler: '', concurrency: 1 } }
        : {}),
      ...(caps.has('scheduled') ? { scheduled: { schedule: '' } } : {}),
      ...(caps.has('producing') ? { producing: { events: [] } } : {}),
      ...(item.hasMockupEditor ? { mockup: { screens: [] } } : {}),
    },
  };
  return node;
}

/**
 * Picks a free position near existing nodes — naive: drops new nodes in a
 * column to the right of the rightmost node, with vertical stacking by index.
 */
function findEmptyPosition(
  existing: SDNode[],
  index: number,
): { x: number; y: number } {
  if (existing.length === 0) {
    return { x: 120 + index * 220, y: 120 };
  }
  const maxX = Math.max(...existing.map((n) => n.position.x));
  return { x: maxX + 260, y: 100 + index * 140 };
}

/**
 * Applies a list of patches atomically. Single setState ⇒ single zundo
 * history entry (Cmd+Z reverts the whole thing).
 *
 * Returns the BEFORE snapshot so the caller (AiPanel) can persist it on the
 * assistant message and offer "Revert" later, even after other edits.
 */
export function applyPatches(
  patches: AiPatch[],
  /**
   * Optional human-readable rationale extracted from the assistant message.
   * Used as the version-history label and the toast text so the user sees
   * "why" not just "what". Falls back to a counts-only summary when omitted.
   */
  reasonHint?: string,
): {
  snapshot: PatchSnapshot;
  applied: number;
  warnings: string[];
} {
  const state = useCanvas.getState();
  // Deep clone so subsequent xyflow mutations (drag, resize, measured field)
  // don't bleed into the snapshot we'll use for revert.
  const deepClone = <T>(v: T): T =>
    typeof structuredClone === 'function'
      ? structuredClone(v)
      : (JSON.parse(JSON.stringify(v)) as T);
  const snapshot: PatchSnapshot = {
    nodes: deepClone(state.nodes),
    edges: deepClone(state.edges),
  };

  const ctx: ApplyContext = {
    nodes: [...state.nodes],
    edges: [...state.edges],
    refMap: new Map(),
    lastNodeId: null,
    warnings: [],
  };

  let applied = 0;
  let nodeIndex = 0;

  for (const p of patches) {
    // Capability set_* op'ları — registry'den dispatch edilir. Locked node
    // guard, capability.appliesTo runtime kontrolü ve merge stratejisi
    // burada uygulanır. Switch'in dışında çünkü dynamic literal'lar tip
    // sisteminde discriminator olarak görünmüyor.
    if (typeof p.op === 'string' && p.op.startsWith('set_')) {
      const cap = capabilityRegistry.byPatchOp(p.op);
      if (!cap) {
        ctx.warnings.push(`unknown capability op "${p.op}"`);
        continue;
      }
      const dyn = p as unknown as {
        id: string;
        value: unknown;
        mode?: 'replace' | 'augment';
      };
      // resolveRef → exact id, prefix-id, label, ya da `$ref`. AI sıkça
      // "postgres-abc123" yerine "postgres" ya da label yazıyor.
      const resolvedId = resolveRef(dyn.id, ctx);
      const idx = resolvedId
        ? ctx.nodes.findIndex((n) => n.id === resolvedId)
        : -1;
      if (idx === -1) {
        ctx.warnings.push(`${p.op}: node "${dyn.id}" not found`);
        continue;
      }
      const node = ctx.nodes[idx]!;
      if (!cap.appliesTo(node.data)) {
        ctx.warnings.push(
          `${p.op}: not valid on type "${node.data.type}" — skipped`,
        );
        continue;
      }
      if (node.data.locked) {
        ctx.warnings.push(`${p.op}: node "${dyn.id}" locked, skipped`);
        continue;
      }
      const effectiveMode = dyn.mode ?? cap.mergeStrategy;
      const finalValue =
        effectiveMode === 'augment' && cap.merge
          ? cap.merge(
              cap.read(node.data) as never,
              dyn.value as never,
            )
          : dyn.value;
      const nextData = cap.write(node.data, finalValue as never);
      ctx.nodes[idx] = { ...node, data: nextData };
      applied++;
      continue;
    }

    switch (p.op) {
      case 'add_node': {
        // Idempotency: aynı type + aynı slugified-label zaten canvas'taysa
        // YENİ node yaratma; mevcut id'yi ref'e bağla. Bu sayede AI'nın
        // patch'ini birden fazla kez Apply etmek duplicate yaratmaz, ve
        // yarım kalmış önceki refactor denemesi üstüne yenisini sürmek
        // güvenli olur.
        const existing = ctx.nodes.find((n) => {
          if (n.type !== 'sd') return false;
          if (n.data?.type !== p.type) return false;
          const incomingSlug = slugify(p.label ?? '');
          const existingSlug = slugify(n.data?.label ?? '');
          return incomingSlug !== '' && incomingSlug === existingSlug;
        });
        if (existing) {
          if (p.ref) ctx.refMap.set(p.ref, existing.id);
          ctx.lastNodeId = existing.id;
          ctx.warnings.push(
            `add_node: "${p.label ?? p.type}" already exists, reusing the existing node`,
          );
          break;
        }

        let pos = p.position ?? findEmptyPosition(ctx.nodes, nodeIndex++);

        // Resolve parent group: explicit `parent` field wins; otherwise
        // detect by hit-testing the absolute position against group bboxes.
        let parentId: string | undefined;
        if (p.parent) {
          parentId = resolveRef(p.parent, ctx) ?? undefined;
          const parentNode = parentId
            ? ctx.nodes.find((n) => n.id === parentId)
            : null;
          if (parentNode?.type !== 'group') parentId = undefined;
        } else {
          // Auto-detect: if pos lands inside a group's bbox, attach to it.
          const hit = ctx.nodes.find((n) => {
            if (n.type !== 'group') return false;
            const w =
              (n.style as { width?: number } | undefined)?.width ??
              (n as { measured?: { width?: number } }).measured?.width ??
              480;
            const h =
              (n.style as { height?: number } | undefined)?.height ??
              (n as { measured?: { height?: number } }).measured?.height ??
              200;
            return (
              pos.x >= n.position.x &&
              pos.x <= n.position.x + w &&
              pos.y >= n.position.y &&
              pos.y <= n.position.y + h
            );
          });
          if (hit) parentId = hit.id;
        }

        // Convert absolute position to parent-relative when attaching.
        if (parentId) {
          const parent = ctx.nodes.find((n) => n.id === parentId)!;
          pos = {
            x: pos.x - parent.position.x,
            y: pos.y - parent.position.y,
          };
        }

        const node = buildNodeFromPatch(p, pos);
        if (!node) {
          ctx.warnings.push(`Unknown catalog type "${p.type}"`);
          break;
        }
        if (parentId) {
          node.parentId = parentId;
          // `extent: 'parent'` koymuyoruz: kullanıcı node'u parent dışına
          // sürükleyebilmeli. onNodeDragStop drop'ta parent'ı yeniden
          // hesaplıyor (canvas dışına çıkarsa parentId = undefined).
        }
        ctx.nodes.push(node);
        ctx.lastNodeId = node.id;
        if (p.ref) ctx.refMap.set(p.ref, node.id);
        applied++;
        break;
      }
      case 'add_group': {
        const id = uid('group');
        const node = {
          id,
          type: 'group',
          position: p.position ?? { x: 100, y: 100 },
          style: {
            width: p.size?.width ?? 480,
            height: p.size?.height ?? 200,
          },
          data: { label: p.label, tone: 'edge' },
        } as SDNode;
        // Groups must come BEFORE children in the array (xyflow render order).
        ctx.nodes = [node, ...ctx.nodes];
        if (p.ref) ctx.refMap.set(p.ref, id);
        applied++;
        break;
      }
      case 'add_edge': {
        const source = resolveRef(p.source, ctx);
        const target = resolveRef(p.target, ctx);
        if (!source || !target) {
          ctx.warnings.push(
            `add_edge: cannot resolve "${p.source}" → "${p.target}"`,
          );
          break;
        }
        const sNode = ctx.nodes.find((n) => n.id === source);
        const tNode = ctx.nodes.find((n) => n.id === target);
        const protocol: Protocol =
          p.protocol ?? defaultProtocolFor(sNode, tNode);
        const data: EdgeData = {
          protocol,
          async: p.async ?? ASYNC_PROTOCOLS.includes(protocol),
          ...(p.description ? { description: p.description } : {}),
        };
        ctx.edges.push({
          id: uid('edge'),
          source,
          target,
          type: 'protocol',
          data,
        });
        applied++;
        break;
      }
      case 'update_node': {
        const idx = ctx.nodes.findIndex((n) => n.id === p.id);
        if (idx === -1) {
          ctx.warnings.push(`update_node: node "${p.id}" not found`);
          break;
        }
        const cur = ctx.nodes[idx]!;
        if (cur.data.locked) {
          ctx.warnings.push(`update_node: "${p.id}" locked, skipped`);
          break;
        }
        ctx.nodes[idx] = {
          ...cur,
          data: { ...cur.data, ...(p.patch as Partial<NodeData>) },
        };
        applied++;
        break;
      }
      case 'update_edge': {
        const idx = ctx.edges.findIndex((e) => e.id === p.id);
        if (idx === -1) {
          ctx.warnings.push(`update_edge: edge "${p.id}" not found`);
          break;
        }
        const cur = ctx.edges[idx]!;
        ctx.edges[idx] = {
          ...cur,
          data: {
            ...((cur.data as EdgeData) ?? { protocol: 'rest' }),
            ...(p.patch as Partial<EdgeData>),
          },
        };
        applied++;
        break;
      }
      case 'remove_node': {
        const resolvedId = resolveRef(p.id, ctx);
        const target = resolvedId
          ? ctx.nodes.find((n) => n.id === resolvedId)
          : null;
        if (!target) {
          ctx.warnings.push(`remove_node: node "${p.id}" not found`);
          break;
        }
        if (target.data?.locked) {
          ctx.warnings.push(`remove_node: "${p.id}" locked, skipped`);
          break;
        }
        const tid = target.id;
        ctx.nodes = ctx.nodes.filter((n) => n.id !== tid);
        ctx.edges = ctx.edges.filter(
          (e) => e.source !== tid && e.target !== tid,
        );
        applied++;
        break;
      }
      case 'remove_edge': {
        const before = ctx.edges.length;
        // Edge için resolveRef yok — id strict beklenir; ama AI bazen source-target
        // ikilisini referansla yazabiliyor. Şimdilik strict tutuyoruz.
        ctx.edges = ctx.edges.filter((e) => e.id !== p.id);
        if (ctx.edges.length === before) {
          ctx.warnings.push(`remove_edge: edge "${p.id}" not found`);
        } else {
          applied++;
        }
        break;
      }
    }
  }

  // ONE setState = ONE history entry (zundo handleSet coalesce).
  useCanvas.getState().applyAtomic({ nodes: ctx.nodes, edges: ctx.edges });

  // Kalıcı versiyon geçmişine de yaz — kullanıcı sonradan revert proposal'ı
  // kapatsa bile bu satır History panelinden geri yüklenebilir kalır.
  if (applied > 0) {
    const counts = summarizePatches(patches, applied);
    const trimmedReason =
      reasonHint && reasonHint.trim().length > 0
        ? reasonHint.trim().slice(0, 140)
        : '';
    // Label = the AI's "why" if available; fall back to op counts.
    const label = trimmedReason ? `AI: ${trimmedReason}` : counts;
    // Summary keeps both: the rationale (if any) plus the op counts so the
    // version-history row can show structure detail too.
    const summary = trimmedReason ? `${trimmedReason} — ${counts}` : counts;
    void recordAiPatchVersion(label, summary);
  }

  return { snapshot, applied, warnings: ctx.warnings };
}

function summarizePatches(patches: AiPatch[], applied: number): string {
  const counts = new Map<string, number>();
  for (const p of patches) {
    const key = String(p.op);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([op, n]) => `${n}× ${op}`);
  return `AI: ${applied} op(s) (${parts.join(', ')})`;
}

async function recordAiPatchVersion(
  label: string,
  summary: string,
): Promise<void> {
  try {
    const mod = await import('@/lib/persistence/versionRecorder');
    await mod.getRecorder()?.recordAuto('ai-patch', label, summary);
  } catch (err) {
    console.warn('ai-patch version record failed', err);
  }
}

/**
 * Restores the canvas to a previously captured snapshot. Single setState
 * call so undo/redo treat it as one atomic action. Deep-clones so the
 * snapshot stays usable across multiple revert/re-apply cycles.
 */
export function revertToSnapshot(snap: PatchSnapshot): void {
  const clone = <T>(v: T): T =>
    typeof structuredClone === 'function'
      ? structuredClone(v)
      : (JSON.parse(JSON.stringify(v)) as T);
  useCanvas.getState().applyAtomic({
    nodes: clone(snap.nodes),
    edges: clone(snap.edges),
  });
}

/** Human-readable line for a patch — used in the AiPanel proposal card. */
export function describePatch(p: AiPatch): string {
  // Dynamic capability set_* op — surface a payload digest so the user can
  // tell at a glance whether the model actually changed something. The old
  // generic `~ api on api (replace)` line gave no signal when the AI sent
  // an empty `{ protocols: [] }` and silently wiped the existing config.
  if (typeof p.op === 'string' && p.op.startsWith('set_')) {
    const dyn = p as unknown as { id: string; mode?: string; value: unknown };
    const capName = p.op.slice(4);
    const modeTag = dyn.mode ? ` · ${dyn.mode}` : '';
    const digest = summarizeCapabilityValue(capName, dyn.value);
    return `~ ${capName} on ${dyn.id}${modeTag}${digest ? ` — ${digest}` : ''}`;
  }
  switch (p.op) {
    case 'add_node':
      return `+ node ${p.label ?? p.type} (${p.type})`;
    case 'add_group':
      return `+ group "${p.label}"`;
    case 'add_edge':
      return `+ edge ${p.source} → ${p.target}${p.protocol ? ` (${p.protocol})` : ''}`;
    case 'update_node':
      return `~ node ${p.id}`;
    case 'update_edge':
      return `~ edge ${p.id}`;
    case 'remove_node':
      return `− node ${p.id}`;
    case 'remove_edge':
      return `− edge ${p.id}`;
    default:
      return (p as { op?: string }).op ?? '?';
  }
}

/**
 * Summarises a capability `value` payload as a short digest like
 * `2 protocols · 7 endpoints` or `cap=CP, replicas=3`. Lets the proposal
 * card and toast carry actionable feedback even for replace-mode patches
 * that *clear* state.
 */
function summarizeCapabilityValue(capName: string, value: unknown): string {
  if (value == null || typeof value !== 'object') return '';
  const v = value as Record<string, unknown>;
  const parts: string[] = [];

  if (capName === 'schema') {
    const tables = Array.isArray(v.tables) ? v.tables : [];
    const cols = tables.reduce(
      (acc: number, t) =>
        acc + (Array.isArray((t as { columns?: unknown[] }).columns)
          ? (t as { columns: unknown[] }).columns.length
          : 0),
      0,
    );
    parts.push(`${tables.length} table${tables.length === 1 ? '' : 's'}`);
    if (cols > 0) parts.push(`${cols} cols`);
  } else if (capName === 'api') {
    const protocols = Array.isArray(v.protocols)
      ? v.protocols
      : Array.isArray(v.endpoints)
        ? [
            {
              kind:
                typeof v.kind === 'string'
                  ? v.kind
                  : typeof v.protocol === 'string'
                    ? v.protocol
                    : 'rest',
              endpoints: v.endpoints,
            },
          ]
        : [];
    const endpoints = protocols.reduce(
      (acc: number, p) =>
        acc + (Array.isArray((p as { endpoints?: unknown[] }).endpoints)
          ? (p as { endpoints: unknown[] }).endpoints.length
          : 0),
      0,
    );
    parts.push(`${protocols.length} protocol${protocols.length === 1 ? '' : 's'}`);
    parts.push(`${endpoints} endpoint${endpoints === 1 ? '' : 's'}`);
  } else if (capName === 'producing') {
    const events = Array.isArray(v.events) ? v.events : [];
    parts.push(`${events.length} event${events.length === 1 ? '' : 's'}`);
  } else if (capName === 'consuming') {
    if (typeof v.handler === 'string' && v.handler) parts.push(`handler=${v.handler}`);
    if (v.sourceNodeId) parts.push(`from=${v.sourceNodeId}`);
    if (typeof v.concurrency === 'number') parts.push(`x${v.concurrency}`);
  } else if (capName === 'scheduled') {
    if (typeof v.schedule === 'string' && v.schedule) parts.push(v.schedule);
    if (typeof v.handler === 'string' && v.handler) parts.push(v.handler);
  } else if (capName === 'reliability') {
    if (typeof v.cap === 'string') parts.push(`cap=${v.cap}`);
    if (typeof v.consistencyModel === 'string')
      parts.push(`consistency=${v.consistencyModel}`);
    if (typeof v.replicas === 'number') parts.push(`replicas=${v.replicas}`);
    if (typeof v.redundancy === 'string' && v.redundancy !== 'none')
      parts.push(v.redundancy);
    const slo = v.slo as Record<string, unknown> | undefined;
    if (slo && typeof slo.latencyP99Ms === 'number')
      parts.push(`p99=${slo.latencyP99Ms}ms`);
    const fm = Array.isArray(v.failureModes) ? v.failureModes.length : 0;
    if (fm > 0) parts.push(`${fm} fail-mode${fm === 1 ? '' : 's'}`);
  }

  // If we still have nothing useful, surface "empty" explicitly so a
  // replace-mode wipe is obvious.
  if (parts.length === 0) {
    const isEmpty =
      Object.keys(v).length === 0 ||
      Object.values(v).every(
        (x) => x == null || (Array.isArray(x) && x.length === 0),
      );
    return isEmpty ? 'empty payload' : '';
  }
  return parts.join(' · ');
}
