import { z } from 'zod';
import type { NodeData, ReliabilitySpec, Tone } from '@/types';
import type { NodeCapability } from './types';
import { RELIABILITY_TONES } from './reliabilityDefaults';

/**
 * Local LLMs (4-8B class on LM Studio) routinely write reliability fields
 * "their own way" — `'active-active-sync-replication'` instead of the canonical
 * `'active-active'`, `[{name, description}]` instead of plain strings, etc.
 * Strict enums would just reject those patches and the user would see "0
 * change(s) proposed" with parse errors. The schema below is therefore built
 * with `z.preprocess` coercions:
 *
 *  - String enums fuzzy-match against canonical values (substring + alias map).
 *  - Object-shaped `failureModes` are flattened to strings.
 *  - Number-as-string SLO inputs (`"0.999"`) are converted via Number().
 *
 * Coercions are confined to the schema layer; downstream consumers (AI prompt,
 * Inspector, scorer) only ever see canonical values.
 */

const CAP_ALIASES: Record<string, ReliabilitySpec['cap']> = {
  cp: 'CP',
  consistent: 'CP',
  consistency: 'CP',
  ap: 'AP',
  available: 'AP',
  availability: 'AP',
  ca: 'CA',
  'consistency-availability': 'CA',
};

function coerceCap(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const norm = v.toLowerCase().replace(/[\s_]/g, '-');
  return CAP_ALIASES[norm] ?? v.toUpperCase();
}

const CapEnum = z.preprocess(coerceCap, z.enum(['CP', 'AP', 'CA']));

const PACELC_VALUES = ['PA/EL', 'PA/EC', 'PC/EL', 'PC/EC'] as const;

function coercePacelc(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const norm = v.toUpperCase().replace(/[\s_-]/g, '/');
  // Accept "PAEL", "PA EL", "PA-EL" etc.
  if (/^P[AC]\/?E[LC]$/.test(norm)) {
    const compact = norm.replace('/', '');
    return `${compact[0]}${compact[1]}/${compact[2]}${compact[3]}`;
  }
  return v;
}

const PacelcEnum = z.preprocess(coercePacelc, z.enum(PACELC_VALUES));

const CONSISTENCY_ALIASES: Record<string, ReliabilitySpec['consistencyModel']> =
  {
    strong: 'strong',
    'strongly-consistent': 'strong',
    linearizable: 'strong',
    sequential: 'strong',
    eventual: 'eventual',
    'eventually-consistent': 'eventual',
    'eventual-consistency': 'eventual',
    weak: 'eventual',
    causal: 'causal',
    'causal-consistency': 'causal',
    'read-your-writes': 'read-your-writes',
    'read-after-write': 'read-your-writes',
    'session-consistency': 'read-your-writes',
    monotonic: 'read-your-writes',
  };

function coerceConsistency(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const norm = v.toLowerCase().replace(/[\s_]/g, '-');
  return CONSISTENCY_ALIASES[norm] ?? v;
}

const ConsistencyEnum = z.preprocess(
  coerceConsistency,
  z.enum(['strong', 'eventual', 'causal', 'read-your-writes']),
);

/**
 * Redundancy is the alias hot-spot — LLMs love to invent compound forms like
 * `'active-active-sync-replication'`, `'multi-region-active-active'`,
 * `'master-slave'`, `'primary-replica'`. We collapse anything containing the
 * recognisable substrings into the canonical four values.
 */
function coerceRedundancy(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const norm = v.toLowerCase().replace(/[\s_]/g, '-');
  if (norm === '' || norm.includes('none') || norm.includes('single'))
    return 'none';
  if (
    norm.includes('multi-region') ||
    norm.includes('cross-region') ||
    norm.includes('multi-az') ||
    norm.includes('global')
  )
    return 'multi-region';
  if (norm.includes('active-active') || norm.includes('multi-master'))
    return 'active-active';
  if (
    norm.includes('active-passive') ||
    norm.includes('master-slave') ||
    norm.includes('primary-replica') ||
    norm.includes('primary-secondary') ||
    norm.includes('hot-standby') ||
    norm.includes('cold-standby') ||
    norm.includes('failover')
  )
    return 'active-passive';
  return v;
}

const RedundancyEnum = z.preprocess(
  coerceRedundancy,
  z.enum(['none', 'active-passive', 'active-active', 'multi-region']),
);

/**
 * Coerces "0.999" / "200" / 200 → number; rejects nonsense.
 */
