import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/Icon';
import { useCanvas } from '@/lib/store/canvasStore';
import { useProject } from '@/lib/store/projectStore';
import {
  listVersions,
  deleteVersion,
  MAX_VERSIONS_PER_PROJECT,
} from '@/lib/persistence/versions';
import { restoreVersion, formatRelativeTime } from '@/lib/persistence/restoreVersion';
import { getRecorder } from '@/lib/persistence/versionRecorder';
import type { VersionRow, VersionTrigger } from '@/lib/db/database';
import { cn } from '@/lib/utils';

const TRIGGER_LABEL: Record<VersionTrigger, string> = {
  'ai-patch': 'AI',
  manual: 'Manual',
  'auto-layout': 'Layout',
  idle: 'Auto',
  'pre-restore': 'Restore',
};

const TRIGGER_ICON: Record<VersionTrigger, string> = {
  'ai-patch': 'sparkles',
  manual: 'check',
  'auto-layout': 'graph',
  idle: 'history',
  'pre-restore': 'history',
};

/**
 * Version history view embedded into the Sidebar's "Changelog" tab. The list
 * mirrors Photoshop's history palette: clicking a row restores instantly (no
 * confirm), the entry whose content matches the live canvas is the "current"
 * row and its restore button is disabled. Restoring records a pre-restore
 * snapshot so the previous live state remains reachable until the user makes
 * a new edit.
 */
export function VersionHistoryPanel() {
  const project = useProject((s) => s.current);
  const canvasNodes = useCanvas((s) => s.nodes);
  const canvasEdges = useCanvas((s) => s.edges);

  const [rows, setRows] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const reloadRef = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    if (!project) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listVersions(project.id);
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [project]);

  reloadRef.current = reload;

  useEffect(() => {
    void reload();
  }, [reload]);

  // Reload shortly after the canvas mutates so newly-recorded rows appear
  // without a manual refresh.
  useEffect(() => {
    const t = window.setTimeout(() => reloadRef.current?.(), 600);
    return () => window.clearTimeout(t);
  }, [canvasNodes, canvasEdges]);

  // Live canvas fingerprint — used to mark the row whose content matches the
  // current state as "current" (and disable its restore button). This is what
  // lets the user jump back to the most recent version after restoring an
  // older one: the pre-restore row's content differs from the now-restored
  // canvas, so its restore button is active.
  const currentFingerprint = useMemo(
    () => fingerprintFor(canvasNodes, canvasEdges),
    [canvasNodes, canvasEdges],
  );

  const onSaveNow = async () => {
    const rec = getRecorder();
    if (!rec) {
      toast.error('Open a project first.');
      return;
    }
    await rec.recordManual('Manual save');
    toast.success('Version saved');
    void reload();
  };

  const onRestore = async (id: number) => {
    const ok = await restoreVersion(id);
    if (ok) void reload();
  };

  const onDelete = async (id: number) => {
    await deleteVersion(id);
    void reload();
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
            Version history
          </span>
          <span className="text-[9.5px] text-text-dim">
            {rows.length}/{MAX_VERSIONS_PER_PROJECT}
          </span>
        </div>
        <button
          onClick={() => void reload()}
          title="Refresh"
          className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-text"
          aria-label="Refresh"
        >
          <Icon name="history" size={11} stroke={1.6} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={onSaveNow}
          className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-input text-[11px] text-text hover:bg-hover"
        >
          <Icon name="check" size={11} stroke={1.6} />
          Save current state
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11.5px] text-text-dim">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11.5px] text-text-dim">
            No saved versions yet. Your first change will appear here.
          </div>
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => {
              const isCurrent =
                fingerprintFor(row.nodes, row.edges) === currentFingerprint;
              return (
                <li
                  key={row.id}
                  className={cn(
                    'group relative border-b border-border/60 px-3 py-2 hover:bg-hover/60',
                    isCurrent && 'bg-accent-soft',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-[2px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-border bg-input text-text-dim">
                      <Icon name={TRIGGER_ICON[row.trigger]} size={11} stroke={1.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[11.5px] font-medium text-text">
                          {row.label}
                        </span>
                        {isCurrent && (
                          <span className="rounded-sm bg-accent-soft px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-text">
                            Now
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-dim">
                        <span>{TRIGGER_LABEL[row.trigger]}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(row.createdAt)}</span>
                        {typeof row.bytes === 'number' && (
                          <>
                            <span>·</span>
                            <span>{formatBytes(row.bytes)}</span>
                          </>
                        )}
                      </div>
                      {row.summary && row.summary !== row.label && (
                        <div className="mt-1 truncate text-[10.5px] text-text-dim">
                          {row.summary}
                        </div>
                      )}

                      <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          disabled={isCurrent}
                          onClick={() => row.id != null && onRestore(row.id)}
                          className={cn(
                            'rounded-sm border border-border px-2 py-0.5 text-[10px] text-text hover:bg-hover',
                            isCurrent && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                          )}
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => row.id != null && onDelete(row.id)}
                          className="rounded-sm px-2 py-0.5 text-[10px] text-text-dim hover:bg-hover hover:text-text"
                          aria-label="Delete"
                          title="Delete this version"
                        >
                          <Icon name="trash" size={11} stroke={1.6} />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-3 py-1.5 text-[9.5px] text-text-dim">
        Cmd+Z still provides 80-step undo within the session.
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Full-content fingerprint. Cheaper alternatives that compare lengths or
 * counts miss equal-length mutations like a `100` → `200` position change,
 * so the recorder and the "is current" badge would disagree about whether
 * the canvas state actually moved. Stringifying the entire canvas is fine
 * here — even 200 nodes is a few KB and string comparison is microseconds.
 */
function fingerprintFor(
  nodes: VersionRow['nodes'],
  edges: VersionRow['edges'],
): string {
  try {
    return JSON.stringify({ n: nodes, e: edges });
  } catch {
    return `${nodes.length}:${edges.length}`;
  }
}
