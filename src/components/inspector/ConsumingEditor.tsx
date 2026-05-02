import { Icon } from '@/components/ui/Icon';
import type { ConsumingSpec, NodeData } from '@/types';
import type { Node } from '@xyflow/react';

/**
 * `consuming` capability editor — kuyruktan/topic'ten mesaj tüketen worker
 * config'i. Kapsam: source queue, handler, concurrency, ölü-mektup hedefi,
 * serbest notlar. Cron alanı YOK — onun için ayrı `ScheduledEditor`.
 */
interface Props {
  consuming: ConsumingSpec;
  nodes: Node<NodeData>[];
  selfId: string;
  onChange: (next: ConsumingSpec) => void;
}

export function ConsumingEditor({ consuming, nodes, selfId, onChange }: Props) {
  const queues = nodes.filter(
    (n) => n.id !== selfId && n.data.tone === 'queue',
  );
  const sourceNode = nodes.find((n) => n.id === consuming.sourceNodeId);
  const dlqOptions = queues.filter((n) => n.id !== consuming.sourceNodeId);

  return (
    <div className="space-y-3">
      <Field label="Source (queue / topic)">
        <div className="flex items-center gap-2">
          <select
            value={consuming.sourceNodeId ?? ''}
            onChange={(e) =>
              onChange({
                ...consuming,
                sourceNodeId: e.target.value || undefined,
              })
            }
            className="h-7 flex-1 rounded-md border border-border bg-input px-2 text-[11.5px] text-text focus:border-accent focus:outline-none"
          >
            <option value="" className="bg-panel">
              — none —
            </option>
            {queues.map((n) => (
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
          value={consuming.handler}
          onChange={(e) => onChange({ ...consuming, handler: e.target.value })}
          placeholder="process_event"
          className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11.5px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Concurrency">
          <input
            type="number"
            min={1}
            value={consuming.concurrency ?? 1}
            onChange={(e) =>
              onChange({
                ...consuming,
                concurrency: Number(e.target.value) || 1,
              })
            }
            className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Dead-letter">
          <select
            value={consuming.deadLetterNodeId ?? ''}
            onChange={(e) =>
              onChange({
                ...consuming,
                deadLetterNodeId: e.target.value || undefined,
              })
            }
            className="h-7 w-full rounded-md border border-border bg-input px-2 text-[11px] text-text focus:border-accent focus:outline-none"
          >
            <option value="" className="bg-panel">
              — none —
            </option>
            {dlqOptions.map((n) => (
              <option key={n.id} value={n.id} className="bg-panel">
                {n.data.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={consuming.notes ?? ''}
          onChange={(e) =>
            onChange({ ...consuming, notes: e.target.value || undefined })
          }
          placeholder="idempotency key: event.id · retry: exp 3x"
          rows={2}
          className="w-full resize-y rounded-md border border-border bg-input px-2 py-1 font-mono text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </Field>

      {!consuming.sourceNodeId && (
        <p className="flex items-start gap-1.5 rounded-md bg-input/60 p-2 text-[10.5px] text-text-dim">
          <Icon name="sparkles" size={11} />
          <span>
            Which queue/topic does this worker consume from? Picking a source
            can auto-draw the edge.
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
