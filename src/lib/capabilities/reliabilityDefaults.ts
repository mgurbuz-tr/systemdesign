import type {
  CapProfile,
  ConsistencyModel,
  EdgeCriticality,
  PacelcProfile,
  Protocol,
  Tone,
} from '@/types';

/**
 * Per-protocol p99 latency hints in milliseconds. Fed into critical-path
 * and latency-budget analyzers when an edge has no explicit `latencyMsHint`.
 * Numbers are conservative cloud defaults — same-region, warm-cache.
 */
export const PROTOCOL_LATENCY_MS: Record<Protocol, number> = {
  rest: 50,
  graphql: 60,
  grpc: 30,
  websocket: 20,
  signalr: 25,
  amqp: 15,
  kafka: 10,
  mqtt: 15,
  sql: 5,
  redis: 1,
  tcp: 5,
};

/**
 * Edge criticality weight (multiplier) used by centrality + critical-path
 * scoring. Critical edges count more toward bottleneck risk.
 */
export const CRITICALITY_WEIGHT: Record<EdgeCriticality, number> = {
  critical: 2.0,
  normal: 1.0,
  background: 0.4,
};

/** Default CAP profile suggestion based on a node's tone. */
export const DEFAULT_CAP_BY_TONE: Partial<Record<Tone, CapProfile>> = {
  data: 'CP',
  cache: 'AP',
  queue: 'AP',
  service: 'AP',
  ai: 'AP',
};

/** Default PACELC profile suggestion based on a node's tone. */
export const DEFAULT_PACELC_BY_TONE: Partial<Record<Tone, PacelcProfile>> = {
  data: 'PC/EC',
  cache: 'PA/EL',
  queue: 'PA/EL',
  service: 'PA/EL',
  ai: 'PA/EL',
};

/** Default consistency model suggestion based on tone. */
export const DEFAULT_CONSISTENCY_BY_TONE: Partial<Record<Tone, ConsistencyModel>> = {
  data: 'strong',
  cache: 'eventual',
  queue: 'eventual',
  service: 'read-your-writes',
  ai: 'eventual',
};

/** Tones that the reliability capability applies to. */
export const RELIABILITY_TONES: ReadonlyArray<Tone> = [
  'service',
  'data',
  'cache',
  'queue',
  'ai',
  'edge',
];

/** Resolve an effective edge latency: explicit hint else protocol default. */
export function effectiveEdgeLatencyMs(
  protocol: Protocol,
  hint?: number,
): number {
  if (typeof hint === 'number' && hint >= 0) return hint;
  return PROTOCOL_LATENCY_MS[protocol] ?? 30;
}

/** Resolve effective criticality (default normal). */
export function effectiveCriticality(c?: EdgeCriticality): EdgeCriticality {
  return c ?? 'normal';
}
