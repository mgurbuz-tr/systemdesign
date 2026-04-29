import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EdgeStyle, NodeDisplay } from '@/types';

type Theme = 'light' | 'dark';
type Density = 'compact' | 'cozy';

interface SettingsState {
  theme: Theme;
  density: Density;
  edgeStyle: EdgeStyle;
  nodeDisplay: NodeDisplay;
  showGrid: boolean;
  showMinimap: boolean;
  accent: string;
  lmStudioBaseUrl: string;
  /** Optional Bearer token — newer LM Studio versions enable auth by default. */
  lmStudioApiKey: string;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  aiOpen: boolean;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setDensity: (d: Density) => void;
  setEdgeStyle: (s: EdgeStyle) => void;
  setNodeDisplay: (d: NodeDisplay) => void;
  setShowGrid: (v: boolean) => void;
  setShowMinimap: (v: boolean) => void;
  setAccent: (c: string) => void;
  setLmStudioBaseUrl: (u: string) => void;
  setLmStudioApiKey: (k: string) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setInspectorOpen: (v: boolean) => void;
  setAiOpen: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      density: 'compact',
      edgeStyle: 'orthogonal',
      nodeDisplay: 'detailed',
      showGrid: true,
      showMinimap: true,
      accent: '#1a1a1a',
      lmStudioBaseUrl: 'http://localhost:1234',
      lmStudioApiKey: '',
      sidebarCollapsed: false,
      inspectorOpen: false,
      aiOpen: false,

      setTheme: (theme) => {
        document.documentElement.classList.add('theme-transition');
        document.documentElement.dataset.theme = theme;
        set({ theme });
        window.setTimeout(() => {
          document.documentElement.classList.remove('theme-transition');
        }, 220);
      },
      toggleTheme: () => {
        const next = useSettings.getState().theme === 'dark' ? 'light' : 'dark';
        useSettings.getState().setTheme(next);
      },
      setDensity: (density) => set({ density }),
      setEdgeStyle: (edgeStyle) => set({ edgeStyle }),
      setNodeDisplay: (nodeDisplay) => set({ nodeDisplay }),
      setShowGrid: (showGrid) => set({ showGrid }),
      setShowMinimap: (showMinimap) => set({ showMinimap }),
      setAccent: (accent) => {
        document.documentElement.style.setProperty('--accent', accent);
        const r = parseInt(accent.slice(1, 3), 16);
        const g = parseInt(accent.slice(3, 5), 16);
        const b = parseInt(accent.slice(5, 7), 16);
        document.documentElement.style.setProperty(
          '--accent-soft',
          `rgba(${r}, ${g}, ${b}, 0.11)`,
        );
        set({ accent });
      },
      setLmStudioBaseUrl: (lmStudioBaseUrl) => set({ lmStudioBaseUrl }),
      setLmStudioApiKey: (lmStudioApiKey) => set({ lmStudioApiKey }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setAiOpen: (aiOpen) => set({ aiOpen }),
    }),
    {
      name: 'sd-settings',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.dataset.theme = state.theme;
          if (state.accent && state.accent !== '#1a1a1a') {
            const r = parseInt(state.accent.slice(1, 3), 16);
            const g = parseInt(state.accent.slice(3, 5), 16);
            const b = parseInt(state.accent.slice(5, 7), 16);
            document.documentElement.style.setProperty('--accent', state.accent);
            document.documentElement.style.setProperty(
              '--accent-soft',
              `rgba(${r}, ${g}, ${b}, 0.11)`,
            );
          }
        }
      },
    },
  ),
);