function coerceNum(v: unknown): unknown {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return v;
}

const SloSchema = z.object({
  latencyP99Ms: z.preprocess(coerceNum, z.number().nonnegative()).optional(),
  availability: z
    .preprocess(coerceNum, z.number().min(0).max(1))
    .optional(),
  rpsTarget: z.preprocess(coerceNum, z.number().nonnegative()).optional(),
});

/**
 * Flattens any non-string failure mode entry into a one-line string. Common
 * shapes the model emits: `{name, description}`, `{title, impact}`, plain
 * objects with arbitrary keys.
 */
function coerceFailureMode(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const name =
      typeof obj.name === 'string'
        ? obj.name
        : typeof obj.title === 'string'
          ? obj.title
          : typeof obj.mode === 'string'
            ? obj.mode
            : null;
    const desc =
      typeof obj.description === 'string'
        ? obj.description
        : typeof obj.impact === 'string'
          ? obj.impact
          : typeof obj.detail === 'string'
            ? obj.detail
            : null;
    if (name && desc) return `${name}: ${desc}`;
    if (name) return name;
    if (desc) return desc;
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }
  return null;
}

const FailureModesSchema = z.preprocess((v) => {
  if (!Array.isArray(v)) return v;
  return v.map(coerceFailureMode).filter((s): s is string => s !== null);
}, z.array(z.string()));

// `z.preprocess(...)` produces a schema whose input is `unknown`, which
// doesn't structurally line up with `ZodType<ReliabilitySpec>` (which
// expects the input to already match the output shape). Casting through
// `unknown` is fine here — the schema's parse output is still typed.
export const ReliabilitySchema = z.object({
  cap: CapEnum.optional(),
  pacelc: PacelcEnum.optional(),
  consistencyModel: ConsistencyEnum.optional(),
  slo: SloSchema.optional(),
  replicas: z.preprocess(coerceNum, z.number().int().nonnegative()).optional(),
  redundancy: RedundancyEnum.optional(),
  failureModes: FailureModesSchema.optional(),
}) as unknown as z.ZodType<ReliabilitySpec>;

/**
 * `reliability` capability — applies to data/service/cache/queue/ai tones.
 * Tone-driven `appliesTo` (instead of catalog-driven) so the capability is
 * available on every node that participates in a CAP/SLO trade-off without
 * touching the catalog.
 */
export const reliabilityCapability: NodeCapability<ReliabilitySpec> = {
  id: 'reliability',
  label: 'Reliability',
  patchOp: 'set_reliability',
  schema: ReliabilitySchema,
  mergeStrategy: 'replace',
  order: 50,
  appliesTo: (node: NodeData) =>
    RELIABILITY_TONES.includes(node.tone as Tone),
  read: (node) => node.reliability,
  write: (node, value) => ({ ...node, reliability: value }),
  promptInstruction: (mode) => {
    // Spell out exact enum values + a strict shape example. Local models
    // copy the example almost verbatim, which makes the schema preprocess
    // layer mostly a safety net rather than the primary path.
    const base = [
      'Propose a Reliability profile for this node. STRICT shape:',
      '```json',
      '{',
      '  "cap": "CP" | "AP" | "CA",',
      '  "pacelc": "PA/EL" | "PA/EC" | "PC/EL" | "PC/EC",',
      '  "consistencyModel": "strong" | "eventual" | "causal" | "read-your-writes",',
      '  "slo": { "latencyP99Ms": <number>, "availability": <0..1>, "rpsTarget": <number> },',
      '  "replicas": <integer>,',
      '  "redundancy": "none" | "active-passive" | "active-active" | "multi-region",',
      '  "failureModes": ["short reason 1", "short reason 2", "short reason 3"]',
      '}',
      '```',
      'Hard rules:',
      '- `redundancy` MUST be one of the four enum strings exactly. NEVER use compound names like "active-active-sync-replication" — pick the closest of the four.',
      '- `failureModes` MUST be an array of plain strings. NEVER objects, NEVER `{name, description}` shapes. One short sentence per item.',
      '- All keys above are optional EXCEPT pick at least `cap`, `consistencyModel`, `replicas`, and `failureModes`.',
      '- Reason from the node role + connected edges (workload, protocols, neighbours).',
      '- Emit ONE `set_reliability` patch.',
    ].join('\n');
    return mode === 'replace'
      ? base + '\n- Ignore any existing reliability fields (replace mode).'
      : base + '\n- Fill empty fields, leave populated ones untouched (augment mode).';
  },
};
