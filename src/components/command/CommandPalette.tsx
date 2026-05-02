import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/Icon';
import { CATALOG, findCatalogItem } from '@/lib/catalog';
import { TEMPLATES, buildTemplateWithAutoLayout } from '@/lib/templates';
import { useCanvas } from '@/lib/store/canvasStore';
import { useSettings } from '@/lib/store/settingsStore';
import { createFromTemplate, createProject } from '@/lib/persistence';
import { getRecorder } from '@/lib/persistence/versionRecorder';
import { listVersions } from '@/lib/persistence/versions';
import { restoreVersion } from '@/lib/persistence/restoreVersion';
import { useProject } from '@/lib/store/projectStore';

const QUICK_AI = [
  'Find bottlenecks in this architecture',
  'Suggest where to add caching',
  'Review the schema for missing indexes',
  'Identify security gaps',
  'Estimate monthly infrastructure cost',
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const setAiOpen = useSettings((s) => s.setAiOpen);
  const setHistoryPanelOpen = useSettings((s) => s.setHistoryPanelOpen);
  const toggleTheme = useSettings((s) => s.toggleTheme);
  const setShowGrid = useSettings((s) => s.setShowGrid);
  const setShowMinimap = useSettings((s) => s.setShowMinimap);
  const showGrid = useSettings((s) => s.showGrid);
  const showMinimap = useSettings((s) => s.showMinimap);

  useHotkeys(
    'mod+k',
    (e) => {
      e.preventDefault();
      setOpen((o) => !o);
    },
    { enableOnFormTags: true },
  );

  useHotkeys(
    'esc',
    () => setOpen(false),
    { enabled: open, enableOnFormTags: true },
  );

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const insertNode = (type: string) => {
    const item = findCatalogItem(type);
    if (!item) return;
    // Drop near canvas center; xyflow handles transform.
    const center = { x: 400 + Math.random() * 80, y: 300 + Math.random() * 80 };
    useCanvas.getState().addNodeFromCatalog(item, center);
    setOpen(false);
    toast.success(`Added · ${item.label}`);
  };

  const loadTemplate = async (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setOpen(false);
    const built = await buildTemplateWithAutoLayout(tpl);
    const meta = await createFromTemplate(tpl.name, built.nodes, built.edges, tpl.id);
    toast.success(`Loaded · ${meta.name}`);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-panel shadow-panel"
          >
            <Command label="Command Palette" loop>
              <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
                <Icon name="search" size={14} color="var(--text-dim)" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Type a command, search a component, or ask AI…"
                  className="flex-1 border-none bg-transparent text-[13px] text-text placeholder:text-text-dim focus:outline-none"
                />
                <kbd className="rounded-md border border-border bg-input px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
                  esc
                </kbd>
              </div>

              <Command.List className="max-h-[60vh] overflow-auto p-1.5">
                <Command.Empty className="px-3 py-4 text-center text-[12px] text-text-dim">
                  No results.
                </Command.Empty>

                {query.length > 0 && (
                  <Command.Group heading="Ask AI">
                    {QUICK_AI.filter((q) => q.toLowerCase().includes(query.toLowerCase()))
                      .slice(0, 3)
                      .map((q) => (
                        <CmdItem
                          key={q}
                          icon="sparkles"
                          onSelect={() => {
                            setAiOpen(true);
                            setOpen(false);
                            // Defer so AI panel mounts before consuming.
                            window.setTimeout(() => {
                              const evt = new CustomEvent('sd:ai-prompt', {
                                detail: q,
                              });
                              window.dispatchEvent(evt);
                            }, 50);
                          }}
                        >
                          {q}
                        </CmdItem>
                      ))}
                  </Command.Group>
                )}

                <Command.Group heading="Components">
                  {CATALOG.flatMap((g) =>
                    g.items.map((it) => (
                      <CmdItem
                        key={it.type}
                        icon={it.icon}
                        kbd={it.group}
                        onSelect={() => insertNode(it.type)}
                      >
                        {it.label} <span className="text-text-dim">— {it.description}</span>
                      </CmdItem>
                    )),
                  )}
                </Command.Group>

                <Command.Group heading="Templates">
                  {TEMPLATES.map((t) => (
                    <CmdItem
                      key={t.id}
                      icon="graph"
                      onSelect={() => loadTemplate(t.id)}
                    >
                      {t.name} <span className="text-text-dim">— {t.description}</span>
                    </CmdItem>
                  ))}
                </Command.Group>

                <Command.Group heading="Project">
                  <CmdItem
                    icon="plus"
                    onSelect={async () => {
                      setOpen(false);
                      await createProject('Untitled System');
                      toast.success('Created');
                    }}
                  >
                    New blank project
                  </CmdItem>
                </Command.Group>

                <Command.Group heading="Version history">
                  <CmdItem
                    icon="history"
                    kbd="⌘⇧H"
                    onSelect={() => {
                      setHistoryPanelOpen(true);
                      setOpen(false);
                    }}
                  >
                    Show version history
                  </CmdItem>
                  <CmdItem
                    icon="check"
                    onSelect={async () => {
                      setOpen(false);
                      const rec = getRecorder();
                      if (!rec) {
                        toast.error('Open a project first.');
                        return;
                      }
                      await rec.recordManual('Manual save');
                      toast.success('Version saved');
                    }}
                  >
                    Save version now
                  </CmdItem>
                  <CmdItem
                    icon="history"
                    onSelect={async () => {
                      setOpen(false);
                      const proj = useProject.getState().current;
                      if (!proj) {
                        toast.error('Open a project first.');
                        return;
                      }
                      const list = await listVersions(proj.id, 1);
                      const last = list[0];
                      if (!last || last.id == null) {
                        toast.error('No version to restore.');
                        return;
                      }
                      await restoreVersion(last.id);
                    }}
                  >
                    Restore last version
                  </CmdItem>
                </Command.Group>

                <Command.Group heading="View">
                  <CmdItem
                    icon={showGrid ? 'check' : 'circle'}
                    onSelect={() => {
                      setShowGrid(!showGrid);
                      setOpen(false);
                    }}
                  >
                    Toggle grid
                  </CmdItem>
                  <CmdItem
                    icon={showMinimap ? 'check' : 'circle'}
                    onSelect={() => {
                      setShowMinimap(!showMinimap);
                      setOpen(false);
                    }}
                  >
                    Toggle mini-map
                  </CmdItem>
                  <CmdItem
                    icon="moon"
                    kbd="⌘⇧L"
                    onSelect={() => {
                      toggleTheme();
                      setOpen(false);
                    }}
                  >
                    Toggle theme
                  </CmdItem>
                  <CmdItem
                    icon="sparkles"
                    kbd="⌘I"
                    onSelect={() => {
                      setAiOpen(true);
                      setOpen(false);
                    }}
                  >
                    Open AI Copilot
                  </CmdItem>
                </Command.Group>
              </Command.List>

              <div className="flex items-center justify-between border-t border-border px-3.5 py-1.5 text-[10px] text-text-dim">
                <span>↑↓ navigate · ↵ select · esc close</span>
                <span>⌘K</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CmdItem({
  icon,
  children,
  kbd,
  onSelect,
}: {
  icon: string;
  children: React.ReactNode;
  kbd?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] text-text data-[selected=true]:bg-hover"
    >
      <Icon name={icon} size={13} color="var(--text-dim)" />
      <span className="flex-1 truncate">{children}</span>
      {kbd && (
        <span className="text-[9.5px] uppercase tracking-[0.06em] text-text-dim">
          {kbd}
        </span>
      )}
    </Command.Item>
  );
}
