import { Icon } from '@/components/ui/Icon';
import type {
  CapProfile,
  ConsistencyModel,
  PacelcProfile,
  RedundancyModel,
  ReliabilitySpec,
  Tone,
} from '@/types';
import {
  DEFAULT_CAP_BY_TONE,
  DEFAULT_CONSISTENCY_BY_TONE,
  DEFAULT_PACELC_BY_TONE,
} from '@/lib/capabilities/reliabilityDefaults';
import { cn } from '@/lib/utils';

const CAP_OPTIONS: CapProfile[] = ['CP', 'AP', 'CA'];
const PACELC_OPTIONS: PacelcProfile[] = ['PA/EL', 'PA/EC', 'PC/EL', 'PC/EC'];
const CONSISTENCY_OPTIONS: ConsistencyModel[] = [
  'strong',
  'eventual',
  'causal',
  'read-your-writes',
];
const REDUNDANCY_OPTIONS: RedundancyModel[] = [
  'none',
  'active-passive',
  'active-active',
  'multi-region',
];

/**
 * Reliability tab editor. Pure form — every change goes through onChange,
 * which lifts the patch up to Inspector and ultimately the canvas store
 * (so it lands in zundo + the version history like any other capability).
 */
export function ReliabilityEditor({
  reliability,
  tone,
  isSpof,
  onChange,
}: {
  reliability: ReliabilitySpec;
  tone: Tone;
  isSpof: boolean;
  onChange: (next: ReliabilitySpec) => void;
}) {
  const patch = (delta: Partial<ReliabilitySpec>) =>
    onChange({ ...reliability, ...delta });
  const patchSlo = (
    delta: Partial<NonNullable<ReliabilitySpec['slo']>>,
  ) => patch({ slo: { ...(reliability.slo ?? {}), ...delta } });

  const capDefault = DEFAULT_CAP_BY_TONE[tone];
  const pacelcDefault = DEFAULT_PACELC_BY_TONE[tone];
  const consistencyDefault = DEFAULT_CONSISTENCY_BY_TONE[tone];

  return (
    <div className="space-y-3 px-3 py-3">
      {isSpof && (
        <div className="flex items-start gap-2 rounded-md border border-[#c96442]/40 bg-[#c96442]/10 p-2 text-[10.5px]">
          <Icon name="auth" size={11} stroke={1.6} color="#c96442" />
          <div className="flex-1">
            <div className="font-semibold text-text">Single Point of Failure</div>
            <div className="text-text-dim">
              Removing this node disconnects part of the graph. Add replicas or a redundant peer.
            </div>
          </div>
        </div>
      )}

      <Field label="CAP profile" hint={capDefault ? `default for ${tone}: ${capDefault}` : undefined}>
        <RadioGroup
          options={CAP_OPTIONS}
          value={reliability.cap}
          onChange={(v) => patch({ cap: v as CapProfile })}
        />
      </Field>

      <Field label="PACELC" hint={pacelcDefault ? `default: ${pacelcDefault}` : undefined}>
        <Select
          options={PACELC_OPTIONS}
          value={reliability.pacelc}
          onChange={(v) => patch({ pacelc: v as PacelcProfile })}
          placeholder="—"
        />
      </Field>

      <Field
        label="Consistency model"
        hint={consistencyDefault ? `default: ${consistencyDefault}` : undefined}
      >
        <Select
          options={CONSISTENCY_OPTIONS}
          value={reliability.consistencyModel}
          onChange={(v) => patch({ consistencyModel: v as ConsistencyModel })}
          placeholder="—"
        />
      </Field>

      <Field label="SLO targets">
        <div className="grid grid-cols-3 gap-1.5">
          <NumberInput
            placeholder="p99 ms"
            value={reliability.slo?.latencyP99Ms}
            onChange={(n) => patchSlo({ latencyP99Ms: n })}
          />
          <NumberInput
            placeholder="avail %"
            step={0.001}
            min={0}
            max={1}
            value={reliability.slo?.availability}
            onChange={(n) => patchSlo({ availability: n })}
          />
          <NumberInput
            placeholder="rps"
            value={reliability.slo?.rpsTarget}
            onChange={(n) => patchSlo({ rpsTarget: n })}
          />
        </div>
      </Field>

      <Field label="Replicas">
        <NumberInput
          placeholder="1"
          value={reliability.replicas}
          onChange={(n) => patch({ replicas: n })}
        />
      </Field>

      <Field label="Redundancy">
        <Select
          options={REDUNDANCY_OPTIONS}
          value={reliability.redundancy}
          onChange={(v) => patch({ redundancy: v as RedundancyModel })}
          placeholder="—"
        />
      </Field>

      <Field label="Failure modes (one per line)">
        <textarea
          value={(reliability.failureModes ?? []).join('\n')}
          onChange={(e) =>
            patch({
              failureModes: e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          rows={3}
          placeholder={`disk full → write 5xx\nupstream timeout → cascading retry`}
          className="w-full resize-y rounded-md border border-border bg-input px-2 py-1 font-mono text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          {label}
        </span>
        {hint && <span className="text-[9.5px] text-text-dim/80">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(value === opt ? '' : opt)}
          className={cn(
            'flex-1 rounded-md border px-2 py-1 text-[11px]',
            value === opt
              ? 'border-accent bg-[var(--accent-soft)] font-medium text-text'
              : 'border-border bg-input text-text-dim hover:bg-hover hover:text-text',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function Select({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded-md border border-border bg-input px-2 text-[11px] text-text focus:border-accent focus:outline-none"
    >
      <option value="">{placeholder ?? '—'}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  value?: number;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') onChange(undefined);
        else {
          const n = Number(v);
          if (!Number.isNaN(n)) onChange(n);
        }
      }}
      className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
    />
  );
}
