import { toPng, toSvg } from 'html-to-image';
import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData, ProjectMeta } from '@/types';

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
}

function downloadDataUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

const REACT_FLOW_ROOT_SELECTOR = '.react-flow__viewport';

async function captureCanvas(): Promise<HTMLElement | null> {
  // We capture the .react-flow container so background, edges, nodes are included.
  const root = document.querySelector('.react-flow') as HTMLElement | null;
  return root;
}

export async function exportPng(projectName: string): Promise<void> {
  const root = await captureCanvas();
  if (!root) return;
  const dataUrl = await toPng(root, {
    cacheBust: true,
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim(),
    pixelRatio: 2,
    filter: (node) => {
      // Skip controls/minimap/attribution to keep export clean.
      if (!(node instanceof HTMLElement)) return true;
      const cls = node.className?.toString?.() ?? '';
      if (cls.includes('react-flow__controls')) return false;
      if (cls.includes('react-flow__minimap')) return false;
      if (cls.includes('react-flow__attribution')) return false;
      return true;
    },
  });
  downloadDataUrl(dataUrl, `${safeFilename(projectName)}.png`);
}

export async function exportSvg(projectName: string): Promise<void> {
  const root = await captureCanvas();
  if (!root) return;
  const dataUrl = await toSvg(root, {
    cacheBust: true,
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim(),
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      const cls = node.className?.toString?.() ?? '';
      if (cls.includes('react-flow__controls')) return false;
      if (cls.includes('react-flow__minimap')) return false;
      if (cls.includes('react-flow__attribution')) return false;
      return true;
    },
  });
  downloadDataUrl(dataUrl, `${safeFilename(projectName)}.svg`);
}

export function exportMermaid(
  projectName: string,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): void {
  const lines: string[] = [];
  lines.push(`%% ${projectName}`);
  lines.push('graph LR');

  for (const n of nodes) {
    const id = sanitizeMermaidId(n.id);
    const label = escapeMermaid(n.data.label);
    const meta = n.data.meta ? `<br/><small>${escapeMermaid(n.data.meta)}</small>` : '';
    // Tone-aware shapes (subset)
    const open = shapeFor(n.data.tone).open;
    const close = shapeFor(n.data.tone).close;
    lines.push(`  ${id}${open}"${label}${meta}"${close}`);
  }

  for (const e of edges) {
    const data = (e.data as EdgeData | undefined) ?? { protocol: 'rest' };
    const protocol = data.protocol.toUpperCase();
    const arrow = data.async ? '-. ' : '--';
    const tail = data.async ? ' .->' : '-->';
    const label = `|${protocol}|`;
    lines.push(
      `  ${sanitizeMermaidId(e.source)} ${arrow}${label}${tail} ${sanitizeMermaidId(e.target)}`,
    );
  }

  // Class definitions for tones (Mermaid styles)
  lines.push('');
  lines.push('classDef data fill:#eef2f7,stroke:#4a6e95,color:#4a6e95;');
  lines.push('classDef cache fill:#f7efe6,stroke:#a8773d,color:#a8773d;');
  lines.push('classDef queue fill:#f1ecf5,stroke:#7a5e93,color:#7a5e93;');
  lines.push('classDef service fill:#edf3ee,stroke:#4d7551,color:#4d7551;');
  lines.push('classDef edge fill:#f4ede9,stroke:#8a5e4d,color:#8a5e4d;');
  lines.push('classDef ai fill:#f3eaf3,stroke:#8a4a87,color:#8a4a87;');
  lines.push('classDef client fill:#f0f0ed,stroke:#5c5c58,color:#5c5c58;');
  lines.push('classDef external fill:#f3edec,stroke:#8a5b54,color:#8a5b54;');
  lines.push('classDef ops fill:#eef3f1,stroke:#4d7e72,color:#4d7e72;');

  for (const n of nodes) {
    lines.push(`  class ${sanitizeMermaidId(n.id)} ${n.data.tone};`);
  }

  downloadBlob(lines.join('\n'), 'text/plain;charset=utf-8', `${safeFilename(projectName)}.mmd`);
}

export function exportJson(
  meta: ProjectMeta,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): void {
  const payload = JSON.stringify({ project: meta, nodes, edges }, null, 2);
  downloadBlob(payload, 'application/json', `${safeFilename(meta.name)}.json`);
}

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeMermaid(s: string): string {
  return s.replace(/"/g, "'").replace(/[<>]/g, '');
}

function shapeFor(tone: string): { open: string; close: string } {
  switch (tone) {
    case 'data':
      return { open: '[(', close: ')]' }; // cylinder
    case 'cache':
      return { open: '[(', close: ')]' };
    case 'queue':
      return { open: '[/', close: '\\]' }; // parallelogram
    case 'service':
      return { open: '[', close: ']' };
    case 'edge':
      return { open: '{{', close: '}}' };
    case 'client':
      return { open: '([', close: '])' };
    case 'ai':
      return { open: '>', close: ']' };
    case 'external':
      return { open: '[\\', close: '/]' };
    case 'ops':
      return { open: '[/', close: '/]' };
    default:
      return { open: '[', close: ']' };
  }
}

// Stop typescript "unused import" complaints if we change strategy later.
void REACT_FLOW_ROOT_SELECTOR;
