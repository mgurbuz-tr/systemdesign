import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, Tone } from '@/types';
import { findCatalogItem } from '@/lib/catalog';

/**
 * Serializes the current graph as JSON-shaped markdown so the AI sees a
 * canonical, fully-populated record for every node — even unset fields are
 * present as `null` (or `[]` for empty arrays). Without this, the model
 * cannot tell "field not specified" from "field deliberately empty" and
 * tends to omit DTOs / reliability / SLO when proposing patches.
 *
 * Trade-off: large graphs balloon the prompt. The user explicitly asked for
 * full detail every turn; pair this with a long-context model (e.g. Nemotron
 * Nano Omni — 128K). For smaller models, slim down via canvas selection.
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

  const groups = visible
    .filter((n) => n.type === 'group')
    .map((g) => ({
      id: g.id,
      label: (g.data as { label?: string } | undefined)?.label ?? g.id,
    }));

  const liveNodes = visible.filter((n) => n.type !== 'group');

  const canonicalNodes = liveNodes.map((n) => canonicalNode(n, selectedId));
  const canonicalEdges = edges.map(canonicalEdge);

  const lines: string[] = [];

  if (selectedId) {
    const sel = canonicalNodes.find((n) => n.selected);
    if (sel) {
      lines.push('## SELECTED NODE');
      lines.push('```json');
      lines.push(JSON.stringify(sel, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  if (groups.length > 0) {
    lines.push('## GROUPS');
    lines.push('```json');
    lines.push(JSON.stringify(groups, null, 2));
    lines.push('```');
    lines.push('');
  }

  const others = canonicalNodes.filter((n) => !n.selected);
  lines.push('## NODES');
  lines.push(
    'Each node ships its full canonical shape. `null` means "not specified yet"; `[]` means "explicitly empty".',
  );
  lines.push('```json');
  lines.push(JSON.stringify(others, null, 2));
  lines.push('```');
  lines.push('');

  if (canonicalEdges.length > 0) {
    lines.push('## EDGES');
    lines.push('```json');
    lines.push(JSON.stringify(canonicalEdges, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

interface CanonicalEndpoint {
  method: string | null;
  path: string | null;
  name: string | null;
  events: string[] | null;
  description: string | null;
  request: Array<{
    name: string;
    type: string;
    optional: boolean;
    description: string | null;
  }> | null;
  response: Array<{
    name: string;
    type: string;
    optional: boolean;
    description: string | null;
  }> | null;
  statusCodes: string[] | null;
}

interface CanonicalNode {
  selected: boolean;
  id: string;
  type: string;
  label: string;
  tone: Tone;
  parent: string | null;
  catalogGroup: string | null;
  meta: string | null;
  schema: { tables: unknown[] } | null;
  api: {
    protocols: Array<{
      kind: string;
      baseUrl: string | null;
      endpoints: CanonicalEndpoint[];
    }>;
  } | null;
  consuming: {
    sourceNodeId: string | null;
    handler: string | null;
    concurrency: number | null;
    deadLetterNodeId: string | null;
    notes: string | null;
  } | null;
  scheduled: {
    schedule: string | null;
    handler: string | null;
    description: string | null;
    timezone: string | null;
  } | null;
  producing: {
    events: Array<{
      name: string;
      publishers: string[];
      fields: Array<{ name: string; type: string; description: string | null }>;
      description: string | null;
    }>;
  } | null;
  reliability: {
    cap: string | null;
    pacelc: string | null;
    consistencyModel: string | null;
    slo: {
      latencyP99Ms: number | null;
      availability: number | null;
      rpsTarget: number | null;
    };
    replicas: number | null;
    redundancy: string | null;
    failureModes: string[];
  } | null;
  architectureNotes: {
    summary: string | null;
    designPatterns: string[];
    capTradeoffs: string[];
    operationalRisks: string[];
    recommendations: string[];
  } | null;
  notes: string | null;
}

function canonicalNode(
  n: Node<NodeData>,
  selectedId: string | null,
): CanonicalNode {
  const d = n.data;
  const item = findCatalogItem(d.type);
  return {
    selected: n.id === selectedId,
    id: n.id,
    type: d.type,
    label: d.label,
    tone: d.tone,
    parent: n.parentId ?? null,
    catalogGroup: item?.group ?? null,
    meta: d.meta ?? null,
    schema: d.schema ? { tables: d.schema.tables } : null,
    api: d.api
      ? {
          protocols: d.api.protocols.map((b) => ({
            kind: b.kind,
            baseUrl: b.baseUrl ?? null,
            endpoints: b.endpoints.map(
              (ep): CanonicalEndpoint => ({
                method: ep.method ?? null,
                path: ep.path ?? null,
                name: ep.name ?? null,
                events: ep.events && ep.events.length > 0 ? ep.events : null,
                description: ep.description ?? null,
                request:
                  ep.request === undefined
                    ? null
                    : ep.request.map((f) => ({
                        name: f.name,
                        type: f.type,
                        optional: !!f.optional,
                        description: f.description ?? null,
                      })),
                response:
                  ep.response === undefined
                    ? null
                    : ep.response.map((f) => ({
                        name: f.name,
                        type: f.type,
                        optional: !!f.optional,
                        description: f.description ?? null,
                      })),
                statusCodes:
                  ep.statusCodes && ep.statusCodes.length > 0
                    ? ep.statusCodes
                    : null,
              }),
            ),
          })),
        }
      : null,
    consuming: d.consuming
      ? {
          sourceNodeId: d.consuming.sourceNodeId ?? null,
          handler: d.consuming.handler ?? null,
          concurrency: d.consuming.concurrency ?? null,
          deadLetterNodeId: d.consuming.deadLetterNodeId ?? null,
          notes: d.consuming.notes ?? null,
        }
      : null,
    scheduled: d.scheduled
      ? {
          schedule: d.scheduled.schedule,
          handler: d.scheduled.handler ?? null,
          description: d.scheduled.description ?? null,
          timezone: d.scheduled.timezone ?? null,
        }
      : null,
    producing: d.producing
      ? {
          events: d.producing.events.map((e) => ({
            name: e.name,
            publishers: e.publishers ?? [],
            fields: (e.fields ?? []).map((f) => ({
              name: f.name,
              type: f.type,
              description: f.description ?? null,
            })),
            description: e.description ?? null,
          })),
        }
      : null,
    reliability: d.reliability
      ? {
          cap: d.reliability.cap ?? null,
          pacelc: d.reliability.pacelc ?? null,
          consistencyModel: d.reliability.consistencyModel ?? null,
          slo: {
            latencyP99Ms: d.reliability.slo?.latencyP99Ms ?? null,
            availability: d.reliability.slo?.availability ?? null,
            rpsTarget: d.reliability.slo?.rpsTarget ?? null,
          },
          replicas: d.reliability.replicas ?? null,
          redundancy: d.reliability.redundancy ?? null,
          failureModes: d.reliability.failureModes ?? [],
        }
      : null,
    architectureNotes: d.architectureNotes
      ? {
          summary: d.architectureNotes.summary ?? null,
          designPatterns: d.architectureNotes.designPatterns ?? [],
          capTradeoffs: d.architectureNotes.capTradeoffs ?? [],
          operationalRisks: d.architectureNotes.operationalRisks ?? [],
          recommendations: d.architectureNotes.recommendations ?? [],
        }
      : null,
    notes: d.notes && d.notes.trim() ? d.notes : null,
  };
}

interface CanonicalEdge {
  id: string;
  source: string;
  target: string;
  protocol: string;
  description: string | null;
  async: boolean;
  latencyMsHint: number | null;
  criticality: string | null;
}

function canonicalEdge(e: Edge<EdgeData>): CanonicalEdge {
  const data = (e.data ?? {}) as EdgeData;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    protocol: data.protocol,
    description: data.description ?? null,
    async: !!data.async,
    latencyMsHint: data.latencyMsHint ?? null,
    criticality: data.criticality ?? null,
  };
}

/**
 * Reference example used inside the system prompt so the model knows the
 * canonical shape it should fill in. Returned as a markdown block ready to
 * splice into prompts.
 */
