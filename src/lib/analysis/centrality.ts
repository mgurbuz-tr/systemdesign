import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';
import {
  CRITICALITY_WEIGHT,
  PROTOCOL_LATENCY_MS,
} from '@/lib/capabilities/reliabilityDefaults';
import type { BottleneckEntry } from './types';

/**
 * Cheap bottleneck score per node — combines in/out degree with a per-edge
 * weight derived from protocol latency (slower protocol → heavier load) and
 * user-supplied criticality. Not a true betweenness, but stable enough to
 * surface monolith-style hotspots and gateway choke points without needing
 * an O(V·E) shortest-paths sweep.
 *
 * Score = (sum of weighted incident edges) + 0.4 × neighbour score average.
 * Returned values are normalised 0-1 against the maximum.
 */
export function computeBottlenecks(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): BottleneckEntry[] {
  const liveNodes = nodes.filter(
    (n) => n.type !== 'group' && n.type !== 'comment',
  );
  const ids = new Set(liveNodes.map((n) => n.id));
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  const weightedIn = new Map<string, number>();
  const weightedOut = new Map<string, number>();
  for (const id of ids) {
    inDeg.set(id, 0);
    outDeg.set(id, 0);
    weightedIn.set(id, 0);
    weightedOut.set(id, 0);
  }

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const data = (e.data ?? {}) as EdgeData;
    const protocolWeight =
      (PROTOCOL_LATENCY_MS[data.protocol] ?? 30) / 50; // 1.0 = REST baseline
    const critWeight = CRITICALITY_WEIGHT[data.criticality ?? 'normal'];
    const w = protocolWeight * critWeight;
    inDeg.set(e.target, inDeg.get(e.target)! + 1);
    outDeg.set(e.source, outDeg.get(e.source)! + 1);
    weightedIn.set(e.target, weightedIn.get(e.target)! + w);
    weightedOut.set(e.source, weightedOut.get(e.source)! + w);
  }

  // Base score = weighted in + 0.5 × weighted out (incoming load matters more
  // than outgoing for bottleneck risk). Add a small in-degree bonus so a node
  // taking many low-weight calls still ranks above a single high-weight one.
  const base = new Map<string, number>();
  for (const id of ids) {
    base.set(
      id,
      weightedIn.get(id)! + 0.5 * weightedOut.get(id)! + 0.25 * inDeg.get(id)!,
    );
  }

  // Neighbour propagation — a node connected to other busy nodes is itself
  // under more pressure.
  const propagated = new Map<string, number>();
  for (const id of ids) {
    let neighbourSum = 0;
    let neighbourCount = 0;
    for (const e of edges) {
      if (e.source === id && ids.has(e.target)) {
        neighbourSum += base.get(e.target) ?? 0;
        neighbourCount++;
      } else if (e.target === id && ids.has(e.source)) {
        neighbourSum += base.get(e.source) ?? 0;
        neighbourCount++;
      }
    }
    const avg = neighbourCount > 0 ? neighbourSum / neighbourCount : 0;
    propagated.set(id, base.get(id)! + 0.4 * avg);
  }

  const max = Math.max(...propagated.values(), 1);
  const entries: BottleneckEntry[] = liveNodes.map((n) => ({
    nodeId: n.id,
    score: (propagated.get(n.id) ?? 0) / max,
    rank: 0,
    inDegree: inDeg.get(n.id) ?? 0,
    outDegree: outDeg.get(n.id) ?? 0,
  }));

  entries.sort((a, b) => b.score - a.score);
  entries.forEach((e, i) => (e.rank = i + 1));
  return entries;
}
