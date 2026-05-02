import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { findCatalogItem } from '@/lib/catalog';
import { useSettings } from '@/lib/store/settingsStore';
import {
  bottleneckFor,
  isArticulationPoint,
  useAnalysis,
} from '@/lib/store/analysisStore';
import type { NodeData } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Single custom node renderer; visual style routed by data.tone.
 * 3 display modes (icon-only / icon-label / detailed) controlled in settings.
 */
function SDNodeImpl({ id, data, selected }: NodeProps) {
  const display = useSettings((s) => s.nodeDisplay);
  const density = useSettings((s) => s.density);
  const overlays = useSettings((s) => s.analysisOverlays);
  const report = useAnalysis((s) => s.report);
  const node = data as NodeData;
  const catalog = findCatalogItem(node.type);
  const icon = catalog?.icon ?? 'circle';

  const tone = node.tone;
  const padX = density === 'compact' ? 10 : 14;
  const padY = density === 'compact' ? 6 : 9;

  const isIconOnly = display === 'icon-only';
  const isDetailed = display === 'detailed';

  const replicas = node.reliability?.replicas;
  const isScaled = typeof replicas === 'number' && replicas >= 2;
  const articulation = isArticulationPoint(report, id);
  // Topology says it's a cut vertex; show SPOF chrome only if the user
  // hasn't told us "I have replicas". Replicated articulation points get
  // the green "Scaled" chrome instead — same topology, different risk.
  const isSpof = overlays.spof && articulation && !isScaled;
  const isScaledArticulation = overlays.spof && articulation && isScaled;
  const bottleneck = overlays.heatmap ? bottleneckFor(report, id) : undefined;

  // Heat-map: tint the node background red proportional to bottleneck score.
  // Threshold at 0.25 so mild loads don't redden every node.
  const heatStrength =
    bottleneck && bottleneck.score > 0.25
      ? Math.min(1, (bottleneck.score - 0.25) / 0.75)
      : 0;
  const heatBoxShadow =
    heatStrength > 0
      ? `0 0 0 ${1 + Math.round(heatStrength * 3)}px rgba(201, 100, 66, ${0.25 + heatStrength * 0.5}), var(--node-shadow)`
      : undefined;

  // SPOF takes precedence over heatmap visually so users can spot the
  // articulation point even in a crowded heat-map view.
  const spofBoxShadow = isSpof
    ? '0 0 0 2px #c96442, 0 0 0 5px rgba(201,100,66,0.25), var(--node-shadow)'
    : isScaledArticulation
      ? '0 0 0 2px #7c9c5e, 0 0 0 5px rgba(124,156,94,0.22), var(--node-shadow)'
      : undefined;

  const finalBoxShadow = selected
    ? '0 0 0 4px var(--accent-soft), var(--node-shadow)'
    : (spofBoxShadow ?? heatBoxShadow ?? 'var(--node-shadow)');

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: node.locked ? 0 : -1 }}
      className={cn(
        'group relative rounded-node border bg-node-bg text-text shadow-node transition-colors',
        selected ? 'ring-2' : 'hover:border-accent',
        isSpof && !selected && 'border-dashed',
      )}
      style={{
        borderColor: selected
          ? 'var(--accent)'
          : isSpof
            ? '#c96442'
            : isScaledArticulation
              ? '#7c9c5e'
              : 'var(--node-border)',
        boxShadow: finalBoxShadow,
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
      {isSpof && !node.locked && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-4 items-center justify-center rounded-full border border-[#c96442] bg-panel px-1 text-[8.5px] font-semibold uppercase tracking-wide text-[#c96442] shadow-node"
          title="Single Point of Failure — set replicas ≥ 2 in Reliability tab to scale horizontally"
        >
          SPOF
        </span>
      )}
      {isScaled && (
        <span
          className="absolute -bottom-1.5 -right-1.5 flex h-4 min-w-[20px] items-center justify-center rounded-full border border-[#7c9c5e] bg-panel px-1 font-mono text-[9px] font-semibold text-[#7c9c5e] shadow-node"
          title={`${replicas} replicas — horizontally scaled${
            articulation ? ' (resolves SPOF risk)' : ''
          }`}
        >
          ×{replicas}
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
