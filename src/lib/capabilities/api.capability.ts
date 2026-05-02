/**
 * `api` capability — service/gateway/lambda için protokol blokları (REST,
 * gRPC, GraphQL, WebSocket, SignalR). Default merge: augment.
 */
import { z } from 'zod';
import type { ApiProtocolBlock, ApiSpec, NodeData } from '@/types';
import type { NodeCapability } from './types';
import { ProtocolSchema, dedupeBy, makeAppliesTo } from './zod-shared';

/**
 * Lenient şema: AI sıkça method'u kebabe sokuyor, endpoint'lerde alan
 * unutuyor, hatta protocols array'i atlayıp doğrudan endpoints listesi
 * döndürüyor. Hepsini tolere ediyoruz.
 */
const HttpMethod = z.preprocess(
  (v) => (typeof v === 'string' ? v.toUpperCase() : v),
  z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
);

/**
 * DTO field schema — lenient: AI often emits objects, JSON schema fragments,
 * or plain `[ "field:type" ]` strings. Coerce shapes we recognise into the
 * `{name, type, optional?, description?}` form; drop anything we can't.
 */
const DtoFieldSchema = z.preprocess((v) => {
  if (typeof v === 'string') {
    // "name:type" or "name: type" or "name?: type" (trailing ? = optional)
    const m = v.match(/^\s*([\w$]+)(\?)?\s*:\s*(.+?)\s*$/);
    if (m) {
      return {
        name: m[1],
        type: m[3],
        optional: !!m[2],
      };
    }
    return { name: v.trim(), type: 'string' };
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return {
      name:
        typeof o.name === 'string'
          ? o.name
          : typeof o.field === 'string'
            ? o.field
            : typeof o.key === 'string'
              ? o.key
              : '',
      type:
        typeof o.type === 'string'
          ? o.type
          : typeof o.dataType === 'string'
            ? o.dataType
            : 'string',
      optional:
        typeof o.optional === 'boolean'
          ? o.optional
          : typeof o.required === 'boolean'
            ? !o.required
            : undefined,
      description:
        typeof o.description === 'string' ? o.description : undefined,
    };
  }
  return v;
}, z.object({
  name: z.string(),
  type: z.string(),
  optional: z.boolean().optional(),
  description: z.string().optional(),
}));

const DtoFieldArraySchema = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  // Some models wrap fields in `{ properties: {...} }` JSON-Schema style.
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.properties && typeof o.properties === 'object') {
      return Object.entries(o.properties as Record<string, unknown>).map(
        ([name, raw]) => {
          if (raw && typeof raw === 'object') {
            const r = raw as Record<string, unknown>;
            return {
              name,
              type:
                typeof r.type === 'string' ? r.type : 'string',
              description:
                typeof r.description === 'string' ? r.description : undefined,
            };
          }
          return { name, type: 'string' };
        },
      );
    }
  }
  return v;
}, z.array(DtoFieldSchema));

const ApiEndpointSchema = z.object({
  method: HttpMethod,
  path: z.string().optional(),
  name: z.string().optional(),
  events: z.array(z.string()).optional(),
  description: z.string().optional(),
  request: DtoFieldArraySchema.optional(),
  response: DtoFieldArraySchema.optional(),
  statusCodes: z
    .preprocess(
      (v) => (Array.isArray(v) ? v.map((x) => String(x)) : v),
      z.array(z.string()),
    )
    .optional(),
});

const ApiProtocolBlockSchema = z.object({
  kind: ProtocolSchema, // alias-tolerant; default 'rest' uygulanır aşağıda
  baseUrl: z.string().optional(),
  endpoints: z.array(ApiEndpointSchema).default([]),
});

export const ApiSpecSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return {
      protocols: [
        {
          kind: 'rest',
          endpoints: value,
        },
      ],
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;

  if (Array.isArray(record.protocols)) return value;

  if (Array.isArray(record.endpoints)) {
    return {
      protocols: [
        {
          kind:
            typeof record.kind === 'string'
              ? record.kind
              : typeof record.protocol === 'string'
                ? record.protocol
                : 'rest',
          baseUrl:
            typeof record.baseUrl === 'string' ? record.baseUrl : undefined,
          endpoints: record.endpoints,
        },
      ],
    };
  }

  if (
    Array.isArray(record.routes) ||
    Array.isArray(record.operations) ||
    Array.isArray(record.apis)
  ) {
    const endpoints =
      (Array.isArray(record.routes) && record.routes) ||
      (Array.isArray(record.operations) && record.operations) ||
      (Array.isArray(record.apis) && record.apis) ||
      [];
    return {
      protocols: [
        {
          kind:
            typeof record.kind === 'string'
              ? record.kind
              : typeof record.protocol === 'string'
                ? record.protocol
                : 'rest',
          baseUrl:
            typeof record.baseUrl === 'string' ? record.baseUrl : undefined,
          endpoints,
        },
      ],
    };
  }

  const protocolKeys = [
    'rest',
    'grpc',
    'graphql',
    'websocket',
    'signalr',
  ] as const;
  const protocolBlocks = protocolKeys.flatMap((key) => {
    const raw = record[key];
    if (Array.isArray(raw)) {
      return [{ kind: key, endpoints: raw }];
    }
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const endpoints = Array.isArray(obj.endpoints)
        ? obj.endpoints
        : Array.isArray(obj.routes)
          ? obj.routes
          : Array.isArray(obj.operations)
            ? obj.operations
            : [];
      if (endpoints.length === 0) return [];
      return [
        {
          kind: key,
          baseUrl: typeof obj.baseUrl === 'string' ? obj.baseUrl : undefined,
          endpoints,
        },
      ];
    }
    return [];
  });
  if (protocolBlocks.length > 0) {
    return { protocols: protocolBlocks };
  }

  return value;
}, z.object({
  protocols: z.array(ApiProtocolBlockSchema).default([]),
}));

