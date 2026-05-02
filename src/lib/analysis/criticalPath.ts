import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, Tone } from '@/types';
import { effectiveEdgeLatencyMs } from '@/lib/capabilities/reliabilityDefaults';
import type { CriticalPath } from './types';

const SOURCE_TONES: ReadonlyArray<Tone> = ['client', 'external', 'edge'];
const SINK_TONES: ReadonlyArray<Tone> = ['data', 'cache', 'queue', 'external'];

/**
 * Top-K longest latency paths from client/external/edge sources to data
 * sinks. Treats the graph as a DAG (cycle-tolerant: visited-on-stack guard
 * prevents infinite loops; the score is a best-effort upper bound when
 * cycles exist). DFS with memoised path reconstruction — adequate for
 * graphs of a few hundred nodes.
 */
export function computeCriticalPaths(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  topK = 3,
): CriticalPath[] {
  const live = nodes.filter(
    (n) => n.type !== 'group' && n.type !== 'comment',
  );
  const idSet = new Set(live.map((n) => n.id));
  const byId = new Map(live.map((n) => [n.id, n]));

  type Out = { to: string; latency: number };
  const adj = new Map<string, Out[]>();
  for (const id of idSet) adj.set(id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    const data = (e.data ?? {}) as EdgeData;
    const latency = effectiveEdgeLatencyMs(data.protocol, data.latencyMsHint);
    adj.get(e.source)!.push({ to: e.target, latency });
  }

  const sources = live
    .filter((n) => SOURCE_TONES.includes((n.data?.tone as Tone) ?? 'service'))
    .map((n) => n.id);
  // If no client/edge node exists, fall back to nodes with 0 in-degree.
  const inDeg = new Map<string, number>();
  for (const id of idSet) inDeg.set(id, 0);
  for (const e of edges) {
    if (idSet.has(e.target)) inDeg.set(e.target, inDeg.get(e.target)! + 1);
  }
  const startNodes = sources.length > 0
    ? sources
    : live.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id);

  const paths: CriticalPath[] = [];

  const dfs = (
    cur: string,
    stack: string[],
    onStack: Set<string>,
    accLatency: number,
  ): void => {
    const tone = (byId.get(cur)?.data?.tone as Tone) ?? 'service';
    const isSink = SINK_TONES.includes(tone) && stack.length > 1;
    const next = adj.get(cur) ?? [];
    if (isSink || next.length === 0) {
      if (stack.length > 1) {
        paths.push({ path: [...stack], totalLatencyMs: accLatency });
      }
      return;
    }
    for (const { to, latency } of next) {
      if (onStack.has(to)) continue; // cycle break
      stack.push(to);
      onStack.add(to);
      dfs(to, stack, onStack, accLatency + latency);
      stack.pop();
      onStack.delete(to);
    }
  };

  for (const s of startNodes) {
    dfs(s, [s], new Set([s]), 0);
  }

  paths.sort((a, b) => b.totalLatencyMs - a.totalLatencyMs);
  return paths.slice(0, topK);
}
