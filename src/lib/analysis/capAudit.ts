import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';
import type { Issue } from '@/lib/ai/issues';
import { effectiveEdgeLatencyMs } from '@/lib/capabilities/reliabilityDefaults';
import type { SpofSummary } from './types';

/**
 * Sanity checks that combine reliability annotations with graph structure:
 *
 * 1. cap-mismatch — a service flagged `consistencyModel: 'strong'` writes
 *    to a store flagged `cap: 'AP'` (or vice-versa). The pair will not
 *    deliver the consistency the service expects.
 * 2. latency-budget-blown — a service with `slo.latencyP99Ms` set has a
 *    direct outgoing edge whose default protocol latency already exceeds
 *    that budget. Definitely will blow.
 * 3. unreplicated-spof — a node lives at an articulation point but has
 *    `replicas` ≤ 1 (or undefined). Removing it cuts the graph and there
 *    is no warm spare.
 * 4. low-availability-target — availability target ≥ 0.999 but `replicas`
 *    is 1 / undefined: target is unreachable with a single instance.
 */
export function runCapAudit(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  spof: SpofSummary,
): Issue[] {
  const out: Issue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const articulationSet = new Set(spof.articulationPoints);

  // Async / event-driven edges (Kafka, AMQP, MQTT) and any edge marked
  // async deliberately accept eventual delivery semantics on the receiver
  // side — that's the point of CQRS / outbox / projection patterns. A
  // `consistencyModel: 'strong'` source publishing into an AP topic / index
  // is intentional, not a mismatch. cap-mismatch only fires for synchronous
  // hops where the source actually expects to read its write back.
  const ASYNC_PROTOCOLS = new Set(['kafka', 'amqp', 'mqtt']);

  for (const e of edges) {
    const src = byId.get(e.source);
    const dst = byId.get(e.target);
    if (!src || !dst) continue;
    const srcRel = src.data?.reliability;
    const dstRel = dst.data?.reliability;
    const data = (e.data ?? {}) as EdgeData;
    const isAsyncEdge =
      data.async === true || ASYNC_PROTOCOLS.has(data.protocol);
    if (
      !isAsyncEdge &&
      srcRel?.consistencyModel === 'strong' &&
      dstRel?.cap === 'AP'
    ) {
      out.push({
        severity: 'high',
        code: 'cap-mismatch',
        message: `${src.data.label} expects strong consistency but writes to ${dst.data.label} (CAP=AP) over a synchronous hop.`,
        anchor: { kind: 'edge', id: e.id },
      });
    }

    if (typeof srcRel?.slo?.latencyP99Ms === 'number') {
      const eff = effectiveEdgeLatencyMs(data.protocol, data.latencyMsHint);
      // Async hops are out of the synchronous request budget — comparing
      // their per-hop latency to a service's p99 SLO would flag every
      // event publisher. Only score sync hops against the budget.
      if (!isAsyncEdge && eff > srcRel.slo.latencyP99Ms) {
        out.push({
          severity: 'med',
          code: 'latency-budget-blown',
          message: `${src.data.label} p99 SLO is ${srcRel.slo.latencyP99Ms}ms but a single ${data.protocol} hop costs ~${eff}ms.`,
          anchor: { kind: 'edge', id: e.id },
        });
      }
    }
  }

  // External SaaS dependencies (Stripe, SendGrid, Twilio, …) live outside
  // the user's control plane: their replica count and redundancy mode are
  // managed by the provider, not modeled in this canvas. Auditing them
  // for "no replicas" produces noisy false positives, so external-tone
  // and external-category nodes are excluded from replication checks.
  const isExternalNode = (n: Node<NodeData>): boolean =>
    n.data?.tone === 'external' || n.data?.category === 'external';

  for (const id of articulationSet) {
    const n = byId.get(id);
    if (!n) continue;
    if (isExternalNode(n)) continue;
    const reps = n.data?.reliability?.replicas;
    if (reps === undefined || reps <= 1) {
      out.push({
        severity: 'high',
        code: 'unreplicated-spof',
        message: `${n.data.label} is a single point of failure with no replicas — failure cuts the graph.`,
        anchor: { kind: 'node', id },
      });
    }
  }

  for (const n of nodes) {
    if (isExternalNode(n)) continue;
    const rel = n.data?.reliability;
    if (!rel?.slo?.availability) continue;
    if (rel.slo.availability >= 0.999 && (rel.replicas ?? 0) <= 1) {
      out.push({
        severity: 'med',
        code: 'low-availability-target',
        message: `${n.data.label} targets ${(rel.slo.availability * 100).toFixed(2)}% availability with ≤1 replica — unattainable.`,
        anchor: { kind: 'node', id: n.id },
      });
    }
  }

  return out;
}
