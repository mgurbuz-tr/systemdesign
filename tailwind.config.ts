import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: 'var(--canvas-bg)',
        panel: 'var(--panel-bg)',
        hover: 'var(--hover)',
        input: 'var(--input-bg)',
        border: 'var(--border)',
        'border-light': 'var(--border-light)',
        text: 'var(--text)',
        'text-dim': 'var(--text-dim)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'node-bg': 'var(--node-bg)',
        'node-border': 'var(--node-border)',
        'edge-color': 'var(--edge-color)',
        'group-bg': 'var(--group-bg)',
        'group-border': 'var(--group-border)',
        'grid-dot': 'var(--grid-dot)',
        // Category tones
        'tone-data-bg': 'var(--tone-data-bg)',
        'tone-data-fg': 'var(--tone-data-fg)',
        'tone-cache-bg': 'var(--tone-cache-bg)',
        'tone-cache-fg': 'var(--tone-cache-fg)',
        'tone-queue-bg': 'var(--tone-queue-bg)',
        'tone-queue-fg': 'var(--tone-queue-fg)',
        'tone-service-bg': 'var(--tone-service-bg)',
        'tone-service-fg': 'var(--tone-service-fg)',
        'tone-edge-bg': 'var(--tone-edge-bg)',
        'tone-edge-fg': 'var(--tone-edge-fg)',
        'tone-ai-bg': 'var(--tone-ai-bg)',
        'tone-ai-fg': 'var(--tone-ai-fg)',
        'tone-client-bg': 'var(--tone-client-bg)',
        'tone-client-fg': 'var(--tone-client-fg)',
        'tone-external-bg': 'var(--tone-external-bg)',
        'tone-external-fg': 'var(--tone-external-fg)',
        'tone-ops-bg': 'var(--tone-ops-bg)',
        'tone-ops-fg': 'var(--tone-ops-fg)',
      },
      boxShadow: {
        node: 'var(--node-shadow)',
        panel: 'var(--panel-shadow)',
      },
      borderRadius: {
        node: 'var(--node-radius)',
      },
      transitionTimingFunction: {
        'out-fast': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
