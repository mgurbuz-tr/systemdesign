import type { Issue, IssueSeverity } from '@/lib/ai/issues';
import type {
  AnalysisReport,
  Pillar,
  PillarGrade,
  PillarScore,
} from './types';

const SEV_PENALTY: Record<IssueSeverity, number> = {
  high: 18,
  med: 9,
  low: 4,
};

/**
 * Maps a finding code to one or more pillars it impacts. A finding can pull
 * down multiple pillars (e.g. unreplicated-spof hits reliability + ops).
 */
const CODE_TO_PILLARS: Record<string, Pillar[]> = {
  // Existing issues.ts codes
  'orphan-node': ['operations'],
  'empty-schema': ['operations'],
  'empty-api': ['operations'],
  'consumer-orphan': ['reliability'],
  'consuming-source-stale': ['reliability'],
  'consuming-dlq-stale': ['reliability'],
  'scheduled-empty': ['reliability'],
  'producing-publisher-stale': ['reliability'],
  'fk-table-missing': ['consistency'],
  'no-cache': ['performance'],
  'async-non-queue': ['reliability'],
  'sql-non-db': ['operations'],
  'redis-non-cache': ['operations'],
  'no-observability': ['operations'],
  'no-auth': ['security'],
  // Cap-audit codes
  'cap-mismatch': ['consistency', 'reliability'],
  'latency-budget-blown': ['performance'],
  'unreplicated-spof': ['reliability', 'operations'],
  'low-availability-target': ['reliability'],
};

/** Pillar weights (1.0 = base). Reliability/consistency/perf weigh more. */
const WEIGHT: Record<Pillar, number> = {
  reliability: 1.2,
  consistency: 1.2,
  performance: 1.2,
  cost: 1.0,
  security: 1.0,
  operations: 1.0,
};

const ALL_PILLARS: Pillar[] = [
  'reliability',
  'performance',
  'cost',
  'security',
  'operations',
  'consistency',
];

function gradeFor(score: number): PillarGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

interface ScorerInput {
  findings: Issue[];
  /** Positive signals from graph structure to award strength points. */
  strengths: {
    hasObservability: boolean;
    hasCache: boolean;
    hasAuth: boolean;
    replicatedNodeCount: number;
    annotatedReliabilityNodeCount: number;
    totalCandidateNodes: number;
  };
}

export function buildScorecard(input: ScorerInput): {
  scorecard: PillarScore[];
  totalScore: number;
} {
  const buckets = new Map<Pillar, Issue[]>();
  const strengths = new Map<Pillar, string[]>();
  for (const p of ALL_PILLARS) {
    buckets.set(p, []);
    strengths.set(p, []);
  }

  for (const f of input.findings) {
    const pillars = CODE_TO_PILLARS[f.code] ?? ['operations'];
    for (const p of pillars) buckets.get(p)!.push(f);
  }

  // Strength signals. Each `push` becomes +4 points on the target pillar
  // (see `bonus = strengths.length * 4` below), so we award per-signal
  // entries when the signal scales (more replicas / annotations → more
  // strength), capped to keep the bonus from dominating penalty math.
  const s = input.strengths;
  if (s.hasObservability) strengths.get('operations')!.push('Observability node present');
  if (s.hasCache) strengths.get('performance')!.push('Cache layer present');
  if (s.hasAuth) strengths.get('security')!.push('Auth/IdP node present');

  // Replication coverage: ratio of nodes with replicas > 1. 0 → no bonus,
  // 0.5 → 2 entries (+8), ≥0.75 → 3 entries (+12). Count-aware so a graph
  // where most nodes are explicitly replicated reflects in the score.
  if (s.totalCandidateNodes > 0 && s.replicatedNodeCount > 0) {
    const ratio = s.replicatedNodeCount / s.totalCandidateNodes;
    const replicaEntries =
      ratio >= 0.75 ? 3 : ratio >= 0.5 ? 2 : 1;
    for (let i = 0; i < replicaEntries; i++) {
      strengths
        .get('reliability')!
        .push(
          i === 0
            ? `${s.replicatedNodeCount}/${s.totalCandidateNodes} replicated nodes`
            : `${(ratio * 100).toFixed(0)}% replication coverage`,
        );
    }
  }

  // Reliability annotations: a node carrying CAP/PACELC/SLO metadata is
  // a positive signal for *both* reliability and consistency reasoning.
  if (
    s.totalCandidateNodes > 0 &&
    s.annotatedReliabilityNodeCount / s.totalCandidateNodes >= 0.5
  ) {
    strengths.get('reliability')!.push('Reliability annotations on majority of nodes');
    strengths.get('consistency')!.push('Reliability annotations on majority of nodes');
  }

  const scorecard: PillarScore[] = ALL_PILLARS.map((pillar) => {
    const findings = buckets.get(pillar)!;
    const penalty = findings.reduce(
      (acc, f) => acc + SEV_PENALTY[f.severity],
      0,
    );
    const bonus = strengths.get(pillar)!.length * 4;
    const raw = 100 - penalty + bonus;
    const score = Math.max(0, Math.min(100, raw));
    return {
      pillar,
      score: Math.round(score),
      grade: gradeFor(score),
      findings,
      strengths: strengths.get(pillar)!,
    };
  });

  let weightSum = 0;
  let weighted = 0;
  for (const ps of scorecard) {
    const w = WEIGHT[ps.pillar];
    weighted += ps.score * w;
    weightSum += w;
  }
  const totalScore = Math.round(weighted / weightSum);

  return { scorecard, totalScore };
}

export type { AnalysisReport };
