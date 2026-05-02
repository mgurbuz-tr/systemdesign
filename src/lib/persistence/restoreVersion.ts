import { toast } from 'sonner';
import { useCanvas } from '@/lib/store/canvasStore';
import { getVersion } from '@/lib/persistence/versions';
import { getRecorder } from '@/lib/persistence/versionRecorder';
import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';

const deepClone = <T>(v: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);

/**
 * Loads a version row into the canvas. Before overwriting, records the live
 * state as a `pre-restore` row so the user can jump back in one click. The
 * canvas swap uses `applyAtomic`, which means restoring is itself a single
 * undo step (Cmd+Z reverts the restore).
 */
export async function restoreVersion(versionId: number): Promise<boolean> {
  const row = await getVersion(versionId);
  if (!row) {
    toast.error('Version not found.');
    return false;
  }

  const recorder = getRecorder();
  if (recorder) {
    try {
      await recorder.recordAuto(
        'pre-restore',
        'State before restore',
        `Restoring version from ${formatRelativeTime(row.createdAt)}`,
      );
    } catch (err) {
      // If the safety snapshot fails, abort — data-loss risk otherwise.
      console.error('pre-restore snapshot failed', err);
      toast.error('Failed to record safety snapshot, restore cancelled.');
      return false;
    }
  }

  const nodes = deepClone(row.nodes) as Node<NodeData>[];
  const edges = deepClone(row.edges) as Edge<EdgeData>[];
  useCanvas.getState().applyAtomic({ nodes, edges });
  useCanvas.setState({ selectedNodeId: null, selectedEdgeId: null });

  toast.success(`Restored • ${formatRelativeTime(row.createdAt)}`);
  return true;
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
