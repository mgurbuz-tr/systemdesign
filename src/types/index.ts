/**
 * Core domain types for SystemDesign editor.
 * Tone names match design tokens (--tone-{name}-bg/fg).
 */

export type Tone =
  | 'data'
  | 'cache'
  | 'queue'
  | 'service'
  | 'edge'
  | 'ai'
  | 'client'
  | 'external'
  | 'ops';

export type ComponentCategory =
  | 'database'
  | 'cache'
  | 'queue'
  | 'compute'
  | 'network'
  | 'observability'
  | 'ai'
  | 'auth'
  | 'client'
  | 'external';

export type Protocol =
  | 'rest'
  | 'grpc'
  | 'graphql'
  | 'websocket'
  | 'signalr'
  | 'amqp'
  | 'kafka'
  | 'mqtt'
  | 'sql'
  | 'redis'
  | 'tcp';

/** Edge-rendering style (user-selectable in settings). */
export type EdgeStyle = 'curved' | 'orthogonal' | 'straight';

/** Node-content density (user-selectable in settings). */
export type NodeDisplay = 'icon-only' | 'icon-label' | 'detailed';

/**
 * Capability id — capabilities a node type can carry.
 * Authoritative list; capability files (`src/lib/capabilities/*`) use this
 * union as the id. When adding a new capability, register it here too.
 */
export type CapabilityId =
  | 'schema'
  | 'api'
  | 'consuming'
  | 'scheduled'
  | 'producing'
  | 'reliability'
  | 'notes';

/** Catalog entry — describes a draggable component type. */
export interface CatalogItem {
  type: string; // 'postgres' | 'redis' | ...
  group: string; // 'Databases' | 'Caches' | ...
  label: string; // 'PostgreSQL'
  description: string;
  icon: string; // Icon name registry key
  tone: Tone;
  category: ComponentCategory;
  supportedProtocols?: Protocol[];
  /**
   * Capabilities this type carries. Source of truth: which inspector tabs
   * appear and which `set_*` patch ops are applicable derive from here.
   */
  capabilities?: CapabilityId[];
  /** Mockup editor — for client types; not tied to the capability system. */
  hasMockupEditor?: boolean;
  defaultConfig?: Record<string, unknown>;
}

/** Mockup screen — UI page on a client node. */
export interface ScreenSpec {
  id: string;
  name: string;
  description?: string;
  /** Endpoints this screen consumes (free-text or "service:endpoint"). */
  apiCalls?: string[];
}

export interface MockupSpec {
  screens: ScreenSpec[];
}

/** Database table column definition. */
export interface ColumnDef {
  name: string;
  type: string; // 'uuid' | 'text' | 'int' | ...
  nullable: boolean;
  primaryKey: boolean;
  unique?: boolean;
  default?: string;
  foreignKey?: { table: string; column: string };
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
}

export interface DbSchema {
  tables: TableDef[];
}

/**
 * A single DTO field — flat, name + type + optional flag + free-text
 * description. Type is a free string so users (and the AI) can express
 * primitives (`string`, `int`, `uuid`), arrays (`string[]`, `User[]`),
 * and references to other DTOs (`UserPayload`) without locking us into
 * a JSON-Schema-shaped tree.
 */
export interface DtoField {
  name: string;
  type: string;
  /** True if the field MAY be omitted from the wire payload. */
  optional?: boolean;
  description?: string;
}

/** API endpoint, generic across protocols. */
export interface ApiEndpoint {
  // REST: method + path. gRPC/GraphQL/SignalR: name. WS/SignalR: events.
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  name?: string;
  events?: string[];
  description?: string;
  /** Request DTO — input payload field list. */
  request?: DtoField[];
  /** Response DTO — output payload field list. */
  response?: DtoField[];
  /** HTTP status codes the endpoint can return (e.g. ["200", "404"]). */
  statusCodes?: string[];
}

export interface ApiProtocolBlock {
  kind: Protocol;
  baseUrl?: string;
  endpoints: ApiEndpoint[];
}

export interface ApiSpec {
  protocols: ApiProtocolBlock[];
}

/**
 * @deprecated — use `ConsumingSpec` and/or `ScheduledSpec` instead. Kept for
 * backwards compat with projects saved before the capability split. Capabilities
 * `consuming` and `scheduled` read from this as a fallback when the new fields
 * aren't populated yet, then write to the new fields on the next change.
 */
export interface ConsumerSpec {
  sourceNodeId?: string;
  handler: string;
  schedule?: string;
  concurrency?: number;
}

/** `consuming` capability — worker config that consumes from a queue. */
export interface ConsumingSpec {
  /** Source queue/topic node id. */
  sourceNodeId?: string;
  /** Handler/processor name or signature. */
  handler: string;
  /** Number of concurrent handlers. */
  concurrency?: number;
  /** Optional dead-letter queue node id. */
  deadLetterNodeId?: string;
  /** Free-form notes (idempotency key, retry strategy, …). */
  notes?: string;
}

