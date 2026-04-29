import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { findCatalogItem } from '@/lib/catalog';
import { useSettings } from '@/lib/store/settingsStore';
import type { NodeData } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Single custom node renderer; visual style routed by data.tone.
 * 3 display modes (icon-only / icon-label / detailed) controlled in settings.
 */
function SDNodeImpl({ data, selected }: NodeProps) {
  const display = useSettings((s) => s.nodeDisplay);
  const density = useSettings((s) => s.density);
  const node = data as NodeData;
  const catalog = findCatalogItem(node.type);
  const icon = catalog?.icon ?? 'circle';

  const tone = node.tone;
  const padX = density === 'compact' ? 10 : 14;
  const padY = density === 'compact' ? 6 : 9;

  const isIconOnly = display === 'icon-only';
  const isDetailed = display === 'detailed';

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: node.locked ? 0 : -1 }}
      className={cn(
        'group relative rounded-node border bg-node-bg text-text shadow-node transition-colors',
        selected ? 'ring-2' : 'hover:border-accent',
      )}
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--node-border)',
        boxShadow: selected
          ? '0 0 0 4px var(--accent-soft), var(--node-shadow)'
          : 'var(--node-shadow)',
        padding: isIconOnly ? 6 : `${padY}px ${padX}px`,
        cursor: node.locked ? 'default' : 'grab',
      }}
    >
      {node.locked && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-panel shadow-node"
          title="Locked"
        >
          <Icon name="auth" size={9} stroke={1.7} />
        </span>
      )}
      <NodeHandles />

      {isIconOnly ? (
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md"
          style={{
            background: `var(--tone-${tone}-bg)`,
            color: `var(--tone-${tone}-fg)`,
          }}
        >
          <Icon name={icon} size={18} stroke={1.6} />
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{
              background: `var(--tone-${tone}-bg)`,
              color: `var(--tone-${tone}-fg)`,
            }}
          >
            <Icon name={icon} size={14} stroke={1.6} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium leading-tight text-text">
              {node.label}
            </div>
            {isDetailed && node.meta && (
              <div className="mt-0.5 truncate text-[10px] text-text-dim">
                {node.meta}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function NodeHandles() {
  // 4 source + 4 target overlapping at each side. Combined with
  // connectionMode="loose" on ReactFlow, edges can be drawn from any side
  // and routed to any side — and auto-layout can swap handle ids freely.
  const cls =
    '!h-2 !w-2 !border !border-accent !bg-panel opacity-0 transition-opacity group-hover:opacity-100';
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" className={cls} />
      <Handle type="source" position={Position.Top} id="top-s" className={cls} />
      <Handle type="target" position={Position.Right} id="right" className={cls} />
      <Handle type="source" position={Position.Right} id="right-s" className={cls} />
      <Handle type="target" position={Position.Bottom} id="bottom" className={cls} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" className={cls} />
      <Handle type="target" position={Position.Left} id="left" className={cls} />
      <Handle type="source" position={Position.Left} id="left-s" className={cls} />
    </>
  );
}

export const SDNode = memo(SDNodeImpl);
