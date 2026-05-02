import { lazy, Suspense, useState } from 'react';
import { Toaster } from 'sonner';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/library/Sidebar';
import { Canvas } from '@/components/canvas/Canvas';
import { Shortcuts } from '@/components/shortcuts/Shortcuts';
import { AnalysisRunner } from '@/components/analysis/AnalysisRunner';
import { UsernameModal } from '@/components/identity/UsernameModal';
import { useIdentity } from '@/lib/store/identityStore';

// Heavy feature surfaces — lazy-loaded so the initial bundle stays slim.
const Inspector = lazy(() =>
  import('@/components/inspector/Inspector').then((m) => ({ default: m.Inspector })),
);
const AiPanel = lazy(() =>
  import('@/components/ai/AiPanel').then((m) => ({ default: m.AiPanel })),
);
const CommandPalette = lazy(() =>
  import('@/components/command/CommandPalette').then((m) => ({
    default: m.CommandPalette,
  })),
);

export default function App() {
  const username = useIdentity((s) => s.username);
  const [identityOpen, setIdentityOpen] = useState(false);
  const needsOnboarding = !username;
  const modalOpen = needsOnboarding || identityOpen;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--canvas-bg)]">
      <Shortcuts />
      <AnalysisRunner />
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      <TopBar onEditIdentity={() => setIdentityOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 relative">
          <Canvas />
        </main>
        <Suspense fallback={null}>
          <Inspector />
        </Suspense>
        <Suspense fallback={null}>
          <AiPanel />
        </Suspense>
      </div>
      <UsernameModal
        open={modalOpen}
        onClose={needsOnboarding ? undefined : () => setIdentityOpen(false)}
      />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--panel-bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          },
        }}
      />
    </div>
  );
}