/** `scheduled` capability — cron-driven runner config. */
export interface ScheduledSpec {
  /** Cron expression or free-form like "every 5m" / "@hourly". */
  schedule: string;
  /** Handler/job name to run. */
  handler?: string;
  /** Human-readable description. */
  description?: string;
  /** Timezone (e.g. "Europe/Istanbul"). */
  timezone?: string;
}

/** `producing` capability — event definition written to a queue/topic. */
export interface ProducedEvent {
  /** Event/message name (e.g. "OrderCreated"). */
  name: string;
  /** Service node ids that publish this event. */
  publishers?: string[];
  /** Payload fields — simple name:type list. */
  fields?: Array<{ name: string; type: string; description?: string }>;
  description?: string;
}

export interface ProducingSpec {
  events: ProducedEvent[];
}

/** CAP theorem trade-off — pick two of three under network partition. */
export type CapProfile = 'CP' | 'AP' | 'CA';

/**
 * PACELC: under Partition pick A or C; Else (no partition) pick L (latency)
 * or C (consistency). Four corners for distributed data stores / services.
 */
export type PacelcProfile = 'PA/EL' | 'PA/EC' | 'PC/EL' | 'PC/EC';

export type ConsistencyModel =
  | 'strong'
  | 'eventual'
  | 'causal'
  | 'read-your-writes';

export type RedundancyModel =
  | 'none'
  | 'active-passive'
  | 'active-active'
  | 'multi-region';

export interface SloSpec {
  /** Target p99 latency in milliseconds. */
  latencyP99Ms?: number;
  /** Target availability as a fraction (e.g. 0.999 = 99.9%). */
  availability?: number;
  /** Target throughput in requests per second. */
  rpsTarget?: number;
}

/**
 * `reliability` capability — CAP/PACELC profile, SLO targets, replicas and
 * redundancy. Used by static analyzers (SPOF audit, CAP mismatch detection)
 * and as `set_reliability` AI patch op.
 */
export interface ReliabilitySpec {
  cap?: CapProfile;
  pacelc?: PacelcProfile;
  consistencyModel?: ConsistencyModel;
  slo?: SloSpec;
  /** Number of running replicas. 0/1 = potential SPOF. */
  replicas?: number;
  redundancy?: RedundancyModel;
  /** Free-text failure modes (AI-fillable). */
  failureModes?: string[];
}

export interface ArchitectureNotesSpec {
  summary?: string;
  designPatterns?: string[];
  capTradeoffs?: string[];
  operationalRisks?: string[];
  recommendations?: string[];
}

/** Edge criticality for latency budget + critical-path analysis. */
export type EdgeCriticality = 'critical' | 'normal' | 'background';

/** Custom data carried by every canvas node. */
export interface NodeData extends Record<string, unknown> {
  type: string; // catalog type id
  category: ComponentCategory;
  tone: Tone;
  label: string;
  meta?: string; // detailed-mode metadata line
  /** When true: cannot be dragged, deleted, or connected. */
  locked?: boolean;
  /** When true: rendered with reduced opacity and ignored by AI context. */
  hidden?: boolean;
  /** Per-node accent override (defaults to global accent). */
  colorOverride?: string;
  config?: Record<string, unknown>;
  schema?: DbSchema;
  mockup?: MockupSpec;
  api?: ApiSpec;
  /** @deprecated — replaced by `consuming` + `scheduled`. Read-only fallback. */
  consumer?: ConsumerSpec;
  consuming?: ConsumingSpec;
  scheduled?: ScheduledSpec;
  producing?: ProducingSpec;
  /** Reliability profile (CAP/PACELC/SLO) — feeds the analysis suite. */
  reliability?: ReliabilitySpec;
  /** Structured architect notes generated by AI or edited manually. */
  architectureNotes?: ArchitectureNotesSpec;
  /** Free-text markdown notes shown in Inspector + included in AI context. */
  notes?: string;
}

/** Custom data carried by every edge. */
export interface EdgeData extends Record<string, unknown> {
  protocol: Protocol;
  description?: string;
  style?: EdgeStyle;
  /** True if event/async — renders dashed. */
  async?: boolean;
  /** Estimated p99 latency in ms; falls back to a per-protocol default. */
  latencyMsHint?: number;
  /** User override — shapes critical-path + bottleneck weighting. */
  criticality?: EdgeCriticality;
}

/** Logical grouping (VPC, tier, etc.) — uses xyflow group node. */
export interface GroupData extends Record<string, unknown> {
  label: string;
  tone?: Tone;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
  /** Template the project was created from (if any). Used by the "Reset to template" flow. */
  templateId?: string;
}

export interface ProjectSnapshot {
  meta: ProjectMeta;
  nodes: unknown[]; // xyflow Node<NodeData>[]
  edges: unknown[]; // xyflow Edge<EdgeData>[]
}
