import type { ScheduledSpec } from '@/types';

/**
 * `scheduled` capability editor — cron / interval tabanlı runner. Tek
 * config olduğu için form düz; mergeStrategy = 'replace'.
 */
interface Props {
  scheduled: ScheduledSpec;
  onChange: (next: ScheduledSpec) => void;
}

const PRESETS: { label: string; value: string }[] = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Every 4h', value: '0 */4 * * *' },
  { label: 'Daily 02:00', value: '0 2 * * *' },
  { label: 'Weekly Mon', value: '0 0 * * 1' },
];

export function ScheduledEditor({ scheduled, onChange }: Props) {
  return (
    <div className="space-y-3">
      <Field label="Schedule (cron / @hourly / every 5m)">
        <input
          value={scheduled.schedule}
          onChange={(e) => onChange({ ...scheduled, schedule: e.target.value })}
          placeholder="0 */4 * * *"
          className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11.5px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </Field>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange({ ...scheduled, schedule: p.value })}
            className="rounded-full border border-border bg-input px-2 py-0.5 text-[10px] text-text-dim hover:bg-hover hover:text-text"
          >
            {p.label}
          </button>
        ))}
      </div>

      <Field label="Handler / job">
        <input
          value={scheduled.handler ?? ''}
          onChange={(e) =>
            onChange({ ...scheduled, handler: e.target.value || undefined })
          }
          placeholder="refresh_cache"
          className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11.5px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Timezone">
          <input
            value={scheduled.timezone ?? ''}
            onChange={(e) =>
              onChange({
                ...scheduled,
                timezone: e.target.value || undefined,
              })
            }
            placeholder="Europe/Istanbul"
            className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Description">
          <input
            value={scheduled.description ?? ''}
            onChange={(e) =>
              onChange({
                ...scheduled,
                description: e.target.value || undefined,
              })
            }
            placeholder="hot cache warmup"
            className="h-7 w-full rounded-md border border-border bg-input px-2 text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          />
        </Field>
      </div>
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
