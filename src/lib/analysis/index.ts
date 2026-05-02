import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, Tone } from '@/types';
import { scanIssues } from '@/lib/ai/issues';
import { findSpofs } from './spof';
import { computeBottlenecks } from './centrality';
import { computeCriticalPaths } from './criticalPath';
import { classifyReadWritePaths } from './readWritePath';
import { runCapAudit } from './capAudit';
import { buildScorecard } from './scorer';
import type { AnalysisReport } from './types';

/**
 * Single entry-point: runs every static analyzer, merges findings, and
 * produces a 6-pillar scorecard. Deterministic — same input → same output.
 * Designed to run in <50ms on graphs of ~100 nodes.
 */
export function runAllAnalyses(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): AnalysisReport {
  const issues = scanIssues(nodes, edges);
  const spof = findSpofs(nodes, edges);
  const bottlenecks = computeBottlenecks(nodes, edges);
  const criticalPaths = computeCriticalPaths(nodes, edges);
  const readWrite = classifyReadWritePaths(nodes, edges);
  const capAuditFindings = runCapAudit(nodes, edges, spof);

  const allFindings = [...issues, ...capAuditFindings];

  const visible = nodes.filter(
    (n) => !n.data?.hidden && n.type !== 'group' && n.type !== 'comment',
  );
  const tones = visible.map((n) => n.data?.tone as Tone | undefined);
  const strengths = {
    hasObservability: tones.includes('ops'),
    hasCache: tones.includes('cache'),
    hasAuth: visible.some(
      (n) =>
        (n.data?.tone as string) === 'auth' || n.data?.category === 'auth',
    ),
    replicatedNodeCount: visible.filter(
      (n) => (n.data?.reliability?.replicas ?? 0) > 1,
    ).length,
    annotatedReliabilityNodeCount: visible.filter(
      (n) => !!n.data?.reliability,
    ).length,
    totalCandidateNodes: visible.length,
  };

  const { scorecard, totalScore } = buildScorecard({
    findings: allFindings,
    strengths,
  });

  return {
    generatedAt: Date.now(),
    scorecard,
    spof,
    bottlenecks,
    criticalPaths,
    readWrite,
    findings: allFindings,
    totalScore,
  };
}

export * from './types';
export { findSpofs } from './spof';
export { computeBottlenecks } from './centrality';
export { computeCriticalPaths } from './criticalPath';
export { classifyReadWritePaths } from './readWritePath';
export { runCapAudit } from './capAudit';
