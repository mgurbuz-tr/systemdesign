import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/utils';

export const USER_COLOR_PALETTE = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const;

function pickDefaultColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return USER_COLOR_PALETTE[Math.abs(h) % USER_COLOR_PALETTE.length];
}

interface IdentityState {
  userId: string;
  username: string | null;
  userColor: string;
  setIdentity: (username: string, userColor: string) => void;
  resetIdentity: () => void;
}

const initialUserId = uid('u');

export const useIdentity = create<IdentityState>()(
  persist(
    (set) => ({
      userId: initialUserId,
      username: null,
      userColor: pickDefaultColor(initialUserId),
      setIdentity: (username, userColor) =>
        set({ username: username.trim().slice(0, 24), userColor }),
      resetIdentity: () =>
        set((s) => ({ username: null, userColor: pickDefaultColor(s.userId) })),
    }),
    {
      name: 'sd-identity',
      version: 1,
      // userId is per-tab so two tabs of the same browser act as distinct
      // presence instances; only the human-facing identity persists.
      partialize: (s) => ({
        username: s.username,
        userColor: s.userColor,
      }),
    },
  ),
);