/** Endpoint kimliği — protokol bazlı. */
function endpointKey(
  block: ApiProtocolBlock,
  ep: ApiProtocolBlock['endpoints'][number],
): string {
  if (block.kind === 'rest' && ep.method && ep.path) {
    return `${block.kind}:${ep.method.toUpperCase()} ${ep.path}`;
  }
  if (ep.name) return `${block.kind}:${ep.name}`;
  if (ep.events && ep.events.length > 0)
    return `${block.kind}:events[${ep.events.sort().join(',')}]`;
  return `${block.kind}:${JSON.stringify(ep)}`;
}

export const apiCapability: NodeCapability<ApiSpec> = {
  id: 'api',
  label: 'API',
  patchOp: 'set_api',
  schema: ApiSpecSchema as unknown as z.ZodType<ApiSpec>,
  mergeStrategy: 'augment',
  order: 20,
  appliesTo: makeAppliesTo('api'),
  read: (node: NodeData) => node.api,
  write: (node, value) => ({ ...node, api: value }),
  merge: (prev, incoming) => {
    if (!prev || prev.protocols.length === 0) return incoming;
    // Protokol bloğu bazında merge: aynı kind iki tarafta varsa endpoint'ler
    // birleştirilir (key bazında dedupe). Yeni protokol blokları eklenir.
    const byKind = new Map<string, ApiProtocolBlock>();
    for (const block of prev.protocols) byKind.set(block.kind, { ...block });
    for (const block of incoming.protocols) {
      const existing = byKind.get(block.kind);
      if (!existing) {
        byKind.set(block.kind, block);
        continue;
      }
      const merged: ApiProtocolBlock = {
        ...existing,
        baseUrl: existing.baseUrl ?? block.baseUrl,
        endpoints: dedupeBy(
          [...existing.endpoints, ...block.endpoints],
          (ep) => endpointKey(existing, ep),
        ),
      };
      byKind.set(block.kind, merged);
    }
    return { protocols: Array.from(byKind.values()) };
  },
  promptInstruction: (mode) => {
    const dtoExample = [
      '## DTO REQUIREMENT — NON-NEGOTIABLE',
      'EVERY endpoint MUST carry both `request` and `response` field arrays.',
      'A patch with endpoints that lack DTOs is INVALID and will be rejected.',
      '',
      'Canonical shape (copy this verbatim, change values):',
      '```json',
      '{',
      '  "method": "POST",',
      '  "path": "/v1/orders",',
      '  "description": "Create a new order",',
      '  "request": [',
      '    { "name": "userId", "type": "uuid" },',
      '    { "name": "items", "type": "OrderItem[]" },',
      '    { "name": "couponCode", "type": "string", "optional": true }',
      '  ],',
      '  "response": [',
      '    { "name": "orderId", "type": "uuid" },',
      '    { "name": "totalCents", "type": "int" },',
      '    { "name": "createdAt", "type": "timestamp" }',
      '  ],',
      '  "statusCodes": ["201", "400", "409"]',
      '}',
      '```',
      '',
      'Hard rules:',
      '- `request` and `response` are arrays of `{name, type, optional?, description?}`. NEVER objects, NEVER JSON-Schema, NEVER omitted.',
      '- `name` AND `type` are required strings. `type` is free-form: primitives (string, int, uuid, timestamp, bool), arrays (`User[]`), or DTO refs (`OrderItem`).',
      '- `optional: true` for fields that may be omitted (default required).',
      '- GET / DELETE endpoints with no body: `request: []` (empty array, NEVER omit the key).',
      '- Error responses go in `statusCodes`; the `response` DTO describes the SUCCESS payload.',
      '- WebSocket / event endpoints: put the event payload schema in `response`.',
      '- A typical CRUD endpoint has 2-6 request fields and 3-8 response fields. Fewer than 2 fields total → almost certainly something is missing.',
      '',
      'WRITING DTOs IS THE PRIMARY DELIVERABLE OF THIS TASK. The endpoint method+path is the easy part; the model and the value of this patch is in the field-level shapes.',
    ].join('\n');

    if (mode === 'replace') {
      return (
        'Generate the ENDPOINT set for this service/gateway FROM SCRATCH. Look ' +
        'at neighbouring nodes to see which protocols they connect with (use the ' +
        'edge protocols). Emit method+path for REST, service.method for gRPC, ' +
        'query/mutation names for GraphQL.\n\n' +
        dtoExample +
        '\n\nWrite everything in one set_api patch. Ignore any existing ' +
        'endpoints — this is replace mode.'
      );
    }
    return (
      'Suggest the MISSING endpoints for this service AND fill in DTOs for any ' +
      'existing endpoints that are missing them. Existing endpoints must be ' +
      'copied verbatim into the payload, with new ones appended; if an existing ' +
      'endpoint has no `request`/`response` arrays, ADD them — do not just copy ' +
      'the empty endpoint forward.\n\n' +
      dtoExample +
      '\n\nEmit a single set_api patch containing the full list (existing + new).'
    );
  },
};
