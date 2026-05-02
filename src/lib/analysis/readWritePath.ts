import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, Tone } from '@/types';
import type { ReadWritePair, ReadWriteSummary } from './types';

const STORE_TONES: ReadonlyArray<Tone> = ['data', 'cache', 'queue'];

/**
 * Classifies (service → store) edges to surface hot reads (≥3 services →
 * same store), uncached reads, and async writes that bypass a queue. Pure
 * structural analysis — does not reach into the canvas store.
 */
export function classifyReadWritePaths(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): ReadWriteSummary {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isStore = (id: string) => {
    const tone = byId.get(id)?.data?.tone as Tone | undefined;
    return tone !== undefined && STORE_TONES.includes(tone);
  };
  const isService = (id: string) => {
    const tone = byId.get(id)?.data?.tone as Tone | undefined;
    return tone === 'service' || tone === 'ai';
  };

  // Adjacency for cache-neighbour lookup.
  const cacheNeighbours = new Map<string, Set<string>>();
  for (const e of edges) {
    const sNode = byId.get(e.source);
    const tNode = byId.get(e.target);
    if (sNode?.data?.tone === 'cache') {
      cacheNeighbours.set(
        e.target,
        (cacheNeighbours.get(e.target) ?? new Set()).add(e.source),
      );
    }
    if (tNode?.data?.tone === 'cache') {
      cacheNeighbours.set(
        e.source,
        (cacheNeighbours.get(e.source) ?? new Set()).add(e.target),
      );
    }
  }

  const readers = new Map<string, Set<string>>(); // storeId → service ids
  const pairs: ReadWritePair[] = [];

  for (const e of edges) {
    if (!isService(e.source) || !isStore(e.target)) continue;
    const data = (e.data ?? {}) as EdgeData;
    pairs.push({
      serviceId: e.source,
      storeId: e.target,
      protocol: data.protocol,
      async: data.async ?? false,
      hasCacheNeighbor: (cacheNeighbours.get(e.source)?.size ?? 0) > 0,
    });
    if (!readers.has(e.target)) readers.set(e.target, new Set());
    readers.get(e.target)!.add(e.source);
  }

  const hot = pairs.filter(
    (p) => (readers.get(p.storeId)?.size ?? 0) >= 3,
  );
  const uncached = pairs.filter(
    (p) => byId.get(p.storeId)?.data?.tone === 'data' && !p.hasCacheNeighbor,
  );
  const asyncWrites = pairs.filter(
    (p) => p.async && byId.get(p.storeId)?.data?.tone === 'data',
  );

  return { hot, uncached, asyncWrites };
}
