import type { EdgeData, Protocol } from '@/types';
import { cn } from '@/lib/utils';

const PROTOCOLS: { kind: Protocol; label: string; async: boolean }[] = [
  { kind: 'rest', label: 'REST', async: false },
  { kind: 'grpc', label: 'gRPC', async: false },
  { kind: 'graphql', label: 'GraphQL', async: false },
  { kind: 'websocket', label: 'WebSocket', async: true },
  { kind: 'signalr', label: 'SignalR', async: false },
  { kind: 'kafka', label: 'Kafka', async: true },
  { kind: 'amqp', label: 'AMQP', async: true },
  { kind: 'mqtt', label: 'MQTT', async: true },
  { kind: 'sql', label: 'SQL', async: false },
  { kind: 'redis', label: 'Redis', async: false },
  { kind: 'tcp', label: 'TCP', async: false },
];

interface Props {
  data: EdgeData;
  onChange: (next: EdgeData) => void;
}

export function EdgeProtocolEditor({ data, onChange }: Props) {
  const setProtocol = (kind: Protocol) => {
    const meta = PROTOCOLS.find((p) => p.kind === kind);
    onChange({
      ...data,
      protocol: kind,
      async: meta?.async ?? data.async ?? false,
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1.5 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          Protocol
        </span>
        <div className="grid grid-cols-3 gap-1">
          {PROTOCOLS.map((p) => {
            const active = p.kind === data.protocol;
            return (
              <button
                key={p.kind}
                onClick={() => setProtocol(p.kind)}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-[10.5px] font-medium transition-colors',
                  active
                    ? 'border-accent text-text'
                    : 'border-border bg-input text-text-dim hover:bg-hover hover:text-text',
                )}
                style={
                  active
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                    : undefined
                }
              >
                {p.label}
                {p.async && <span className="ml-1 text-[8px] opacity-70">async</span>}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center justify-between rounded-md border border-border bg-input/60 px-2.5 py-2">
        <span className="text-[11px] text-text">Asynchronous (dashed line)</span>
        <input
          type="checkbox"
          checked={data.async ?? false}
          onChange={(e) => onChange({ ...data, async: e.target.checked })}
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          Description
        </span>
        <input
          value={data.description ?? ''}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="What flows here?"
          className="h-7 w-full rounded-md border border-border bg-input px-2 text-[11.5px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </label>
    </div>
  );
}
