import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/library/Sidebar';
import { Canvas } from '@/components/canvas/Canvas';
import { Shortcuts } from '@/components/shortcuts/Shortcuts';

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
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--canvas-bg)]">
      <Shortcuts />
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      <TopBar />
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
