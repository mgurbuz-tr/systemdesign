import { db, type VersionRow, type VersionTrigger } from '@/lib/db/database';
import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';

/**
 * Proje başına saklanacak maksimum versiyon sayısı. Aşıldığında en eski
 * satırlar FIFO sırasıyla silinir — `recordVersion` her ekleme sonrası
 * `pruneOldVersions`'ı çağırır.
 */
export const MAX_VERSIONS_PER_PROJECT = 200;

const deepClone = <T>(v: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);

interface RecordPayload {
  projectId: string;
  trigger: VersionTrigger;
  label: string;
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
  summary?: string;
}

/**
 * Yeni versiyon satırı yazar; deep-clone alır (sonraki canvas mutation'ları
 * snapshot'ı bozmasın). Yazımdan sonra ring-buffer trim çalışır.
 */
export async function recordVersion(payload: RecordPayload): Promise<number> {
  const nodes = deepClone(payload.nodes);
  const edges = deepClone(payload.edges);
  const bytes = approximateBytes(nodes, edges);
  const row: VersionRow = {
    projectId: payload.projectId,
    createdAt: Date.now(),
    trigger: payload.trigger,
    label: payload.label,
    nodes,
    edges,
    summary: payload.summary,
    bytes,
  };
  const id = (await db.versions.add(row)) as number;
  await pruneOldVersions(payload.projectId, MAX_VERSIONS_PER_PROJECT);
  return id;
}

/** En yeni başta, opsiyonel `limit` ile listeyi getirir. */
export async function listVersions(
  projectId: string,
  limit?: number,
): Promise<VersionRow[]> {
  let coll = db.versions
    .where('[projectId+createdAt]')
    .between([projectId, -Infinity], [projectId, Infinity])
    .reverse();
  if (limit && limit > 0) coll = coll.limit(limit);
  return coll.toArray();
}

export async function getVersion(id: number): Promise<VersionRow | undefined> {
  return db.versions.get(id);
}

export async function deleteVersion(id: number): Promise<void> {
  await db.versions.delete(id);
}

export async function deleteAllVersionsForProject(projectId: string): Promise<void> {
  await db.versions.where({ projectId }).delete();
}

export async function countVersions(projectId: string): Promise<number> {
  return db.versions.where({ projectId }).count();
}

/**
 * 200 üstü kalan en eski satırları siler. Tek tx içinde compound index
 * üzerinden offset+delete kullanır; tüm satırları yüklemez.
 */
export async function pruneOldVersions(
  projectId: string,
  keep: number,
): Promise<number> {
  const total = await db.versions.where({ projectId }).count();
  if (total <= keep) return 0;
  const excess = total - keep;
  const oldest = await db.versions
    .where('[projectId+createdAt]')
    .between([projectId, -Infinity], [projectId, Infinity])
    .limit(excess)
    .primaryKeys();
  if (oldest.length === 0) return 0;
  await db.versions.bulkDelete(oldest as number[]);
  return oldest.length;
}

function approximateBytes(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): number {
  try {
    return JSON.stringify(nodes).length + JSON.stringify(edges).length;
  } catch {
    return 0;
  }
}
