import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { useSettings } from '@/lib/store/settingsStore';
import { checkConnection } from '@/lib/ai/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { EdgeStyle, NodeDisplay } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ACCENT_PRESETS = [
  { name: 'Notion', value: '#1a1a1a' },
  { name: 'Editorial Clay', value: '#c96442' },
  { name: 'Vercel Blue', value: '#0070f3' },
  { name: 'Linear Indigo', value: '#5e6ad2' },
  { name: 'Stripe Violet', value: '#7c5cff' },
  { name: 'Sage', value: '#7c9c5e' },
];

export function SettingsDrawer({ open, onClose }: Props) {
  const settings = useSettings();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          />
          <motion.aside
            key="settings"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col overflow-hidden border-l border-border bg-panel shadow-panel"
            role="dialog"
            aria-label="Settings"
          >
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
              <Icon name="gear" size={14} />
              <span className="text-[12.5px] font-semibold text-text">Settings</span>
              <button
                onClick={onClose}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-text-dim hover:bg-hover hover:text-text"
                aria-label="Close settings"
              >
                <Icon name="x" size={12} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto p-3.5">
              <Section title="Appearance">
                <Row label="Theme">
                  <SegmentedControl
                    value={settings.theme}
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]}
                    onChange={(v) => settings.setTheme(v as 'light' | 'dark')}
                  />
                </Row>
                <Row label="Density">
                  <SegmentedControl
                    value={settings.density}
                    options={[
                      { value: 'compact', label: 'Compact' },
                      { value: 'cozy', label: 'Cozy' },
                    ]}
                    onChange={(v) => settings.setDensity(v as 'compact' | 'cozy')}
                  />
                </Row>
                <Row label="Accent">
                  <div className="flex flex-wrap gap-1.5">
                    {ACCENT_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => settings.setAccent(p.value)}
                        title={p.name}
                        aria-label={`Accent ${p.name}`}
                        className={cn(
                          'h-6 w-6 rounded-full border-2 transition-transform',
                          settings.accent === p.value
                            ? 'border-text scale-110'
                            : 'border-border hover:scale-105',
                        )}
                        style={{ background: p.value }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.accent}
                      onChange={(e) => settings.setAccent(e.target.value)}
                      className="h-6 w-6 cursor-pointer rounded-full border-2 border-border bg-transparent"
                      aria-label="Custom accent"
                    />
                  </div>
                </Row>
              </Section>

              <Section title="Canvas">
                <Row label="Edge style">
                  <SegmentedControl
                    value={settings.edgeStyle}
                    options={[
                      { value: 'curved', label: 'Curved' },
                      { value: 'orthogonal', label: 'Ortho' },
                      { value: 'straight', label: 'Straight' },
                    ]}
                    onChange={(v) => settings.setEdgeStyle(v as EdgeStyle)}
                  />
                </Row>
                <Row label="Node display">
                  <SegmentedControl
                    value={settings.nodeDisplay}
                    options={[
                      { value: 'icon-only', label: 'Icon' },
                      { value: 'icon-label', label: 'Label' },
                      { value: 'detailed', label: 'Detailed' },
                    ]}
                    onChange={(v) => settings.setNodeDisplay(v as NodeDisplay)}
                  />
                </Row>
                <Row label="Show grid">
                  <Toggle
                    on={settings.showGrid}
                    onChange={settings.setShowGrid}
                    aria-label="Toggle grid"
                  />
                </Row>
                <Row label="Show mini-map">
                  <Toggle
                    on={settings.showMinimap}
                    onChange={settings.setShowMinimap}
                    aria-label="Toggle mini-map"
                  />
                </Row>
              </Section>

              <Section title="AI · LM Studio">
                <Row label="Base URL" stack>
                  <div className="flex gap-1.5">
                    <input
                      value={settings.lmStudioBaseUrl}
                      onChange={(e) => settings.setLmStudioBaseUrl(e.target.value)}
                      placeholder="http://localhost:1234"
                      className="h-7 flex-1 rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                    />
                    <button
                      onClick={async () => {
                        const r = await checkConnection(settings.lmStudioBaseUrl);
                        if (r.ok) toast.success(`Connected · ${r.detail}`);
                        else toast.error(`Failed · ${r.detail}`);
                      }}
                      className="rounded-md border border-border bg-input px-2 py-1 text-[10.5px] text-text hover:bg-hover"
                    >
                      Test
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-text-dim">
                    LM Studio uygulamasında <em>Local Server</em> sekmesinden başlat. Default port: 1234.
                  </p>
                </Row>
              </Section>

              <Section title="About">
                <p className="text-[11px] leading-relaxed text-text-dim">
                  SystemDesign · v0.1 — Local-first system architecture editor
                  with built-in AI copilot. All data lives in your browser
                  (IndexedDB). Designed in <strong>A · Notion Minimal</strong>.
                </p>
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
  stack,
}: {
  label: string;
  children: React.ReactNode;
  stack?: boolean;
}) {
  return (
    <div className={cn('flex gap-2', stack ? 'flex-col items-stretch' : 'items-center justify-between')}>
      <span className="text-[11.5px] text-text">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="inline-flex h-7 rounded-md border border-border bg-input p-0.5"
      role="radiogroup"
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-checked={value === o.value}
          role="radio"
          className={cn(
            'h-6 rounded-[5px] px-2 text-[10.5px] font-medium transition-colors',
            value === o.value ? 'bg-panel text-text shadow-sm' : 'text-text-dim hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  ...rest
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  'aria-label'?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-5 w-9 rounded-full border transition-colors',
        on ? 'bg-accent border-accent' : 'border-border bg-input',
      )}
      style={on ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
      {...rest}
    >
      <motion.span
        animate={{ x: on ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="absolute top-[2px] h-3.5 w-3.5 rounded-full"
        style={{ background: on ? '#fff' : 'var(--text-dim)' }}
      />
    </button>
  );
}
