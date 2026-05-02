import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIdentity, USER_COLOR_PALETTE } from '@/lib/store/identityStore';
import { CursorMarker } from './CursorMarker';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  /** İlk açılışta (username yok) modal kapatılamaz; opsiyonel onClose sadece
   *  yeniden açıldığında (TopBar avatardan) kullanılır. */
  onClose?: () => void;
}

export function UsernameModal({ open, onClose }: Props) {
  const stored = useIdentity();
  const [name, setName] = useState(stored.username ?? '');
  const [color, setColor] = useState(stored.userColor);
  const inputRef = useRef<HTMLInputElement>(null);

  // Her açılışta store değerleriyle senkronla (modal yeniden açılırsa).
  useEffect(() => {
    if (open) {
      setName(stored.username ?? '');
      setColor(stored.userColor);
      // autoFocus framer-motion mount sonrası bazen kaçırılıyor — manuel.
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [open, stored.username, stored.userColor]);

  // Esc sadece zaten kayıtlı kullanıcı tekrar açıp vazgeçtiğinde işe yarar.
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2;

  const submit = () => {
    if (!valid) return;
    stored.setIdentity(trimmed, color);
    onClose?.();
  };

  const previewLabel = trimmed || 'You';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[3px]"
            onClick={onClose ? () => onClose() : undefined}
          />
          <motion.div
            key="username-modal"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-[61] w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-panel shadow-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Set your name"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4">
              <h2 className="text-[15px] font-semibold leading-tight text-text">
                Welcome
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-text-dim">
                This name and color appear on your cursor. Everyone on the
                same board will see you this way.
              </p>
            </div>

            {/* Live preview */}
            <div
              className="relative mx-5 mb-4 flex h-[88px] items-center justify-center overflow-hidden rounded-xl border border-border"
              style={{
                background:
                  'radial-gradient(circle at 50% 60%, rgba(0,0,0,0.04), transparent 70%), var(--canvas-bg)',
                backgroundImage:
                  'radial-gradient(var(--grid-dot) 1px, transparent 1px)',
                backgroundSize: '14px 14px',
              }}
            >
              <motion.div
                key={color + previewLabel}
                initial={{ y: 4, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              >
                <CursorMarker color={color} label={previewLabel} />
              </motion.div>
            </div>

            <div className="space-y-4 px-5 pb-5">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Display name
                </span>
                <input
                  ref={inputRef}
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit();
                  }}
                  placeholder="Your name"
                  className="h-9 w-full rounded-md border border-border bg-input px-2.5 text-[13px] text-text outline-none transition-colors focus:border-[var(--accent)]"
                  style={
                    {
                      // accent ring with current color for delight
                      boxShadow: valid
                        ? `0 0 0 3px ${color}22`
                        : undefined,
                    } as React.CSSProperties
                  }
                />
              </label>

              <div>
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Color
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {USER_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Color ${c}`}
                      aria-pressed={color === c}
                      className={cn(
                        'h-7 w-7 rounded-full transition-transform',
                        color === c
                          ? 'scale-110 ring-2 ring-offset-2'
                          : 'hover:scale-105 ring-1 ring-border',
                      )}
                      style={{
                        background: c,
                        // ring offset background = panel for clean halo
                        ['--tw-ring-color' as never]: c,
                        ['--tw-ring-offset-color' as never]:
                          'var(--panel-bg)',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 rounded-md border border-border bg-transparent px-3 text-[12px] font-medium text-text-dim hover:bg-hover hover:text-text"
                  >
                    Cancel
                  </button>
                )}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={!valid}
                  onClick={submit}
                  className={cn(
                    'h-8 rounded-md px-4 text-[12px] font-semibold text-white transition-opacity',
                    !valid && 'cursor-not-allowed opacity-50',
                  )}
                  style={{ background: color }}
                >
                  Continue
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
