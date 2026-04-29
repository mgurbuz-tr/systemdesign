import { memo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { useCanvas } from '@/lib/store/canvasStore';

interface CommentData extends Record<string, unknown> {
  text: string;
  resolved?: boolean;
}

/**
 * Sticky comment / annotation. Floats over the canvas at flow coords.
 * Click to expand, double-click to edit, ✓ to resolve.
 */
function CommentNodeImpl({ id, data, selected }: NodeProps) {
  const c = data as CommentData;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.text);
  const removeNode = useCanvas((s) => s.removeNode);
  const updateNode = useCanvas((s) => s.updateNode);

  const commit = () => {
    setEditing(false);
    if (draft !== c.text) {
      updateNode(id, { text: draft } as Partial<CommentData>);
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: c.resolved ? 0.55 : 1 }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.16 }}
      onDoubleClick={() => setEditing(true)}
      className="group relative w-[220px] rounded-lg p-2.5 shadow-node"
      style={{
        background: '#fff8c8',
        border: `1px ${selected ? 'solid' : 'dashed'} ${
          selected ? '#b89d2a' : '#d6c275'
        }`,
        color: '#3a3013',
      }}
    >
      <div className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-[#d6c275] bg-[#fff8c8]">
        <Icon name="sparkles" size={10} color="#b89d2a" />
      </div>

      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) commit();
            if (e.key === 'Escape') {
              setDraft(c.text);
              setEditing(false);
            }
          }}
          rows={3}
          className="w-full resize-none border-none bg-transparent p-0 text-[11.5px] leading-snug focus:outline-none"
          style={{ color: '#3a3013', fontFamily: 'inherit' }}
        />
      ) : (
        <p
          className={`whitespace-pre-wrap text-[11.5px] leading-snug ${
            c.resolved ? 'line-through' : ''
          }`}
        >
          {c.text || <span className="opacity-50">Empty note — double-click to edit</span>}
        </p>
      )}

      <div className="mt-1.5 flex items-center justify-between text-[9.5px] opacity-60">
        <span>note</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={() =>
              updateNode(id, { resolved: !c.resolved } as Partial<CommentData>)
            }
            title={c.resolved ? 'Reopen' : 'Resolve'}
            className="flex h-4 w-4 items-center justify-center rounded hover:bg-[#e8d99a]"
          >
            <Icon name="check" size={10} color="#3a3013" />
          </button>
          <button
            onClick={() => removeNode(id)}
            title="Delete"
            className="flex h-4 w-4 items-center justify-center rounded hover:bg-[#e8d99a]"
          >
            <Icon name="trash" size={10} color="#3a3013" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export const CommentNode = memo(CommentNodeImpl);
