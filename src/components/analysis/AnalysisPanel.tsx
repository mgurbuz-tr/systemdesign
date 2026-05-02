import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useCanvas } from '@/lib/store/canvasStore';
import { useSettings } from '@/lib/store/settingsStore';
import { runAllAnalyses } from '@/lib/analysis';
import type { AnalysisReport } from '@/lib/analysis/types';
import { formatAnalysisMarkdown } from '@/lib/analysis/format';
import { askAiWithTask } from '@/lib/ai/askAi';
import { Scorecard } from './Scorecard';
import { FindingsList } from './FindingsList';
import { cn } from '@/lib/utils';

/**
 * Sidebar-embedded analysis view. Re-runs the static analyzer suite shortly
 * after every canvas mutation; the run is synchronous and cheap (<50ms on
 * realistic graphs), so we don't need a worker. Three overlay toggles plug
 * into canvas rendering via `analysisOverlays` settings.
 */
export function AnalysisPanel() {
  const nodes = useCanvas((s) => s.nodes);
  const edges = useCanvas((s) => s.edges);
  const overlays = useSettings((s) => s.analysisOverlays);
  const setOverlay = useSettings((s) => s.setAnalysisOverlay);

  const [tick, setTick] = useState(0); // forces manual re-run

  // Recompute on every canvas change (cheap, deterministic).
  const report: AnalysisReport = useMemo(
    () => runAllAnalyses(nodes, edges),
    // tick is intentionally part of the dep list to allow manual re-runs
    // even when nodes/edges references haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, tick],
  );

  // Notify any consumer (canvas overlays) that the report changed.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<AnalysisReport>('sd:analysis-report', { detail: report }),
    );
  }, [report]);

  const hybridAnalysisMarkdown = useMemo(
    () => formatAnalysisMarkdown(report, nodes),
    [report, nodes],
  );

  const sendHybridReview = (
    mode: 'annotate_architecture' | 'refactor_graph',
    objective: string,
    promptSuffix: string,
  ) => {
    askAiWithTask({
      prompt:
        `${objective}\n\n` +
        `Deterministic analysis below is ground truth for measurable facts. ` +
        `Use it, then add principal-architect judgment for patterns, tradeoffs, CAP reasoning, and concrete next steps.\n\n` +
        `${hybridAnalysisMarkdown}\n\n${promptSuffix}`,
      task: {
        mode,
        allowRelatedUpdates: true,
        objective,
      },
    });
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          Architecture review
        </span>
        <button
          onClick={() => setTick((t) => t + 1)}
          title="Re-analyze"
          className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-text"
          aria-label="Re-analyze"
        >
          <Icon name="history" size={11} stroke={1.6} />
        </button>
      </div>

      <Scorecard totalScore={report.totalScore} scorecard={report.scorecard} />

      <div className="grid grid-cols-3 gap-1 px-3 py-2.5">
        <OverlayToggle
          icon="metrics"
          label="Heat-map"
          active={overlays.heatmap}
          onToggle={() => setOverlay('heatmap', !overlays.heatmap)}
        />
        <OverlayToggle
          icon="auth"
          label="SPOF"
          active={overlays.spof}
          onToggle={() => setOverlay('spof', !overlays.spof)}
        />
        <OverlayToggle
          icon="share"
          label="Critical"
          active={overlays.criticalPath}
          onToggle={() => setOverlay('criticalPath', !overlays.criticalPath)}
        />
      </div>

      <SignalSummary report={report} />

      <HybridAiSection
        onArchitectReview={() =>
          sendHybridReview(
            'annotate_architecture',
            'Run a hybrid architecture review.',
            'Prefer set_notes and set_reliability patches for the highest-risk nodes. Only emit structural changes if the flaw cannot be addressed with annotation alone.',
          )
        }
        onAnnotateCanvas={() =>
          sendHybridReview(
            'annotate_architecture',
            'Annotate the canvas with architect notes.',
            'Emit concrete set_notes patches for the nodes that need design rationale, CAP tradeoffs, operational risks, and recommended patterns.',
          )
        }
        onRefactorProposal={() =>
          sendHybridReview(
            'refactor_graph',
            'Propose a hybrid refactor from the current analysis.',
            'If the graph shows structural problems, emit a complete refactor patch with bounded contexts, ownership, reliability notes, and concrete topology changes.',
          )
        }
      />

      <div className="flex-1 overflow-auto border-t border-border">
        <FindingsList findings={report.findings} />
      </div>
    </div>
  );
}