export const REFERENCE_NODE_SHAPE = `## REFERENCE NODE SHAPE — every node above ships in this canonical form

\`\`\`json
{
  "id": "auth-svc",
  "type": "service",
  "label": "Auth Service",
  "tone": "service",
  "parent": "g-services",
  "schema": null,
  "api": {
    "protocols": [
      {
        "kind": "rest",
        "baseUrl": "https://api.example.com",
        "endpoints": [
          {
            "method": "POST",
            "path": "/auth/login",
            "name": null,
            "events": null,
            "description": "Exchange credentials for a JWT",
            "request": [
              { "name": "email", "type": "string", "optional": false, "description": null },
              { "name": "password", "type": "string", "optional": false, "description": null }
            ],
            "response": [
              { "name": "token", "type": "string", "optional": false, "description": "JWT bearer" },
              { "name": "expiresAt", "type": "timestamp", "optional": false, "description": null }
            ],
            "statusCodes": ["200", "401"]
          }
        ]
      }
    ]
  },
  "consuming": null,
  "scheduled": null,
  "producing": null,
  "reliability": {
    "cap": "AP",
    "pacelc": "PA/EL",
    "consistencyModel": "read-your-writes",
    "slo": { "latencyP99Ms": 120, "availability": 0.999, "rpsTarget": 500 },
    "replicas": 3,
    "redundancy": "active-active",
    "failureModes": ["JWT signing key rotation lag", "Postgres replica lag spike"]
  },
  "architectureNotes": {
    "summary": "Auth owns token issuance and session validation for all clients.",
    "designPatterns": ["token-based auth", "cache-aside"],
    "capTradeoffs": ["Credential writes favor consistency, session caches can lag briefly"],
    "operationalRisks": ["Replica lag can surface stale session state after password reset"],
    "recommendations": ["Use an outbox for auth audit events", "Cache JWKS reads close to the edge"]
  },
  "notes": "## Summary\\nAuth owns token issuance and session validation for all clients.\\n\\n## Recommendations\\n- Use an outbox for auth audit events\\n- Cache JWKS reads close to the edge"
}
\`\`\`

Reading rules:
- A field set to \`null\` means "not yet specified" — propose a value when relevant.
- An empty array \`[]\` means "explicitly defined as zero items" — don't add to it unless asked.
- A field set to a value means "user-decided" — preserve it in augment-mode patches.
- Endpoint \`request\` / \`response\` arrays carry full DTO field lists; if either is \`null\`, propose one.
- \`reliability\` set to \`null\` on a service / data / cache / queue node is a gap — recommend filling it.`;
