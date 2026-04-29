import Dexie, { type EntityTable } from 'dexie';
import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, ProjectMeta } from '@/types';

interface ProjectRow extends ProjectMeta {
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
}

/**
 * AI conversation persisted per project. `messages` is opaque on purpose —
 * the AiPanel owns the wire format, DB just stores it.
 */
export interface ConversationRow {
  /** projectId == row id; one thread per project. */
  id: string;
  messages: unknown[];
  updatedAt: number;
}

class SDDatabase extends Dexie {
  projects!: EntityTable<ProjectRow, 'id'>;
  conversations!: EntityTable<ConversationRow, 'id'>;

  constructor() {
    super('system-design');
    this.version(1).stores({
      projects: 'id, name, updatedAt',
    });
    this.version(2)
      .stores({
        projects: 'id, name, updatedAt',
        conversations: 'id, updatedAt',
      });
  }
}

export const db = new SDDatabase();

export async function listProjects(): Promise<ProjectMeta[]> {
  const rows = await db.projects.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ nodes: _nodes, edges: _edges, ...meta }) => {
    void _nodes;
    void _edges;
    return meta;
  });
}

export async function loadProject(id: string): Promise<ProjectRow | undefined> {
  return db.projects.get(id);
}

export async function saveSnapshot(
  meta: ProjectMeta,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): Promise<void> {
  await db.projects.put({
    ...meta,
    updatedAt: Date.now(),
    nodes,
    edges,
  });
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}

export async function loadConversation(id: string): Promise<unknown[] | null> {
  const row = await db.conversations.get(id);
  return row ? row.messages : null;
}

export async function saveConversation(
  id: string,
  messages: unknown[],
): Promise<void> {
  await db.conversations.put({ id, messages, updatedAt: Date.now() });
}

export async function clearConversation(id: string): Promise<void> {
  await db.conversations.delete(id);
}

export async function duplicateProject(id: string): Promise<ProjectMeta | null> {
  const row = await db.projects.get(id);
  if (!row) return null;
  const newId = `proj-${Math.random().toString(36).slice(2, 9)}`;
  const copy: ProjectRow = {
    ...row,
    id: newId,
    name: `${row.name} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.projects.put(copy);
  return {
    id: copy.id,
    name: copy.name,
    createdAt: copy.createdAt,
    updatedAt: copy.updatedAt,
    description: copy.description,
  };
}
