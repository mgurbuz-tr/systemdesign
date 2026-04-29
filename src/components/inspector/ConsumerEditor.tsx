import { Icon } from '@/components/ui/Icon';
import type { ConsumerSpec, NodeData } from '@/types';
import type { Node } from '@xyflow/react';

interface Props {
  consumer: ConsumerSpec;
  nodes: Node<NodeData>[];
  selfId: string;
  onChange: (next: ConsumerSpec) => void;
}

export function ConsumerEditor({ consumer, nodes, selfId, onChange }: Props) {
  const sources = nodes.filter(
    (n) => n.id !== selfId && (n.data.tone === 'queue' || n.data.tone === 'data'),
  );
  const sourceNode = nodes.find((n) => n.id === consumer.sourceNodeId);

  return (
    <div className="space-y-3">
      <Field label="Source (queue / topic)">
        <div className="flex items-center gap-2">
          <select
            value={consumer.sourceNodeId ?? ''}
            onChange={(e) => onChange({ ...consumer, sourceNodeId: e.target.value || undefined })}
            className="h-7 flex-1 rounded-md border border-border bg-input px-2 text-[11.5px] text-text focus:border-accent focus:outline-none"
          >
            <option value="" className="bg-panel">
              — none —
            </option>
            {sources.map((n) => (
              <option key={n.id} value={n.id} className="bg-panel">
                {n.data.label} ({n.data.type})
              </option>
            ))}
          </select>
          {sourceNode && (
            <span
              className="rounded-full px-2 py-0.5 text-[9.5px] font-medium"
              style={{
                background: `var(--tone-${sourceNode.data.tone}-bg)`,
                color: `var(--tone-${sourceNode.data.tone}-fg)`,
              }}
            >
              {sourceNode.data.type}
            </span>
          )}
        </div>
      </Field>

      <Field label="Handler">
        <input
          value={consumer.handler}
          onChange={(e) => onChange({ ...consumer, handler: e.target.value })}
          placeholder="process_event"
          className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11.5px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Schedule (cron)">
          <input
            value={consumer.schedule ?? ''}
            onChange={(e) => onChange({ ...consumer, schedule: e.target.value || undefined })}
            placeholder="*/5 * * * *"
            className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Concurrency">
          <input
            type="number"
            min={1}
            value={consumer.concurrency ?? 1}
            onChange={(e) =>
              onChange({ ...consumer, concurrency: Number(e.target.value) || 1 })
            }
            className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
          />
        </Field>
      </div>

      {!consumer.sourceNodeId && (
        <p className="flex items-start gap-1.5 rounded-md bg-input/60 p-2 text-[10.5px] text-text-dim">
          <Icon name="sparkles" size={11} />
          <span>
            Bu worker hangi queue ya da topic'ten besleniyor? Source seçince edge
            otomatik çizilebilir.
          </span>
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
        {label}
      </span>
      {children}
    </label>
  );
}
