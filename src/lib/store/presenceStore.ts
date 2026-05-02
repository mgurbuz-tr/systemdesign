import { create } from 'zustand';

export interface RemoteCursor {
  userId: string;
  username: string;
  color: string;
  x: number;
  y: number;
  lastSeenMs: number;
}

interface PresenceState {
  remote: Record<string, RemoteCursor>;
  upsert: (c: RemoteCursor) => void;
  patch: (userId: string, patch: Partial<RemoteCursor>) => void;
  remove: (userId: string) => void;
  clear: () => void;
  pruneStale: (olderThanMs?: number) => void;
}

export const usePresence = create<PresenceState>((set, get) => ({
  remote: {},
  upsert: (c) =>
    set((s) => ({ remote: { ...s.remote, [c.userId]: c } })),
  patch: (userId, patch) =>
    set((s) => {
      const cur = s.remote[userId];
      if (!cur) return s;
      return { remote: { ...s.remote, [userId]: { ...cur, ...patch } } };
    }),
  remove: (userId) =>
    set((s) => {
      if (!(userId in s.remote)) return s;
      const next = { ...s.remote };
      delete next[userId];
      return { remote: next };
    }),
  clear: () => set({ remote: {} }),
  pruneStale: (olderThanMs = 5000) => {
    const cutoff = Date.now() - olderThanMs;
    const cur = get().remote;
    let changed = false;
    const next: Record<string, RemoteCursor> = {};
    for (const [k, v] of Object.entries(cur)) {
      if (v.lastSeenMs >= cutoff) next[k] = v;
      else changed = true;
    }
    if (changed) set({ remote: next });
  },
}));
