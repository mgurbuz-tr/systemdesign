import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/Icon';
import { useProject } from '@/lib/store/projectStore';
import { useCanvas } from '@/lib/store/canvasStore';
import {
  createFromTemplate,
  createProject,
  deleteCurrent,
  duplicateCurrent,
  listProjects,
  openProject,
  renameCurrent,
  resetToTemplate,
} from '@/lib/persistence';
import {
  TEMPLATES,
  buildTemplateWithAutoLayout,
  findTemplate,
} from '@/lib/templates';
import { exportJson, exportMermaid, exportPng, exportSvg } from '@/lib/export';
import type { ProjectMeta } from '@/types';

export function WorkspaceMenu() {
  const project = useProject((s) => s.current);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<ProjectMeta[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listProjects().then(setRecents).catch(console.error);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const onNew = async () => {
    setOpen(false);
    const meta = await createProject('Untitled System');
    toast.success(`Created · ${meta.name}`);
  };

  const onRename = async () => {
    if (!draftName.trim() || !project) return;
    await renameCurrent(draftName.trim());
    setRenaming(false);
    setOpen(false);
    toast.success('Renamed');
  };

  const onDuplicate = async () => {
    setOpen(false);
    const copy = await duplicateCurrent();
    if (copy) toast.success(`Duplicated · ${copy.name}`);
  };

  const onDelete = async () => {
    if (!project) return;
    if (!window.confirm(`"${project.name}" silinecek. Emin misin?`)) return;
    setOpen(false);
    await deleteCurrent();
    toast.success('Deleted');
  };

  const onOpen = async (id: string) => {
    if (id === project?.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    await openProject(id);
    toast.success('Opened');
  };

  const onExportJson = () => {
    if (!project) return;
    const { nodes, edges } = useCanvas.getState();
    exportJson(project, nodes, edges);
    setOpen(false);
  };

  const onExportMermaid = () => {
    if (!project) return;
    const { nodes, edges } = useCanvas.getState();
    exportMermaid(project.name, nodes, edges);
    setOpen(false);
    toast.success('Mermaid file downloaded');
  };

  const onExportPng = async () => {
    if (!project) return;
    setOpen(false);
    try {
      await exportPng(project.name);
      toast.success('PNG downloaded');
    } catch {
      toast.error('PNG export failed');
    }
  };

  const onExportSvg = async () => {
    if (!project) return;
    setOpen(false);
    try {
      await exportSvg(project.name);
      toast.success('SVG downloaded');
    } catch {
      toast.error('SVG export failed');
    }
  };

  const onImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const meta = await createProject(parsed.project?.name ?? 'Imported');
        useCanvas.setState({
          nodes: parsed.nodes ?? [],
          edges: parsed.edges ?? [],
          selectedNodeId: null,
          selectedEdgeId: null,
        });
        await openProject(meta.id);
        toast.success(`Imported · ${meta.name}`);
      } catch (err) {
        console.error(err);
        toast.error('Import failed');
      }
    };
    input.click();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setDraftName(project?.name ?? '');
          setRenaming(false);
        }}
        className="flex h-[30px] w-full items-center gap-1.5 rounded-md border border-border bg-input px-2.5 text-[12px] text-text transition-colors hover:bg-hover"
        aria-label="Workspace switcher"
      >
        <span
          className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {project?.name?.slice(0, 2).toUpperCase() ?? 'SD'}
        </span>
        <span className="flex-1 truncate text-left">
          {project?.name ?? 'Untitled System'}
        </span>
        <Icon name="chevron-down" size={11} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border border-border bg-panel shadow-panel"
            role="menu"
          >
            {renaming ? (
              <div className="border-b border-border p-2">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRename();
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                  className="h-7 w-full rounded-md border border-border bg-input px-2 text-[12px] text-text focus:border-accent focus:outline-none"
                  placeholder="Project name"
                />
                <div className="mt-1 flex justify-end gap-1">
                  <MenuMini onClick={() => setRenaming(false)}>Cancel</MenuMini>
                  <MenuMini onClick={onRename} primary>
                    Save
                  </MenuMini>
                </div>
              </div>
            ) : (
              <MenuRow icon="plus" onClick={onNew}>
                New project
              </MenuRow>
            )}

            {!renaming && (
              <>
                <div className="border-t border-border px-3 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Templates
                </div>
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={async () => {
                      setOpen(false);
                      const built = await buildTemplateWithAutoLayout(t);
                      const meta = await createFromTemplate(
                        t.name,
                        built.nodes,
                        built.edges,
                        t.id,
                      );
                      toast.success(`Loaded · ${meta.name}`);
                    }}
                    role="menuitem"
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-hover"
                  >
                    <Icon name="graph" size={12} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] text-text">{t.name}</div>
                      <div className="truncate text-[10px] text-text-dim">{t.description}</div>
                    </div>
                  </button>
                ))}

                {/* Reset to template — proje template'ten oluşturulduysa */}
                {project?.templateId && findTemplate(project.templateId) && (
                  <>
                    <div className="border-t border-border px-3 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                      Reset
                    </div>
                    <MenuRow
                      icon="trash"
                      onClick={async () => {
                        const tpl = findTemplate(project.templateId!);
                        if (!tpl) return;
                        const ok = window.confirm(
                          `"${tpl.name}" template will be restored to its original state. All changes will be lost (Cmd+Z still works). Continue?`,
                        );
                        if (!ok) return;
                        setOpen(false);
                        const r = await resetToTemplate();
                        if (r.ok)
                          toast.success(`Reset · ${r.templateName ?? 'template'}`);
                        else toast.error('Reset failed');
                      }}
                    >
                      ↺ Reset to template
                      <span className="ml-2 text-[9.5px] text-text-dim">
                        ({findTemplate(project.templateId)?.name})
                      </span>
                    </MenuRow>
                  </>
                )}

                <div className="border-t border-border px-3 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Project
                </div>
                <MenuRow icon="doc" onClick={() => setRenaming(true)}>
                  Rename
                </MenuRow>
                <MenuRow icon="copy" onClick={onDuplicate}>
                  Duplicate
                </MenuRow>
                <MenuRow icon="download" onClick={onExportJson}>
                  Export JSON
                </MenuRow>
                <MenuRow icon="download" onClick={onExportMermaid}>
                  Export Mermaid
                </MenuRow>
                <MenuRow icon="download" onClick={onExportPng}>
                  Export PNG
                </MenuRow>
                <MenuRow icon="download" onClick={onExportSvg}>
                  Export SVG
                </MenuRow>
                <MenuRow icon="upload" onClick={onImport}>
                  Import JSON
                </MenuRow>
                <MenuRow icon="trash" onClick={onDelete} danger>
                  Delete project
                </MenuRow>
              </>
            )}

            {recents.length > 0 && (
              <>
                <div className="border-t border-border px-3 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Recent
                </div>
                <div className="max-h-44 overflow-auto pb-1">
                  {recents.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onOpen(p.id)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-hover ${
                        p.id === project?.id ? 'text-text' : 'text-text-dim'
                      }`}
                    >
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[8px] font-bold text-white"
                        style={{ background: 'var(--text-dim)' }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.id === project?.id && <Icon name="check" size={10} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuRow({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: string;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-hover ${
        danger ? 'text-[#c96442]' : 'text-text'
      }`}
    >
      <Icon name={icon} size={12} />
      <span>{children}</span>
    </button>
  );
}

function MenuMini({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
        primary ? 'text-white' : 'text-text hover:bg-hover'
      }`}
      style={primary ? { background: 'var(--accent)' } : undefined}
    >
      {children}
    </button>
  );
}
