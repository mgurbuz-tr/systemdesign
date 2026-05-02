import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';
import type { SpofSummary } from './types';

/**
 * Tarjan-style articulation point + bridge finder. Treats the graph as
 * undirected because a SPOF cuts reachability regardless of edge direction.
 * Group nodes are excluded — they're visual containers, not runtime units.
 *
 * O(V+E) DFS with discovery / low-link bookkeeping.
 * Reference: https://cp-algorithms.com/graph/cutpoints.html
 */
export function findSpofs(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): SpofSummary {
  const liveNodes = nodes.filter((n) => n.type !== 'group' && n.type !== 'comment');
  const idSet = new Set(liveNodes.map((n) => n.id));
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  for (const id of idSet) adj.set(id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.push({ to: e.target, edgeId: e.id });
    adj.get(e.target)!.push({ to: e.source, edgeId: e.id });
  }

  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const visited = new Set<string>();
  const articulation = new Set<string>();
  const bridges: Array<{ source: string; target: string }> = [];
  let timer = 0;

  const dfs = (u: string, parentEdgeId: string | null): void => {
    visited.add(u);
    disc.set(u, timer);
    low.set(u, timer);
    timer++;
    let children = 0;

    for (const { to: v, edgeId } of adj.get(u) ?? []) {
      if (edgeId === parentEdgeId) continue;
      if (visited.has(v)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      } else {
        dfs(v, edgeId);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > disc.get(u)!) {
          bridges.push({ source: u, target: v });
        }
        if (parentEdgeId !== null && low.get(v)! >= disc.get(u)!) {
          articulation.add(u);
        }
        children++;
      }
    }

    if (parentEdgeId === null && children > 1) articulation.add(u);
  };

  for (const id of idSet) {
    if (!visited.has(id)) dfs(id, null);
  }

  return {
    articulationPoints: Array.from(articulation),
    bridges,
  };
}
