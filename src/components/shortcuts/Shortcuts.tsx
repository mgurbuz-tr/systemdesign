import { lazy, Suspense, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { useCanvas } from '@/lib/store/canvasStore';
import { useSettings } from '@/lib/store/settingsStore';
import { uid } from '@/lib/utils';

const HelpModal = lazy(() =>
  import('@/components/help/HelpModal').then((m) => ({ default: m.HelpModal })),
);

/**
 * Mounted once at App level. Handles canvas-wide keyboard shortcuts.
 * Editable controls (input/textarea/select) are excluded by default.
 */
export function Shortcuts() {
  const setAiOpen = useSettings((s) => s.setAiOpen);
  const aiOpen = useSettings((s) => s.aiOpen);
  const toggleTheme = useSettings((s) => s.toggleTheme);
  const [helpOpen, setHelpOpen] = useState(false);

  useHotkeys(
    'shift+/',
    (e) => {
      e.preventDefault();
      setHelpOpen(true);
    },
    { enableOnFormTags: false },
  );

  // Undo / Redo
  useHotkeys(
    'mod+z',
    (e) => {
      e.preventDefault();
      const t = useCanvas.temporal.getState();
      if (t.pastStates.length === 0) {
        toast('Nothing to undo', { duration: 1200 });
        return;
      }
      t.undo();
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    'mod+shift+z',
    (e) => {
      e.preventDefault();
      const t = useCanvas.temporal.getState();
      if (t.futureStates.length === 0) {
        toast('Nothing to redo', { duration: 1200 });
        return;
      }
      t.redo();
    },
    { enableOnFormTags: false },
  );

  // Delete selected node or edge
  useHotkeys(
    'delete, backspace',
    (e) => {
      const { selectedNodeId, selectedEdgeId, removeNode, removeEdge } =
        useCanvas.getState();
      if (selectedNodeId) {
        e.preventDefault();
        removeNode(selectedNodeId);
      } else if (selectedEdgeId) {
        e.preventDefault();
        removeEdge(selectedEdgeId);
      }
    },
    { enableOnFormTags: false },
  );

  // Duplicate selected node
  useHotkeys(
    'mod+d',
    (e) => {
      e.preventDefault();
      const { nodes, selectedNodeId } = useCanvas.getState();
      if (!selectedNodeId) return;
      const src = nodes.find((n) => n.id === selectedNodeId);
      if (!src) return;
      const copy = {
        ...src,
        id: uid(src.data.type),
        position: { x: src.position.x + 36, y: src.position.y + 36 },
        selected: false,
      };
      useCanvas.setState({
        nodes: [...nodes, copy],
        selectedNodeId: copy.id,
      });
    },
    { enableOnFormTags: false },
  );

  // Toggle AI panel
  useHotkeys(
    'mod+i',
    (e) => {
      e.preventDefault();
      setAiOpen(!aiOpen);
    },
    { enableOnFormTags: false },
  );

  // Lock/unlock selected node
  useHotkeys(
    'mod+l',
    (e) => {
      e.preventDefault();
      const id = useCanvas.getState().selectedNodeId;
      if (!id) {
        toast('Select a node first', { duration: 1200 });
        return;
      }
      useCanvas.getState().toggleNodeLock(id);
    },
    { enableOnFormTags: false },
  );

  // Toggle theme
  useHotkeys(
    'mod+shift+l',
    (e) => {
      e.preventDefault();
      toggleTheme();
    },
    { enableOnFormTags: false },
  );

  return (
    <Suspense fallback={null}>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Suspense>
  );
}
