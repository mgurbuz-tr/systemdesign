import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { group: string; rows: { combo: string; label: string }[] }[] = [
  {
    group: 'Canvas',
    rows: [
      { combo: '⌘K', label: 'Open command palette' },
      { combo: '⌘Z', label: 'Undo' },
      { combo: '⌘⇧Z', label: 'Redo' },
      { combo: 'Del / ⌫', label: 'Delete selected node or edge' },
      { combo: '⌘D', label: 'Duplicate selected node' },
    ],
  },
  {
    group: 'View',
    rows: [
      { combo: '⌘I', label: 'Toggle AI Copilot' },
      { combo: '⌘⇧L', label: 'Toggle theme' },
      { combo: '?', label: 'Open this help modal' },
    ],
  },
  {
    group: 'Connections',
    rows: [
      { combo: 'Drag handle', label: 'Hover a node, drag from any side to another node' },
      { combo: 'Click edge', label: 'Open inspector → change protocol' },
      { combo: 'Click empty', label: 'Deselect everything' },
    ],
  },
];

export function HelpModal({ open, onClose }: Props) {
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-border bg-panel shadow-panel"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Icon name="sparkles" size={14} color="var(--accent)" />
              <span className="text-[12.5px] font-semibold text-text">
                Keyboard shortcuts
              </span>
              <button
                onClick={onClose}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-text-dim hover:bg-hover hover:text-text"
                aria-label="Close"
              >
                <Icon name="x" size={12} />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {SHORTCUTS.map((g) => (
                <section key={g.group} className="space-y-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                    {g.group}
                  </h3>
                  {g.rows.map((r) => (
                    <div
                      key={r.combo}
                      className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-hover"
                    >
                      <span className="text-[12px] text-text">{r.label}</span>
                      <kbd className="rounded-md border border-border bg-input px-1.5 py-0.5 font-mono text-[10.5px] text-text-dim">
                        {r.combo}
                      </kbd>
                    </div>
                  ))}
                </section>
              ))}
            </div>

            <div className="border-t border-border bg-input/40 px-4 py-2 text-[10.5px] text-text-dim">
              ⌘ on macOS · Ctrl on Windows/Linux. Editable inputs ignore most
              shortcuts so you can type freely.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
