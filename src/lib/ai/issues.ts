/**
 * Heuristic issue scanner. Runs locally over the current graph and returns
 * structural problems we can detect without an LLM. The AiPanel ships these
 * findings to the model alongside a "validate/extend" prompt — heuristics
 * catch the obvious stuff cheaply, the model layers on the architectural
 * judgment.
 */
import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, Tone } from '@/types';

export type IssueSeverity = 'high' | 'med' | 'low';

export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Anchor — node or edge id this issue is about. Used for click-to-focus. */
  anchor?: { kind: 'node' | 'edge'; id: string };
}

const ASYNC_PROTOCOLS = new Set(['kafka', 'amqp', 'mqtt', 'websocket']);

export function scanIssues(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): Issue[] {
  const issues: Issue[] = [];
  const visible = nodes.filter((n) => n.type !== 'comment' && !n.data?.hidden);

  if (visible.length === 0) return issues;

  // Index for cheap lookups
  const byId = new Map(visible.map((n) => [n.id, n] as const));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
  }

  for (const n of visible) {
    if (n.type === 'group') continue;
    const tone = n.data?.tone as Tone | undefined;
    const id = n.id;
    const label = n.data?.label ?? id;

    // 1. Orphan: no edges in/out and not a client (entry) node.
    const inDeg = incoming.get(id) ?? 0;
    const outDeg = outgoing.get(id) ?? 0;
    if (inDeg === 0 && outDeg === 0 && tone !== 'client' && tone !== 'external') {
      issues.push({
        severity: 'med',
        code: 'orphan-node',
        message: `${label} hiçbir bağlantısı yok — kullanılıyor mu, gerek var mı?`,
        anchor: { kind: 'node', id },
      });
    }

    // 2. Database with no schema defined.
    if (tone === 'data' && (!n.data?.schema || n.data.schema.tables.length === 0)) {
      issues.push({
        severity: 'low',
        code: 'empty-schema',
        message: `${label} tanımlı tablo yok — schema editor ile veri modelini ekle.`,
        anchor: { kind: 'node', id },
      });
    }

    // 3. API service with no protocols/endpoints defined.
    if (tone === 'service' && n.data?.api) {
      const totalEndpoints = n.data.api.protocols.reduce(
        (s, p) => s + p.endpoints.length,
        0,
      );
      if (totalEndpoints === 0) {
        issues.push({
          severity: 'low',
          code: 'empty-api',
          message: `${label} API endpoint tanımlı değil.`,
          anchor: { kind: 'node', id },
        });
      }
    }

    // 4. Consumer without source.
    if (n.data?.consumer && !n.data.consumer.sourceNodeId) {
      issues.push({
        severity: 'med',
        code: 'consumer-orphan',
        message: `${label} consumer ama hangi queue'yu tükettiği belirtilmemiş.`,
        anchor: { kind: 'node', id },
      });
    }

    // 5. Hot service hint: heavy in-degree, no cache neighbor.
    if (tone === 'service' && inDeg >= 2) {
      const neighbors = edges.filter((e) => e.source === id || e.target === id);
      const hasCache = neighbors.some((e) => {
        const other = e.source === id ? e.target : e.source;
        return byId.get(other)?.data?.tone === 'cache';
      });
      if (!hasCache) {
        issues.push({
          severity: 'low',
          code: 'no-cache',
          message: `${label} ${inDeg} bağlantı alıyor ama cache komşusu yok — read pattern varsa Redis koymayı düşün.`,
          anchor: { kind: 'node', id },
        });
      }
    }
  }

  for (const e of edges) {
    const data = (e.data ?? {}) as EdgeData;
    const source = byId.get(e.source);
    const target = byId.get(e.target);
    if (!source || !target) continue;

    // 6. async edge but target isn't a queue/stream — usually a typo.
    if (data.async || ASYNC_PROTOCOLS.has(data.protocol)) {
      const targetTone = target.data?.tone;
      if (targetTone !== 'queue' && targetTone !== 'service') {
        issues.push({
          severity: 'med',
          code: 'async-non-queue',
          message: `${source.data.label} → ${target.data.label} async/${data.protocol} ama hedef queue/service değil.`,
          anchor: { kind: 'edge', id: e.id },
        });
      }
    }

    // 7. SQL edge but target isn't a database.
    if (data.protocol === 'sql' && target.data?.tone !== 'data') {
      issues.push({
        severity: 'high',
        code: 'sql-non-db',
        message: `${source.data.label} → ${target.data.label} SQL ama hedef DB değil.`,
        anchor: { kind: 'edge', id: e.id },
      });
    }

    // 8. Redis protocol but target isn't a cache.
    if (data.protocol === 'redis' && target.data?.tone !== 'cache') {
      issues.push({
        severity: 'med',
        code: 'redis-non-cache',
        message: `${source.data.label} → ${target.data.label} REDIS ama hedef cache değil.`,
        anchor: { kind: 'edge', id: e.id },
      });
    }
  }

  // 9. No observability anywhere (only flag for non-trivial graphs).
  if (visible.length >= 5) {
    const hasOps = visible.some((n) => n.data?.tone === 'ops');
    if (!hasOps) {
      issues.push({
        severity: 'low',
        code: 'no-observability',
        message:
          '5+ component var ama observability/logs/metrics node yok — Prometheus/Grafana/OTel düşün.',
      });
    }
  }

  // 10. No auth boundary on a multi-client system.
  const hasGateway = visible.some((n) => n.data?.type === 'gateway');
  const hasAuth = visible.some(
    (n) => n.data?.tone === ('auth' as Tone) || n.data?.category === 'auth',
  );
  const hasService = visible.some((n) => n.data?.tone === 'service');
  if (hasGateway && hasService && !hasAuth) {
    issues.push({
      severity: 'med',
      code: 'no-auth',
      message: 'API Gateway + servisler var ama auth/IdP node yok.',
    });
  }

  // Sort by severity
  const order: Record<IssueSeverity, number> = { high: 0, med: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return issues;
}

export function formatIssuesMarkdown(issues: Issue[]): string {
  if (issues.length === 0) {
    return '_(yapısal sorun bulunamadı)_';
  }
  const sevIcon: Record<IssueSeverity, string> = {
    high: '🔴',
    med: '🟡',
    low: '🔵',
  };
  return issues
    .map(
      (i) =>
        `- ${sevIcon[i.severity]} **${i.code}** — ${i.message}${
          i.anchor ? ` _(→ ${i.anchor.kind}:${i.anchor.id})_` : ''
        }`,
    )
    .join('\n');
}
