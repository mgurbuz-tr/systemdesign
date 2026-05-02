import type { Node } from '@xyflow/react';
import type { NodeData } from '@/types';
import type { AnalysisReport } from './types';

/**
 * Renders an AnalysisReport as a compact markdown block suitable for
 * splicing into an LLM prompt. Keeps node ids first so the model can
 * reference them when proposing patches.
 */
export function formatAnalysisMarkdown(
  report: AnalysisReport,
  nodes: Node<NodeData>[],
): string {
  const labelOf = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n ? `${id} (${n.data.label})` : id;
  };

  const lines: string[] = [];
  lines.push(`## Architecture review — score ${report.totalScore}/100`);
  lines.push('');
  lines.push('### Pillar scores');
  for (const p of report.scorecard) {
    lines.push(
      `- **${p.pillar}** ${p.score} (${p.grade})${
        p.findings.length ? ` · ${p.findings.length} findings` : ''
      }${p.strengths.length ? ` · ${p.strengths.length} strengths` : ''}`,
    );
  }

  lines.push('');
  lines.push('### Single points of failure');
  if (report.spof.articulationPoints.length === 0) {
    lines.push('- none');
  } else {
    for (const id of report.spof.articulationPoints) {
      lines.push(`- ${labelOf(id)}`);
    }
  }
  if (report.spof.bridges.length > 0) {
    lines.push('');
    lines.push('### Bridge edges (cut → graph splits)');
    for (const b of report.spof.bridges) {
      lines.push(`- ${labelOf(b.source)} → ${labelOf(b.target)}`);
    }
  }

  lines.push('');
  lines.push('### Bottlenecks (top 5)');
  for (const b of report.bottlenecks.slice(0, 5)) {
    lines.push(
      `- ${labelOf(b.nodeId)} — score ${b.score.toFixed(2)} (in:${b.inDegree}, out:${b.outDegree})`,
    );
  }

  lines.push('');
  lines.push('### Critical paths (longest p99)');
  if (report.criticalPaths.length === 0) {
    lines.push('- none detected');
  } else {
    for (const p of report.criticalPaths) {
      const trail = p.path.map((id) => labelOf(id)).join(' → ');
      lines.push(`- ${trail} · ~${p.totalLatencyMs}ms`);
    }
  }

  lines.push('');
  lines.push('### Read/Write summary');
  lines.push(
    `- hot reads: ${report.readWrite.hot.length} · uncached pairs: ${report.readWrite.uncached.length} · async writes: ${report.readWrite.asyncWrites.length}`,
  );

  lines.push('');
  lines.push('### Findings');
  if (report.findings.length === 0) {
    lines.push('- none');
  } else {
    for (const f of report.findings) {
      const anchor = f.anchor ? ` _(${f.anchor.kind}:${f.anchor.id})_` : '';
      lines.push(`- [${f.severity}] **${f.code}** — ${f.message}${anchor}`);
    }
  }

  return lines.join('\n');
}
