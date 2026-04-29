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
  hasSchemaEditor?: boolean;
  hasApiEditor?: boolean;
  hasConsumerEditor?: boolean;
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

/** API endpoint, generic across protocols. */
export interface ApiEndpoint {
  // REST: method + path. gRPC/GraphQL/SignalR: name. WS/SignalR: events.
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  name?: string;
  events?: string[];
  description?: string;
  request?: unknown; // JSON Schema (Zod inferred elsewhere)
  response?: unknown;
}

export interface ApiProtocolBlock {
  kind: Protocol;
  baseUrl?: string;
  endpoints: ApiEndpoint[];
}

export interface ApiSpec {
  protocols: ApiProtocolBlock[];
}

/** Hangfire / consumer / worker config. */
export interface ConsumerSpec {
  sourceNodeId?: string; // queue/topic node we consume from
  handler: string;
  schedule?: string; // cron expression
  concurrency?: number;
}

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
  consumer?: ConsumerSpec;
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
}

export interface ProjectSnapshot {
  meta: ProjectMeta;
  nodes: unknown[]; // xyflow Node<NodeData>[]
  edges: unknown[]; // xyflow Edge<EdgeData>[]
}
