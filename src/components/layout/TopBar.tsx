import { lazy, Suspense, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { useSettings } from '@/lib/store/settingsStore';
import { useProject } from '@/lib/store/projectStore';
import { usePersistence } from '@/lib/persistence';
import { cn } from '@/lib/utils';

const SettingsDrawer = lazy(() =>
  import('@/components/settings/SettingsDrawer').then((m) => ({
    default: m.SettingsDrawer,
  })),
);

export function TopBar() {
  const { theme, toggleTheme, aiOpen, setAiOpen } = useSettings();
  const project = useProject((s) => s.current);
  const status = usePersistence((s) => s.status);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header
      className="flex h-11 items-center gap-2 border-b border-border bg-panel px-3"
      style={{ flexShrink: 0 }}
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="text-text-dim">{project?.name ?? 'Untitled'}</span>
        <span className="text-text-dim">/</span>
        <span className="text-text-dim">Architecture</span>
        <span className="text-text-dim">/</span>
        <span className="font-medium text-text">v0.1 — Draft</span>
      </div>

      <SaveIndicator status={status} />

      <div className="flex-1" />

      <TopBarButton onClick={toggleTheme} aria-label="Toggle theme">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={13} />
      </TopBarButton>
      <TopBarButton onClick={() => setSettingsOpen(true)} aria-label="Settings">
        <Icon name="gear" size={13} />
      </TopBarButton>
      <TopBarButton aria-label="Share">
        <Icon name="share" size={13} />
        <span className="text-[11px]">Share</span>
      </TopBarButton>

      <motion.button
        whileHover={{ y: -0.5 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setAiOpen(!aiOpen)}
        aria-pressed={aiOpen}
        aria-label="Toggle AI Copilot"
        className={cn(
          'flex h-[26px] items-center gap-1.5 rounded-[5px] px-2.5 text-[11px] font-medium transition-colors',
          aiOpen
            ? 'bg-[var(--accent-soft)] text-accent'
            : 'bg-transparent text-text hover:bg-hover',
        )}
      >
        <Icon name="sparkles" size={13} />
        <span>AI</span>
      </motion.button>

      <Suspense fallback={null}>
        <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </Suspense>
    </header>
  );
}

function TopBarButton({
  children,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <motion.button
      whileHover={{ y: -0.5 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex h-[26px] items-center gap-1.5 rounded-[5px] bg-transparent px-2.5 text-[11px] font-medium text-text hover:bg-hover"
      {...rest}
    >
      {children}
    </motion.button>
  );
}

function SaveIndicator({ status }: { status: string }) {
  return (
    <AnimatePresence mode="wait">
      {status !== 'idle' && (
        <motion.div
          key={status}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 4 }}
          transition={{ duration: 0.16 }}
          className="ml-2 flex items-center gap-1 text-[10.5px] text-text-dim"
          aria-live="polite"
        >
          {status === 'saving' && (
            <>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--text-dim)' }}
              />
              <span>Saving…</span>
            </>
          )}
          {status === 'saved' && (
            <>
              <Icon name="check" size={11} />
              <span>Saved</span>
            </>
          )}
          {status === 'error' && (
            <span style={{ color: '#c96442' }}>Save failed</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
