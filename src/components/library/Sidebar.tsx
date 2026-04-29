import { useState, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { CATALOG, searchCatalog } from '@/lib/catalog';
import { useSettings } from '@/lib/store/settingsStore';
import { WorkspaceMenu } from '@/components/projects/WorkspaceMenu';
import { cn } from '@/lib/utils';
import type { CatalogItem } from '@/types';

export const DRAG_MIME = 'application/x-sd-catalog-type';

function onCatalogDragStart(e: DragEvent, item: CatalogItem) {
  e.dataTransfer.setData(DRAG_MIME, item.type);
  e.dataTransfer.effectAllowed = 'move';
}

export function Sidebar() {
  const { sidebarCollapsed } = useSettings();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATALOG.map((g) => [g.group, true])),
  );

  if (sidebarCollapsed) {
    return <CollapsedSidebar />;
  }

  const filtered = searchCatalog(search);

  return (
    <aside
      className="flex w-64 flex-col overflow-hidden border-r border-border bg-panel"
      style={{ flexShrink: 0 }}
    >
      <div className="border-b border-border p-3.5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-accent">
            <Icon name="logo" size={18} stroke={1.6} />
          </span>
          <span className="text-[13px] font-semibold text-text">SystemDesign</span>
          <span
            className="ml-auto rounded-[3px] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.05em]"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            BETA
          </span>
        </div>
        <WorkspaceMenu />
      </div>

      <nav className="border-b border-border p-2" aria-label="Project sections">
        {[
          { icon: 'graph', label: 'Architecture', active: true },
          { icon: 'doc', label: 'Documentation' },
          { icon: 'folder', label: 'Resources' },
          { icon: 'history', label: 'Changelog' },
        ].map((it) => (
          <button
            key={it.label}
            className={cn(
              'flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[12px]',
              it.active
                ? 'bg-hover font-medium text-text'
                : 'text-text-dim hover:bg-hover hover:text-text',
            )}
          >
            <Icon name={it.icon} size={13} />
            <span>{it.label}</span>
          </button>
        ))}
      </nav>

      <div className="px-3 pb-2 pt-3">
        <div className="flex h-7 items-center gap-1.5 rounded-[5px] border border-border bg-input px-2">
          <Icon name="search" size={12} color="var(--text-dim)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components"
            className="flex-1 border-none bg-transparent text-[11px] text-text placeholder:text-text-dim focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1 pb-3">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
            Components
          </span>
          <span className="text-[9px] text-text-dim">drag to canvas</span>
        </div>
        {filtered.map((group) => {
          const isOpen = expanded[group.group] !== false;
          return (
            <div key={group.group} className="mb-1">
              <button
                onClick={() =>
                  setExpanded((s) => ({ ...s, [group.group]: !isOpen }))
                }
                className="flex w-full items-center gap-1 px-3 py-1 text-left text-[11px] font-medium text-text"
              >
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.12 }}
                  className="flex"
                >
                  <Icon name="chevron-right" size={9} />
                </motion.span>
                <span className="flex-1">{group.group}</span>
                <span className="text-[9px] text-text-dim">{group.items.length}</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {group.items.map((item) => (
                      <CatalogTile key={item.type} item={item} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function CatalogTile({ item }: { item: CatalogItem }) {
  return (
    <motion.div
      draggable
      onDragStart={(e) => onCatalogDragStart(e as unknown as DragEvent, item)}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.12 }}
      className="group mx-1 flex cursor-grab items-center gap-2 rounded-[5px] px-2.5 py-1.5 hover:bg-hover active:cursor-grabbing"
      style={{
        background: 'transparent',
      }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-[5px]"
        style={{
          background: `var(--tone-${item.tone}-bg)`,
          color: `var(--tone-${item.tone}-fg)`,
        }}
      >
        <Icon name={item.icon} size={13} stroke={1.6} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-medium text-text">
          {item.label}
        </div>
        <div className="truncate text-[10px] text-text-dim">{item.description}</div>
      </div>
    </motion.div>
  );
}

function CollapsedSidebar() {
  return (
    <aside
      className="flex w-12 flex-col items-center gap-2 border-r border-border bg-panel py-3"
      style={{ flexShrink: 0 }}
    >
      <div className="mb-2 text-accent">
        <Icon name="logo" size={20} stroke={1.6} />
      </div>
      {(['folder', 'graph', 'doc', 'history', 'gear'] as const).map((n) => (
        <button
          key={n}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-dim hover:bg-hover hover:text-text"
        >
          <Icon name={n} size={15} />
        </button>
      ))}
    </aside>
  );
}
