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

type SDNode = Node<NodeData>;
type SDEdge = Edge<EdgeData>;

const ASYNC_PROTOCOLS: Protocol[] = ['kafka', 'amqp', 'mqtt', 'websocket'];

const ProtocolSchema = z.enum([
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
]);

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
});

const AddEdgeSchema = z.object({
  op: z.literal('add_edge'),
  source: z.string(),
  target: z.string(),
  protocol: ProtocolSchema.optional(),
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

export const AiPatchSchema = z.discriminatedUnion('op', [
  AddNodeSchema,
  AddEdgeSchema,
  AddGroupSchema,
  UpdateNodeSchema,
  UpdateEdgeSchema,
  RemoveNodeSchema,
  RemoveEdgeSchema,
]);

export type AiPatch = z.infer<typeof AiPatchSchema>;

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
 * Tries to read the body as either a JSON array, a single JSON object, or a
 * sequence of objects on consecutive lines (no commas/brackets — common
 * model failure mode). Returns parsed array or null.
 */
function parseLenientJson(body: string): unknown[] | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  // 1. Try as-is (array or single object).
  try {
    const v = JSON.parse(trimmed);
    return Array.isArray(v) ? v : [v];
  } catch {
    /* fallthrough */
  }

  // 2. Wrap in [] if the body looks like newline/comma separated objects.
  //    `}{` between objects → insert comma; then wrap.
  if (/^\s*\{/.test(trimmed) && /\}\s*$/.test(trimmed)) {
    const joined = `[${trimmed.replace(/\}\s*\n+\s*\{/g, '},\n{')}]`;
    try {
      const v = JSON.parse(joined);
      if (Array.isArray(v)) return v;
    } catch {
      /* fallthrough */
    }
  }

  // 3. Last resort: extract every {...} substring greedily and parse each.
  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          objects.push(JSON.parse(trimmed.slice(start, i + 1)));
        } catch {
          /* skip */
        }
        start = -1;
      }
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
      errors.push('Invalid JSON inside fenced block');
      out.push({ raw, patches, errors });
      continue;
    }
    for (let i = 0; i < candidate.length; i++) {
      const r = AiPatchSchema.safeParse(candidate[i]);
      if (r.success) patches.push(r.data);
      else
        errors.push(
          `#${i}: ${r.error.issues.map((x) => x.message).join('; ')}`,
        );
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
  return byPrefix ? byPrefix.id : null;
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
      ...(item.hasSchemaEditor ? { schema: { tables: [] } } : {}),
      ...(item.hasApiEditor
        ? { api: { protocols: [{ kind: protocol, endpoints: [] }] } }
        : {}),
      ...(item.hasConsumerEditor
        ? { consumer: { handler: '', concurrency: 1 } }
        : {}),
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
export function applyPatches(patches: AiPatch[]): {
  snapshot: PatchSnapshot;
  applied: number;
  warnings: string[];
} {
  const state = useCanvas.getState();
  const snapshot: PatchSnapshot = {
    nodes: state.nodes.map((n) => ({ ...n, data: { ...n.data } })),
    edges: state.edges.map((e) => ({
      ...e,
      data: e.data ? { ...e.data } : undefined,
    })),
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
    switch (p.op) {
      case 'add_node': {
        const pos = p.position ?? findEmptyPosition(ctx.nodes, nodeIndex++);
        const node = buildNodeFromPatch(p, pos);
        if (!node) {
          ctx.warnings.push(`Unknown catalog type "${p.type}"`);
          break;
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
        const before = ctx.nodes.length;
        ctx.nodes = ctx.nodes.filter((n) => n.id !== p.id);
        ctx.edges = ctx.edges.filter(
          (e) => e.source !== p.id && e.target !== p.id,
        );
        if (ctx.nodes.length === before) {
          ctx.warnings.push(`remove_node: node "${p.id}" not found`);
        } else {
          applied++;
        }
        break;
      }
      case 'remove_edge': {
        const before = ctx.edges.length;
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

  return { snapshot, applied, warnings: ctx.warnings };
}

/**
 * Restores the canvas to a previously captured snapshot. Single setState
 * call so undo/redo treat it as one atomic action.
 */
export function revertToSnapshot(snap: PatchSnapshot): void {
  useCanvas.getState().applyAtomic({
    nodes: snap.nodes,
    edges: snap.edges,
  });
}

/** Human-readable line for a patch — used in the AiPanel proposal card. */
export function describePatch(p: AiPatch): string {
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
  }
}
