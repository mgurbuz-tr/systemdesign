import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import type { ApiEndpoint, ApiProtocolBlock, ApiSpec, Protocol } from '@/types';
import { cn } from '@/lib/utils';

const PROTOCOL_TABS: { kind: Protocol; label: string }[] = [
  { kind: 'rest', label: 'REST' },
  { kind: 'grpc', label: 'gRPC' },
  { kind: 'graphql', label: 'GraphQL' },
  { kind: 'websocket', label: 'WebSocket' },
  { kind: 'signalr', label: 'SignalR' },
];

const HTTP_METHODS: ApiEndpoint['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

interface Props {
  api: ApiSpec;
  allowedProtocols?: Protocol[];
  onChange: (next: ApiSpec) => void;
}

export function ApiEndpointEditor({ api, allowedProtocols, onChange }: Props) {
  const tabs = allowedProtocols
    ? PROTOCOL_TABS.filter((t) => allowedProtocols.includes(t.kind))
    : PROTOCOL_TABS;

  const [activeKind, setActiveKind] = useState<Protocol>(
    () => tabs[0]?.kind ?? 'rest',
  );

  const block = api.protocols.find((p) => p.kind === activeKind);

  const ensureBlock = (): ApiProtocolBlock => {
    if (block) return block;
    const fresh: ApiProtocolBlock = { kind: activeKind, endpoints: [] };
    onChange({ protocols: [...api.protocols, fresh] });
    return fresh;
  };

  const updateBlock = (patch: Partial<ApiProtocolBlock>) => {
    const exists = api.protocols.some((p) => p.kind === activeKind);
    const nextProtocols = exists
      ? api.protocols.map((p) =>
          p.kind === activeKind ? { ...p, ...patch } : p,
        )
      : [...api.protocols, { kind: activeKind, endpoints: [], ...patch }];
    onChange({ protocols: nextProtocols });
  };

  const addEndpoint = () => {
    const b = ensureBlock();
    const seed: ApiEndpoint = (() => {
      switch (activeKind) {
        case 'rest':
          return { method: 'GET', path: '/v1/resource' };
        case 'grpc':
          return { name: 'Service.Method' };
        case 'graphql':
          return { name: 'queryName' };
        case 'websocket':
          return { events: ['message'] };
        case 'signalr':
          return { name: 'HubMethod', events: ['notification'] };
        default:
          return {};
      }
    })();
    updateBlock({ endpoints: [...b.endpoints, seed] });
  };

  const updateEndpoint = (i: number, patch: Partial<ApiEndpoint>) => {
    if (!block) return;
    updateBlock({
      endpoints: block.endpoints.map((e, ix) => (ix === i ? { ...e, ...patch } : e)),
    });
  };

  const removeEndpoint = (i: number) => {
    if (!block) return;
    updateBlock({ endpoints: block.endpoints.filter((_, ix) => ix !== i) });
  };

  return (
    <div className="space-y-3">
      <div className="-mx-3.5 flex gap-0.5 overflow-x-auto border-b border-border px-3.5">
        {tabs.map((t) => (
          <button
            key={t.kind}
            onClick={() => setActiveKind(t.kind)}
            className={cn(
              'relative whitespace-nowrap px-2 pb-1.5 pt-0.5 text-[11px] font-medium',
              activeKind === t.kind
                ? 'text-text'
                : 'text-text-dim hover:text-text',
            )}
          >
            {t.label}
            {activeKind === t.kind && (
              <motion.span
                layoutId="api-tab-indicator"
                className="absolute bottom-[-1px] left-0 right-0 h-[1.5px]"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
            Base URL
          </span>
          <input
            value={block?.baseUrl ?? ''}
            onChange={(e) => updateBlock({ baseUrl: e.target.value })}
            placeholder={baseUrlPlaceholder(activeKind)}
            className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-between">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
            Endpoints · {block?.endpoints.length ?? 0}
          </span>
          <button
            onClick={addEndpoint}
            className="flex items-center gap-1 rounded-md border border-border bg-input px-2 py-0.5 text-[10.5px] text-text hover:bg-hover"
          >
            <Icon name="plus" size={10} />
            <span>{endpointAddLabel(activeKind)}</span>
          </button>
        </div>

        <AnimatePresence initial={false}>
          {(block?.endpoints ?? []).map((ep, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden rounded-md border border-border bg-input/40 p-2"
            >
              <EndpointFields
                kind={activeKind}
                endpoint={ep}
                onChange={(p) => updateEndpoint(i, p)}
                onRemove={() => removeEndpoint(i)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {(!block || block.endpoints.length === 0) && (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-[10.5px] text-text-dim">
            Bu protokolde henüz endpoint yok.
          </div>
        )}
      </div>
    </div>
  );
}

function EndpointFields({
  kind,
  endpoint,
  onChange,
  onRemove,
}: {
  kind: Protocol;
  endpoint: ApiEndpoint;
  onChange: (p: Partial<ApiEndpoint>) => void;
  onRemove: () => void;
}) {
  const isRest = kind === 'rest';
  const isWs = kind === 'websocket';
  const hasName = ['grpc', 'graphql', 'signalr'].includes(kind);
  const hasEvents = kind === 'websocket' || kind === 'signalr';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {isRest && (
          <select
            value={endpoint.method ?? 'GET'}
            onChange={(e) =>
              onChange({ method: e.target.value as ApiEndpoint['method'] })
            }
            className="h-6 rounded border border-border bg-input px-1.5 font-mono text-[10.5px] text-text focus:border-accent focus:outline-none"
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m} className="bg-panel">
                {m}
              </option>
            ))}
          </select>
        )}
        {isRest && (
          <input
            value={endpoint.path ?? ''}
            onChange={(e) => onChange({ path: e.target.value })}
            placeholder="/v1/resource"
            className="h-6 flex-1 rounded border border-transparent bg-transparent px-1.5 font-mono text-[11px] text-text focus:border-border focus:bg-input focus:outline-none"
          />
        )}
        {hasName && (
          <input
            value={endpoint.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={
              kind === 'grpc'
                ? 'Service.Method'
                : kind === 'graphql'
                  ? 'queryName'
                  : 'HubMethod'
            }
            className="h-6 flex-1 rounded border border-transparent bg-transparent px-1.5 font-mono text-[11px] text-text focus:border-border focus:bg-input focus:outline-none"
          />
        )}
        {isWs && !hasName && <div className="flex-1 text-[10px] text-text-dim">events ↓</div>}
        <button
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
          aria-label="Remove endpoint"
        >
          <Icon name="trash" size={10} />
        </button>
      </div>

      {hasEvents && (
        <input
          value={(endpoint.events ?? []).join(', ')}
          onChange={(e) =>
            onChange({
              events: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="event-name, another-event"
          className="h-6 w-full rounded border border-border bg-input px-1.5 font-mono text-[10.5px] text-text-dim focus:border-accent focus:outline-none"
        />
      )}

      <input
        value={endpoint.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description (optional)"
        className="h-5 w-full border-none bg-transparent text-[10.5px] text-text-dim focus:outline-none"
      />
    </div>
  );
}

function baseUrlPlaceholder(kind: Protocol): string {
  switch (kind) {
    case 'rest':
      return 'https://api.example.com';
    case 'grpc':
      return 'grpc.example.com:50051';
    case 'graphql':
      return 'https://api.example.com/graphql';
    case 'websocket':
      return 'wss://realtime.example.com';
    case 'signalr':
      return 'https://api.example.com/hubs/notifications';
    default:
      return '';
  }
}

function endpointAddLabel(kind: Protocol): string {
  switch (kind) {
    case 'rest':
      return 'Endpoint';
    case 'grpc':
      return 'Method';
    case 'graphql':
      return 'Resolver';
    case 'websocket':
      return 'Channel';
    case 'signalr':
      return 'Hub method';
    default:
      return 'Item';
  }
}