function HybridAiSection({
  onArchitectReview,
  onAnnotateCanvas,
  onRefactorProposal,
}: {
  onArchitectReview: () => void;
  onAnnotateCanvas: () => void;
  onRefactorProposal: () => void;
}) {
  return (
    <div className="border-t border-border bg-panel px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon name="sparkles" size={11} color="var(--accent)" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          Hybrid Review
        </span>
      </div>
      <div className="mb-2 text-[10.5px] leading-relaxed text-text-dim">
        Static graph checks stay deterministic; AI adds architect judgment,
        CAP tradeoffs, design patterns, and patch proposals.
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <button
          onClick={onArchitectReview}
          className="flex items-center justify-center gap-1 rounded-md border border-border bg-input px-2.5 py-1.5 text-[10.5px] text-text hover:bg-hover"
        >
          <Icon name="metrics" size={10} stroke={1.6} />
          <span>AI Architect Review</span>
        </button>
        <button
          onClick={onAnnotateCanvas}
          className="flex items-center justify-center gap-1 rounded-md border border-border bg-input px-2.5 py-1.5 text-[10.5px] text-text hover:bg-hover"
        >
          <Icon name="sparkles" size={10} stroke={1.6} />
          <span>Write Notes to Canvas</span>
        </button>
        <button
          onClick={onRefactorProposal}
          className="flex items-center justify-center gap-1 rounded-md border border-border bg-input px-2.5 py-1.5 text-[10.5px] text-text hover:bg-hover"
        >
          <Icon name="share" size={10} stroke={1.6} />
          <span>Propose Refactor</span>
        </button>
      </div>
    </div>
  );
}

function OverlayToggle({
  icon,
  label,
  active,
  onToggle,
}: {
  icon: string;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex h-7 items-center justify-center gap-1 rounded-md border text-[10.5px] transition-colors',
        active
          ? 'border-accent bg-[var(--accent-soft)] text-text'
          : 'border-border bg-input text-text-dim hover:bg-hover hover:text-text',
      )}
      aria-pressed={active}
    >
      <Icon name={icon} size={10} stroke={1.6} />
      <span>{label}</span>
    </button>
  );
}

function SignalSummary({ report }: { report: AnalysisReport }) {
  const { spof, bottlenecks, criticalPaths, readWrite } = report;
  const top = bottlenecks[0];
  const longest = criticalPaths[0];
  return (
    <div className="space-y-1 border-t border-border bg-input/40 px-3 py-2 text-[10.5px] text-text-dim">
      <div>
        <span className="text-text">SPOFs:</span>{' '}
        {spof.articulationPoints.length} node ·{' '}
        {spof.bridges.length} edge bridges
      </div>
      <div>
        <span className="text-text">Top bottleneck:</span>{' '}
        {top ? `${top.nodeId} (score ${top.score.toFixed(2)})` : '—'}
      </div>
      <div>
        <span className="text-text">Longest path:</span>{' '}
        {longest
          ? `${longest.path.length} hops · ~${longest.totalLatencyMs}ms p99`
          : '—'}
      </div>
      <div>
        <span className="text-text">Hot reads:</span>{' '}
        {readWrite.hot.length} · uncached: {readWrite.uncached.length} ·
        async-writes: {readWrite.asyncWrites.length}
      </div>
    </div>
  );
}
