import { useState } from 'react';
import { motion } from 'framer-motion';
import { useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/Icon';
import { useCanvas } from '@/lib/store/canvasStore';
import { autoLayout } from '@/lib/layout/elk';
import { getRecorder } from '@/lib/persistence/versionRecorder';
import { cn } from '@/lib/utils';

/**
 * Floating toolbar at the top of the canvas: auto-layout, fit-to-screen,
 * reset zoom. Tone-aware, motion-friendly.
 */
export function CanvasToolbar() {
  const { fitView } = useReactFlow();
  const { nodes, edges, setNodes, setEdges } = useCanvas();
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<'DOWN' | 'RIGHT'>('DOWN');

  const onAutoLayout = async () => {
    if (nodes.length === 0) {
      toast('Canvas empty — add a few components first.');
      return;
    }
    setBusy(true);
    try {
      const next = await autoLayout(nodes, edges, direction);
      setNodes(next);
      // Realign each edge so it leaves/enters via the side that matches
      // the direction. Without this, all edges would still snap to top/bottom
      // even when nodes are placed left-to-right.
      const sourceHandle = direction === 'DOWN' ? 'bottom-s' : 'right-s';
      const targetHandle = direction === 'DOWN' ? 'top' : 'left';
      setEdges(
        edges.map((e) => ({
          ...e,
          sourceHandle,
          targetHandle,
        })),
      );
      window.setTimeout(() => {
        fitView({ duration: 320, padding: 0.18 });
      }, 80);
      // Auto-layout sonrası kalıcı versiyon — kullanıcı 5sn idle'ı beklemeden
      // doğrudan tarihte bir satır oluşur, geri çıkış kolaylaşır.
      void getRecorder()?.recordAuto(
        'auto-layout',
        direction === 'DOWN' ? 'Auto-layout · ↓' : 'Auto-layout · →',
      );
      toast.success(`Auto-layout · ${direction === 'DOWN' ? 'Top → Bottom' : 'Left → Right'}`);
    } catch (err) {
      console.error(err);
      toast.error('Layout failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-panel px-1 py-1 shadow-panel"
      role="toolbar"
      aria-label="Canvas tools"
    >
      <ToolButton
        onClick={onAutoLayout}
        disabled={busy}
        ariaLabel="Auto-layout"
        title={`Auto-layout (${direction === 'DOWN' ? '↓' : '→'})`}
      >
        <Icon name="graph" size={14} stroke={1.6} />
        <span className="text-[11px] font-medium">Auto-layout</span>
      </ToolButton>
      <button
        onClick={() => setDirection((d) => (d === 'DOWN' ? 'RIGHT' : 'DOWN'))}
        title="Toggle layout direction"
        aria-label="Toggle layout direction"
        className="flex h-7 w-7 items-center justify-center rounded-full text-text-dim hover:bg-hover hover:text-text"
      >
        <span className="text-[11px] font-mono">{direction === 'DOWN' ? '↓' : '→'}</span>
      </button>
      <div className="h-4 w-px bg-border" />
      <ToolButton
        onClick={() => {
          const center = { x: 200 + Math.random() * 80, y: 200 + Math.random() * 80 };
          useCanvas.getState().addGroup('Tier', center);
          toast.success('Group added · double-click label to rename');
        }}
        ariaLabel="Add group"
        title="Add group container"
      >
        <Icon name="folder" size={14} stroke={1.6} />
        <span className="text-[11px] font-medium">Group</span>
      </ToolButton>
      <ToolButton
        onClick={() => {
          const center = { x: 220 + Math.random() * 80, y: 220 + Math.random() * 80 };
          useCanvas.getState().addComment('Yeni not', center);
          toast.success('Comment added · double-click to edit');
        }}
        ariaLabel="Add comment"
        title="Add sticky note"
      >
        <Icon name="sparkles" size={14} stroke={1.6} />
        <span className="text-[11px] font-medium">Note</span>
      </ToolButton>
      <div className="h-4 w-px bg-border" />
      <ToolButton
        onClick={() => fitView({ duration: 320, padding: 0.18 })}
        ariaLabel="Fit to view"
        title="Fit to view"
      >
        <Icon name="search" size={14} stroke={1.6} />
        <span className="text-[11px] font-medium">Fit</span>
      </ToolButton>
      <div className="h-4 w-px bg-border" />
      <ToolButton
        onClick={async () => {
          const rec = getRecorder();
          if (!rec) {
            toast.error('Open a project first.');
            return;
          }
          await rec.recordManual('Manual save');
          toast.success('Version saved');
        }}
        ariaLabel="Save version"
        title="Save current version"
      >
        <Icon name="check" size={14} stroke={1.6} />
        <span className="text-[11px] font-medium">Save</span>
      </ToolButton>
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  disabled,
  ariaLabel,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ y: -0.5 }}
      whileTap={{ scale: 0.97 }}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full px-2.5 text-text transition-colors hover:bg-hover',
        disabled && 'opacity-50',
      )}
    >
      {children}
    </motion.button>
  );
}
