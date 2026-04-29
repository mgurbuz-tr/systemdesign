import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';
import { findCatalogItem } from '@/lib/catalog';

/**
 * Serializes the current graph as compact markdown — used as part of the
 * system prompt so the AI has full structural context for analysis.
 */
export function serializeGraph(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): string {
  if (nodes.length === 0 && edges.length === 0) {
    return '_(empty canvas)_';
  }

  const lines: string[] = [];
  lines.push('## NODES');
  for (const n of nodes) {
    const meta = describeNode(n);
    lines.push(`- **${n.id}** (${n.data.type}): ${n.data.label}${meta ? ` — ${meta}` : ''}`);
  }
  if (edges.length > 0) {
    lines.push('');
    lines.push('## EDGES');
    for (const e of edges) {
      const data = (e.data as EdgeData | undefined) ?? { protocol: 'rest' };
      const arrow = data.async ? '·dashed·' : '──';
      lines.push(`- ${e.source} ${arrow}${data.protocol.toUpperCase()}${arrow}> ${e.target}${data.description ? ` — ${data.description}` : ''}`);
    }
  }
  return lines.join('\n');
}

function describeNode(n: Node<NodeData>): string {
  const parts: string[] = [];
  const item = findCatalogItem(n.data.type);
  if (item) parts.push(item.group);

  if (n.data.schema && n.data.schema.tables.length > 0) {
    const tables = n.data.schema.tables
      .map((t) => `${t.name}(${t.columns.length} col)`)
      .join(', ');
    parts.push(`tables: ${tables}`);
  }
  if (n.data.api && n.data.api.protocols.length > 0) {
    const protocols = n.data.api.protocols
      .map((p) => `${p.kind}:${p.endpoints.length}`)
      .join(', ');
    parts.push(`api: ${protocols}`);
  }
  if (n.data.consumer?.handler) {
    const src = n.data.consumer.sourceNodeId;
    parts.push(
      `consumer: ${n.data.consumer.handler}${src ? ` from ${src}` : ''}${
        n.data.consumer.schedule ? ` cron[${n.data.consumer.schedule}]` : ''
      }`,
    );
  }
  return parts.join(' · ');
}
