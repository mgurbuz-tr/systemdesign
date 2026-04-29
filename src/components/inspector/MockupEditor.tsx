import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import type { MockupSpec, ScreenSpec } from '@/types';
import { uid } from '@/lib/utils';

interface Props {
  mockup: MockupSpec;
  onChange: (next: MockupSpec) => void;
  apiSuggestions?: string[];
}

export function MockupEditor({ mockup, onChange, apiSuggestions = [] }: Props) {
  const screens = mockup.screens;

  const addScreen = () => {
    const next: MockupSpec = {
      screens: [
        ...screens,
        { id: uid('scr'), name: `Screen ${screens.length + 1}`, apiCalls: [] },
      ],
    };
    onChange(next);
  };

  const updateScreen = (id: string, patch: Partial<ScreenSpec>) => {
    onChange({
      screens: screens.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const removeScreen = (id: string) => {
    onChange({ screens: screens.filter((s) => s.id !== id) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          Screens · {screens.length}
        </h3>
        <button
          onClick={addScreen}
          className="flex items-center gap-1 rounded-md border border-border bg-input px-2 py-0.5 text-[10.5px] text-text hover:bg-hover"
        >
          <Icon name="plus" size={10} />
          <span>Screen</span>
        </button>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {screens.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden rounded-md border border-border bg-input/40 p-2.5"
            >
              <ScreenBlock
                screen={s}
                apiSuggestions={apiSuggestions}
                onChange={(p) => updateScreen(s.id, p)}
                onRemove={() => removeScreen(s.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {screens.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-text-dim">
            Henüz ekran yok.{' '}
            <button onClick={addScreen} className="underline">
              İlkini ekle
            </button>
            <p className="mt-1 text-[10px]">
              Örn: Login, Onboarding, Feed, Settings, Checkout…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenBlock({
  screen,
  apiSuggestions,
  onChange,
  onRemove,
}: {
  screen: ScreenSpec;
  apiSuggestions: string[];
  onChange: (p: Partial<ScreenSpec>) => void;
  onRemove: () => void;
}) {
  const calls = screen.apiCalls ?? [];

  const addCall = (value?: string) => {
    onChange({
      apiCalls: [...calls, value ?? ''],
    });
  };
  const updateCall = (i: number, value: string) => {
    onChange({
      apiCalls: calls.map((c, ix) => (ix === i ? value : c)),
    });
  };
  const removeCall = (i: number) => {
    onChange({ apiCalls: calls.filter((_, ix) => ix !== i) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <input
          value={screen.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Screen name"
          className="h-6 flex-1 border-none bg-transparent text-[12px] font-medium text-text focus:outline-none"
        />
        <button
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
          aria-label="Remove screen"
        >
          <Icon name="trash" size={11} />
        </button>
      </div>
      <input
        value={screen.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description (1 line)"
        className="h-6 w-full border-none bg-transparent text-[10.5px] text-text-dim focus:outline-none"
      />

      <div className="space-y-1">
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          API calls
        </div>
        {calls.map((call, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              list="sd-api-suggestions"
              value={call}
              onChange={(e) => updateCall(i, e.target.value)}
              placeholder="GET /v1/items"
              className="h-6 flex-1 rounded border border-transparent bg-transparent px-1.5 font-mono text-[10.5px] text-text-dim hover:bg-input focus:border-border focus:bg-input focus:outline-none"
            />
            <button
              onClick={() => removeCall(i)}
              className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
              aria-label="Remove call"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        ))}
        <button
          onClick={() => addCall()}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-[10px] text-text-dim hover:border-accent hover:text-text"
        >
          <Icon name="plus" size={9} />
          <span>API call</span>
        </button>
      </div>

      {/* Datalist of every endpoint defined elsewhere on the canvas */}
      {apiSuggestions.length > 0 && (
        <datalist id="sd-api-suggestions">
          {apiSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
