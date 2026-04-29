import { create } from 'zustand';
import type { ProjectMeta } from '@/types';
import { uid } from '@/lib/utils';

interface ProjectState {
  current: ProjectMeta | null;
  setCurrent: (m: ProjectMeta | null) => void;
  newProject: (name?: string) => ProjectMeta;
  rename: (name: string) => void;
}

export const useProject = create<ProjectState>((set, get) => ({
  current: {
    id: uid('proj'),
    name: 'Untitled System',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  setCurrent: (current) => set({ current }),
  newProject: (name = 'Untitled System') => {
    const meta: ProjectMeta = {
      id: uid('proj'),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({ current: meta });
    return meta;
  },
  rename: (name) => {
    const cur = get().current;
    if (!cur) return;
    set({ current: { ...cur, name, updatedAt: Date.now() } });
  },
}));
