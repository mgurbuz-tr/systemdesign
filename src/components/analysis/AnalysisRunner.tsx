import { useEffect, useRef } from 'react';
import { useCanvas } from '@/lib/store/canvasStore';
import { useAnalysis } from '@/lib/store/analysisStore';
import { runAllAnalyses } from '@/lib/analysis';

/**
 * Invisible component mounted at the App root. Watches the canvas store for
 * mutations, debounces by 200ms, then publishes a fresh AnalysisReport into
 * `useAnalysis`. Keeping this outside the Sidebar lets the canvas overlays
 * (SPOF rings, heat-map, critical path) update even when the Analysis tab
 * isn't currently visible.
 */
export function AnalysisRunner() {
  const setReport = useAnalysis((s) => s.setReport);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const run = () => {
      const { nodes, edges } = useCanvas.getState();
      setReport(runAllAnalyses(nodes, edges));
    };
    // Initial run.
    run();
    const unsub = useCanvas.subscribe(() => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(run, 200);
    });
    return () => {
      unsub();
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [setReport]);

  return null;
}
