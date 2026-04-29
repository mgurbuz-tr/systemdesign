import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';

interface Props {
  node: Node<NodeData>;
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
}

interface Stat {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Lightweight derived stats for the currently selected node — used as a
 * quick capacity/structure preview. Heuristics are intentionally simple;
 * for deeper analysis the user can ask the AI Copilot.
 */
export function QuickStats({ node, nodes, edges }: Props) {
  const incoming = edges.filter((e) => e.target === node.id);
  const outgoing = edges.filter((e) => e.source === node.id);
  const stats: Stat[] = [
    { label: 'Incoming', value: String(incoming.length), hint: 'edges arriving' },
    { label: 'Outgoing', value: String(outgoing.length), hint: 'edges leaving' },
  ];

  if (node.data.tone === 'data' && node.data.schema) {
    const tables = node.data.schema.tables;
    const cols = tables.reduce((sum, t) => sum + t.columns.length, 0);
    const fks = tables.reduce(
      (sum, t) => sum + t.columns.filter((c) => c.foreignKey).length,
      0,
    );
    const idx = tables.reduce((sum, t) => sum + t.indexes.length, 0);
    stats.push(
      { label: 'Tables', value: String(tables.length) },
      { label: 'Columns', value: String(cols) },
      { label: 'FKs', value: String(fks) },
      { label: 'Indexes', value: String(idx) },
    );
    if (tables.length > 0) {
      // Storage Fermi: tables × 100k rows × ~256B avg row ≈ ~25MB/table
      const estStorage = tables.length * 25;
      stats.push({
        label: 'Storage~',
        value: `${estStorage} MB`,
        hint: '~100k rows/table heuristic',
      });
    }
  }

  if (node.data.api) {
    const endpoints = node.data.api.protocols.reduce(
      (sum, p) => sum + p.endpoints.length,
      0,
    );
    const protocols = node.data.api.protocols.length;
    stats.push(
      { label: 'Protocols', value: String(protocols) },
      { label: 'Endpoints', value: String(endpoints) },
    );
    if (endpoints > 0) {
      // Fermi: endpoints × ~200 RPS typical mid-traffic service
      stats.push({
        label: 'Peak RPS~',
        value: `${endpoints * 200}`,
        hint: '~200 RPS/endpoint heuristic',
      });
    }
  }

  if (node.data.consumer) {
    const c = node.data.consumer;
    const src = nodes.find((n) => n.id === c.sourceNodeId);
    stats.push(
      { label: 'Source', value: src ? src.data.label : '—' },
      { label: 'Concurrency', value: String(c.concurrency ?? 1) },
    );
    if (c.schedule) stats.push({ label: 'Cron', value: c.schedule });
  }

  if (incoming.length > 0) {
    const protocols = new Set(
      incoming.map((e) => (e.data as EdgeData | undefined)?.protocol).filter(Boolean),
    );
    if (protocols.size > 0) {
      stats.push({
        label: 'In protocols',
        value: Array.from(protocols).join(', ').toUpperCase(),
      });
    }
  }

  if (stats.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
        Quick stats
      </h3>
      <div className="grid grid-cols-2 gap-1">
        {stats.map((s) => (
          <div
            key={s.label}
            title={s.hint}
            className="rounded-md border border-border bg-input/40 px-2 py-1.5"
          >
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
              {s.label}
            </div>
            <div className="nums truncate text-[12.5px] font-medium text-text">
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text-dim">
        Heuristic estimates · ask AI for deeper analysis.
      </p>
    </section>
  );
}
