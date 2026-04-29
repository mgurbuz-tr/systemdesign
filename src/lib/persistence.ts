import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  db,
  loadProject,
  saveSnapshot,
  duplicateProject as dupProject,
  deleteProject as delProject,
  listProjects,
} from '@/lib/db/database';
import { useCanvas } from '@/lib/store/canvasStore';
import { useProject } from '@/lib/store/projectStore';
import type { ProjectMeta } from '@/types';
import { uid } from '@/lib/utils';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PersistenceState {
  status: SaveStatus;
  lastProjectId: string | null;
  setStatus: (s: SaveStatus) => void;
  setLastProjectId: (id: string | null) => void;
}

export const usePersistence = create<PersistenceState>()(
  persist(
    (set) => ({
      status: 'idle',
      lastProjectId: null,
      setStatus: (status) => set({ status }),
      setLastProjectId: (lastProjectId) => set({ lastProjectId }),
    }),
    {
      name: 'sd-persistence',
      partialize: (s) => ({ lastProjectId: s.lastProjectId }),
    },
  ),
);

let saveTimer: number | null = null;
let savedFlashTimer: number | null = null;

/**
 * Subscribe canvas + project changes to debounced auto-save (300ms).
 * Returns cleanup function.
 */
export function startAutoSave(): () => void {
  const trigger = () => {
    const project = useProject.getState().current;
    if (!project) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    if (savedFlashTimer) window.clearTimeout(savedFlashTimer);

    usePersistence.getState().setStatus('saving');
    saveTimer = window.setTimeout(async () => {
      try {
        const { nodes, edges } = useCanvas.getState();
        await saveSnapshot(project, nodes, edges);
        usePersistence.getState().setLastProjectId(project.id);
        usePersistence.getState().setStatus('saved');
        savedFlashTimer = window.setTimeout(() => {
          usePersistence.getState().setStatus('idle');
        }, 1400);
      } catch (err) {
        console.error('save failed', err);
        usePersistence.getState().setStatus('error');
      }
    }, 300);
  };

  const unsubCanvas = useCanvas.subscribe(trigger);
  const unsubProject = useProject.subscribe(trigger);

  return () => {
    unsubCanvas();
    unsubProject();
  };
}

/**
 * Restore last opened project (on app boot).
 * If none, starts blank.
 */
export async function restoreLastProject(): Promise<void> {
  const id = usePersistence.getState().lastProjectId;
  if (!id) return;
  const row = await loadProject(id);
  if (!row) return;
  const { nodes, edges, ...meta } = row;
  useProject.setState({ current: meta });
  useCanvas.setState({ nodes, edges, selectedNodeId: null, selectedEdgeId: null });
}

/** Open a project by id; loads snapshot into canvas. */
export async function openProject(id: string): Promise<void> {
  const row = await loadProject(id);
  if (!row) return;
  const { nodes, edges, ...meta } = row;
  useProject.setState({ current: meta });
  useCanvas.setState({ nodes, edges, selectedNodeId: null, selectedEdgeId: null });
  usePersistence.getState().setLastProjectId(id);
}

/** Create a new blank project and switch to it. */
export async function createProject(name = 'Untitled System'): Promise<ProjectMeta> {
  const meta: ProjectMeta = {
    id: uid('proj'),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.projects.put({ ...meta, nodes: [], edges: [] });
  useProject.setState({ current: meta });
  useCanvas.setState({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null });
  usePersistence.getState().setLastProjectId(meta.id);
  return meta;
}

/** Create project from a template. */
export async function createFromTemplate(
  name: string,
  nodes: import('@xyflow/react').Node[],
  edges: import('@xyflow/react').Edge[],
): Promise<ProjectMeta> {
  const meta: ProjectMeta = {
    id: uid('proj'),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.projects.put({ ...meta, nodes: nodes as any, edges: edges as any });
  useProject.setState({ current: meta });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCanvas.setState({ nodes: nodes as any, edges: edges as any, selectedNodeId: null, selectedEdgeId: null });
  usePersistence.getState().setLastProjectId(meta.id);
  return meta;
}

export async function renameCurrent(name: string): Promise<void> {
  const cur = useProject.getState().current;
  if (!cur) return;
  const next = { ...cur, name, updatedAt: Date.now() };
  useProject.setState({ current: next });
  const { nodes, edges } = useCanvas.getState();
  await saveSnapshot(next, nodes, edges);
}

export async function deleteCurrent(): Promise<void> {
  const cur = useProject.getState().current;
  if (!cur) return;
  await delProject(cur.id);
  if (usePersistence.getState().lastProjectId === cur.id) {
    usePersistence.getState().setLastProjectId(null);
  }
  await createProject();
}

export async function duplicateCurrent(): Promise<ProjectMeta | null> {
  const cur = useProject.getState().current;
  if (!cur) return null;
  // Persist current state first to ensure copy is fresh.
  const { nodes, edges } = useCanvas.getState();
  await saveSnapshot(cur, nodes, edges);
  const copy = await dupProject(cur.id);
  if (copy) await openProject(copy.id);
  return copy;
}

export { listProjects };
