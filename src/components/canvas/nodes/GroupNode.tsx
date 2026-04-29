import { memo, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { GroupData } from '@/types';
import { useCanvas } from '@/lib/store/canvasStore';

/**
 * Container/group node. Children with `parentId` set will be positioned
 * relative to this group. Visual: faint outline + label badge in top-left.
 */
function GroupNodeImpl({ id, data, selected }: NodeProps) {
  const group = data as GroupData;
  const tone = group.tone ?? 'edge';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.label);
  const updateNode = useCanvas((s) => s.updateNode);

  const commit = () => {
    setEditing(false);
    if (draft !== group.label) updateNode(id, { label: draft } as Partial<GroupData>);
  };

  return (
    <div
      className="relative h-full w-full rounded-xl"
      style={{
        background: 'var(--group-bg)',
        border: `1px ${selected ? 'solid' : 'dashed'} ${
          selected ? 'var(--accent)' : 'var(--group-border)'
        }`,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={120}
        lineClassName="!border-accent"
        handleClassName="!bg-panel !border !border-accent !rounded-sm"
        handleStyle={{ width: 8, height: 8 }}
      />
      <div
        className="pointer-events-auto absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-0.5 shadow-node"
        onDoubleClick={() => setEditing(true)}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: `var(--tone-${tone}-fg)` }}
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(group.label);
                setEditing(false);
              }
            }}
            className="h-4 w-32 border-none bg-transparent text-[10.5px] font-medium uppercase tracking-[0.06em] text-text focus:outline-none"
          />
        ) : (
          <span
            className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text"
            title="Double-click to rename"
          >
            {group.label}
          </span>
        )}
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
