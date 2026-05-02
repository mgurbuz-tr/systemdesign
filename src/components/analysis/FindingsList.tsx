import { Icon } from '@/components/ui/Icon';
import { useCanvas } from '@/lib/store/canvasStore';
import type { Issue } from '@/lib/ai/issues';
import { cn } from '@/lib/utils';

const SEVERITY_DOT: Record<Issue['severity'], string> = {
  high: '#c96442',
  med: '#c8a74a',
  low: '#7c9c5e',
};

const SEVERITY_LABEL: Record<Issue['severity'], string> = {
  high: 'High',
  med: 'Med',
  low: 'Low',
};

/**
 * Severity-grouped findings. Clicking a finding with an anchor focuses the
 * canvas on it (selection + fitView) so the user lands on the offending
 * node/edge instead of hunting for it.
 */
export function FindingsList({ findings }: { findings: Issue[] }) {
  // Sidebar lives outside the ReactFlow provider, so we can't use
  // `useReactFlow` here. Instead we dispatch a focus event that Canvas
  // listens for (Canvas has the viewport handle).
  const onClick = (anchor: Issue['anchor']) => {
    if (!anchor) return;
    if (anchor.kind === 'node') {
      useCanvas.getState().selectNode(anchor.id);
    } else {
      useCanvas.getState().selectEdge(anchor.id);
    }
    window.dispatchEvent(
      new CustomEvent('sd:focus-anchor', { detail: anchor }),
    );
  };

  if (findings.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-text-dim">
        No findings — nothing structural is screaming yet.
      </div>
    );
  }

  // Group by severity
  const groups: Array<[Issue['severity'], Issue[]]> = (
    ['high', 'med', 'low'] as const
  )
    .map((sev): [Issue['severity'], Issue[]] => [
      sev,
      findings.filter((f) => f.severity === sev),
    ])
    .filter(([, list]) => list.length > 0);

  return (
    <ul className="flex flex-col">
      {groups.map(([sev, list]) => (
        <li key={sev}>
          <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border/60 bg-panel px-3 py-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: SEVERITY_DOT[sev] }}
            />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
              {SEVERITY_LABEL[sev]} — {list.length}
            </span>
          </div>
          <ul>
            {list.map((f, i) => (
              <li
                key={`${f.code}-${i}`}
                onClick={() => onClick(f.anchor)}
                className={cn(
                  'flex items-start gap-2 border-b border-border/40 px-3 py-1.5 hover:bg-hover/60',
                  f.anchor && 'cursor-pointer',
                )}
              >
                <span
                  className="mt-[3px] inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: SEVERITY_DOT[sev] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-text">{f.message}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] text-text-dim">
                    <span>{f.code}</span>
                    {f.anchor && (
                      <>
                        <span>·</span>
                        <Icon name="search" size={9} />
                        <span>{f.anchor.kind}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

