import { create } from 'zustand';
import type { AnalysisReport, BottleneckEntry } from '@/lib/analysis/types';

interface AnalysisState {
  report: AnalysisReport | null;
  setReport: (r: AnalysisReport | null) => void;
}

/**
 * Latest analysis result, kept in a tiny store so canvas-level components
 * (SDNode, ProtocolEdge) can pick what they need without re-running the
 * analyzers themselves. AnalysisRunner mounts at the App root and writes
 * here on every canvas mutation.
 */
export const useAnalysis = create<AnalysisState>((set) => ({
  report: null,
  setReport: (report) => set({ report }),
}));

/** Convenience: O(1) lookup of articulation status for a node id. */
export function isArticulationPoint(
  report: AnalysisReport | null,
  nodeId: string,
): boolean {
  return !!report?.spof.articulationPoints.includes(nodeId);
}

/** Convenience: bottleneck entry for a node id. */
export function bottleneckFor(
  report: AnalysisReport | null,
  nodeId: string,
): BottleneckEntry | undefined {
  return report?.bottlenecks.find((b) => b.nodeId === nodeId);
}

/** Convenience: ordered set of (source,target) pairs from critical paths. */
export function criticalEdgePairs(
  report: AnalysisReport | null,
): Set<string> {
  const out = new Set<string>();
  for (const p of report?.criticalPaths ?? []) {
    for (let i = 0; i < p.path.length - 1; i++) {
      out.add(`${p.path[i]}→${p.path[i + 1]}`);
    }
  }
  return out;
}
