import type { Issue, IssueSeverity } from '@/lib/ai/issues';

export type Pillar =
  | 'reliability'
  | 'performance'
  | 'cost'
  | 'security'
  | 'operations'
  | 'consistency';

export type PillarGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface PillarScore {
  pillar: Pillar;
  /** 0-100. */
  score: number;
  grade: PillarGrade;
  /** Findings that pull this pillar's score down. */
  findings: Issue[];
  /** Positive signals that prevent or counter findings. */
  strengths: string[];
}

export interface SpofSummary {
  /** Articulation-point node ids — removing any cuts the graph. */
  articulationPoints: string[];
  /** Bridge edges — removing any cuts the graph. */
  bridges: Array<{ source: string; target: string }>;
}

export interface BottleneckEntry {
  nodeId: string;
  /** Normalised 0-1 score (1 = the most pressured node). */
  score: number;
  /** 1-based ranking by score (descending). */
  rank: number;
  inDegree: number;
  outDegree: number;
}

export interface CriticalPath {
  /** Node ids from source (client/edge) to sink (data/external). */
  path: string[];
  /** Sum of effective edge latencies along the path, in ms. */
  totalLatencyMs: number;
}

export interface ReadWritePair {
  serviceId: string;
  storeId: string;
  protocol: string;
  async: boolean;
  hasCacheNeighbor: boolean;
}

export interface ReadWriteSummary {
  /** Stores read by ≥3 distinct services (likely hot reads). */
  hot: ReadWritePair[];
  /** Pairs without an adjacent cache layer. */
  uncached: ReadWritePair[];
  /** Async edges that touch a data store directly. */
  asyncWrites: ReadWritePair[];
}

export interface AnalysisReport {
  generatedAt: number;
  scorecard: PillarScore[];
  spof: SpofSummary;
  bottlenecks: BottleneckEntry[];
  criticalPaths: CriticalPath[];
  readWrite: ReadWriteSummary;
  /** Aggregated findings (issues.ts + capAudit + scorer-derived). */
  findings: Issue[];
  /** Weighted average across pillars, 0-100. */
  totalScore: number;
}

export type { Issue, IssueSeverity };
