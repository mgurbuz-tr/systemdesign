import type { Edge, Node } from '@xyflow/react';
import type { ApiSpec, DbSchema, EdgeData, NodeData } from '@/types';
import { findCatalogItem } from '@/lib/catalog';

/**
 * Serializes the current graph as compact markdown — used as part of the
 * system prompt so the AI has full structural context for analysis.
 *
 * If `selectedNodeId` is set, the selected node is rendered first under a
 * SELECTED block with full detail (schema columns, endpoints, notes) so the
 * model can focus the answer.
 */
export function serializeGraph(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options?: { selectedNodeId?: string | null },
): string {
  const visible = nodes.filter((n) => !n.data.hidden);

  if (visible.length === 0 && edges.length === 0) {
    return '_(empty canvas)_';
  }

  const selectedId = options?.selectedNodeId ?? null;
  const selected = selectedId
    ? visible.find((n) => n.id === selectedId)
    : null;

  const lines: string[] = [];

  if (selected) {
    lines.push('## SELECTED NODE');
    lines.push(renderNodeBlock(selected, /* detailed */ true));
    lines.push('');
  }

  // Render groups separately so the AI knows which logical containers exist
  // (Edge tier, Data plane, VPC, …) and can attach new nodes via parent.
  const groups = visible.filter((n) => n.type === 'group');
  if (groups.length > 0) {
    lines.push('## GROUPS');
    for (const g of groups) {
      const label =
        (g.data as { label?: string } | undefined)?.label ?? g.id;
      lines.push(`- **${g.id}** — "${label}"`);
    }
    lines.push('');
  }

  lines.push('## NODES');
  for (const n of visible) {
    if (n.id === selectedId) continue; // already detailed above
    if (n.type === 'group') continue; // already listed above
    const parentTag = n.parentId ? ` [in ${n.parentId}]` : '';
    lines.push(
      `- **${n.id}** (${n.data.type}): ${n.data.label}${parentTag}${describeOneLine(n)}`,
    );
  }

  if (edges.length > 0) {
    lines.push('');
    lines.push('## EDGES');
    for (const e of edges) {
      const data = (e.data as EdgeData | undefined) ?? { protocol: 'rest' };
      const arrow = data.async ? '·dashed·' : '──';
      lines.push(
        `- ${e.source} ${arrow}${data.protocol.toUpperCase()}${arrow}> ${e.target}${
          data.description ? ` — ${data.description}` : ''
        }`,
      );
    }
  }

  return lines.join('\n');
}

function describeOneLine(n: Node<NodeData>): string {
  const parts: string[] = [];
  const item = findCatalogItem(n.data.type);
  if (item) parts.push(item.group);

  if (n.data.schema && n.data.schema.tables.length > 0) {
    parts.push(`tables: ${n.data.schema.tables.length}`);
  }
  if (n.data.api && n.data.api.protocols.length > 0) {
    parts.push(
      `api: ${n.data.api.protocols
        .map((p) => `${p.kind}:${p.endpoints.length}`)
        .join(',')}`,
    );
  }
  if (n.data.consumer?.handler) {
    parts.push(`consumer: ${n.data.consumer.handler}`);
  }
  if (n.data.notes) parts.push('has-notes');
  if (n.data.locked) parts.push('locked');

  return parts.length > 0 ? ` — ${parts.join(' · ')}` : '';
}

function renderNodeBlock(n: Node<NodeData>, detailed: boolean): string {
  const lines: string[] = [];
  lines.push(`**${n.id}** (${n.data.type}) — ${n.data.label}`);

  const item = findCatalogItem(n.data.type);
  if (item) lines.push(`group: ${item.group}`);

  if (n.data.meta) lines.push(`meta: ${n.data.meta}`);

  if (detailed && n.data.schema && n.data.schema.tables.length > 0) {
    lines.push('schema:');
    lines.push(...renderSchema(n.data.schema));
  }

  if (detailed && n.data.api && n.data.api.protocols.length > 0) {
    lines.push('api:');
    lines.push(...renderApi(n.data.api));
  }

  if (n.data.consumer?.handler) {
    const c = n.data.consumer;
    lines.push(
      `consumer: ${c.handler}${c.sourceNodeId ? ` ← ${c.sourceNodeId}` : ''}${
        c.schedule ? ` cron[${c.schedule}]` : ''
      }${c.concurrency ? ` (x${c.concurrency})` : ''}`,
    );
  }

  if (n.data.notes && n.data.notes.trim()) {
    lines.push('notes:');
    for (const line of n.data.notes.split('\n')) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join('\n');
}

function renderSchema(schema: DbSchema): string[] {
  const lines: string[] = [];
  for (const t of schema.tables) {
    const cols = t.columns
      .map((c) => {
        const flags: string[] = [];
        if (c.primaryKey) flags.push('PK');
        if (c.foreignKey) flags.push(`FK→${c.foreignKey.table}.${c.foreignKey.column}`);
        if (!c.nullable) flags.push('NOT NULL');
        if (c.unique) flags.push('UNIQUE');
        return `${c.name}:${c.type}${flags.length ? ` [${flags.join(',')}]` : ''}`;
      })
      .join(', ');
    const idx = t.indexes.length > 0
      ? ` · idx:${t.indexes.map((i) => `${i.name}(${i.columns.join(',')})${i.unique ? '!u' : ''}`).join(',')}`
      : '';
    lines.push(`  - ${t.name}(${cols})${idx}`);
  }
  return lines;
}

function renderApi(api: ApiSpec): string[] {
  const lines: string[] = [];
  for (const block of api.protocols) {
    lines.push(`  ${block.kind}${block.baseUrl ? ` (${block.baseUrl})` : ''}:`);
    for (const ep of block.endpoints) {
      if (block.kind === 'rest' && ep.method && ep.path) {
        lines.push(`    - ${ep.method} ${ep.path}${ep.description ? ` — ${ep.description}` : ''}`);
      } else if (ep.name) {
        lines.push(`    - ${ep.name}${ep.description ? ` — ${ep.description}` : ''}`);
      } else if (ep.events && ep.events.length) {
        lines.push(`    - events: ${ep.events.join(', ')}`);
      }
    }
  }
  return lines;
}
