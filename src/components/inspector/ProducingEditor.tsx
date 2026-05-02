import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { NodeData, ProducedEvent, ProducingSpec } from '@/types';
import type { Node } from '@xyflow/react';

/**
 * `producing` capability editor — Kafka topic / RabbitMQ exchange / SNS
 * gibi event-bus node'larında "hangi event'ler yazılıyor, kim publisher"
 * tanımı. Augment merge varsayılan; eski event'ler korunup yenileri eklenir.
 */
interface Props {
  producing: ProducingSpec;
  nodes: Node<NodeData>[];
  selfId: string;
  onChange: (next: ProducingSpec) => void;
}

export function ProducingEditor({ producing, nodes, selfId, onChange }: Props) {
  const publisherOptions = nodes.filter(
    (n) => n.id !== selfId && (n.data.tone === 'service' || n.data.tone === 'edge'),
  );
  const [expanded, setExpanded] = useState<string | null>(
    producing.events[0]?.name ?? null,
  );

  const addEvent = () => {
    const name = `Event${producing.events.length + 1}`;
    onChange({
      events: [...producing.events, { name, publishers: [], fields: [] }],
    });
    setExpanded(name);
  };

  const updateEvent = (idx: number, patch: Partial<ProducedEvent>) => {
    const next = producing.events.map((e, i) =>
      i === idx ? { ...e, ...patch } : e,
    );
    onChange({ events: next });
  };

  const removeEvent = (idx: number) => {
    onChange({ events: producing.events.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2">
      {producing.events.length === 0 && (
        <p className="rounded-md bg-input/60 p-2 text-[10.5px] text-text-dim">
          Which events are written to this queue? Add an event and define its
          fields — AI can generate them automatically.
        </p>
      )}

      {producing.events.map((ev, idx) => {
        const isOpen = expanded === ev.name;
        return (
          <div
            key={idx}
            className="rounded-md border border-border bg-panel"
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <button
                onClick={() => setExpanded(isOpen ? null : ev.name)}
                className="flex flex-1 items-center gap-1.5 text-left"
              >
                <Icon name={isOpen ? 'circle' : 'sparkles'} size={10} />
                <input
                  value={ev.name}
                  onChange={(e) => updateEvent(idx, { name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-transparent font-mono text-[11.5px] font-medium text-text focus:outline-none"
                />
                <span className="text-[9.5px] text-text-dim">
                  {ev.fields?.length ?? 0} fields
                </span>
              </button>
              <button
                onClick={() => removeEvent(idx)}
                className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
              >
                <Icon name="trash" size={10} />
              </button>
            </div>

            {isOpen && (
              <div className="space-y-2 border-t border-border px-2.5 py-2">
                <Field label="Description">
                  <input
                    value={ev.description ?? ''}
                    onChange={(e) =>
                      updateEvent(idx, {
                        description: e.target.value || undefined,
                      })
                    }
                    placeholder="Order created and confirmed"
                    className="h-7 w-full rounded-md border border-border bg-input px-2 text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
                  />
                </Field>

                <Field label="Publishers (publisher service nodes)">
                  <PublisherMultiSelect
                    options={publisherOptions}
                    selected={ev.publishers ?? []}
                    onChange={(ids) => updateEvent(idx, { publishers: ids })}
                  />
                </Field>

                <Field label="Fields">
                  <FieldList
                    fields={ev.fields ?? []}
                    onChange={(f) => updateEvent(idx, { fields: f })}
                  />
                </Field>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={addEvent}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-transparent py-1.5 text-[11px] text-text-dim hover:border-accent hover:text-accent"
      >
        <Icon name="sparkles" size={11} />
        Add event
      </button>
    </div>
  );
}

function PublisherMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: Node<NodeData>[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    );

  if (options.length === 0) {
    return (
      <p className="text-[10.5px] text-text-dim">
        No service nodes yet — add connecting services to the canvas first.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {options.map((n) => {
        const isSelected = selected.includes(n.id);
        return (
          <button
            key={n.id}
            onClick={() => toggle(n.id)}
            className="rounded-full border px-2 py-0.5 text-[10px] transition-colors"
            style={{
              borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
              background: isSelected ? 'var(--accent-soft)' : 'var(--input-bg)',
              color: isSelected ? 'var(--accent)' : 'var(--text-dim)',
            }}
          >
            {n.data.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldList({
  fields,
  onChange,
}: {
  fields: ProducedEvent['fields'];
  onChange: (next: ProducedEvent['fields']) => void;
}) {
  const list = fields ?? [];

  return (
    <div className="space-y-1">
      {list.map((f, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={f.name}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...next[i]!, name: e.target.value };
              onChange(next);
            }}
            placeholder="orderId"
            className="h-6 flex-1 rounded border border-border bg-input px-1.5 font-mono text-[10.5px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          />
          <input
            value={f.type}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...next[i]!, type: e.target.value };
              onChange(next);
            }}
            placeholder="uuid"
            className="h-6 w-20 rounded border border-border bg-input px-1.5 font-mono text-[10.5px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            className="flex h-6 w-6 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
          >
            <Icon name="trash" size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([...list, { name: '', type: 'string' }])
        }
        className="text-[10px] text-text-dim hover:text-accent"
      >
        + field
      </button>
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
