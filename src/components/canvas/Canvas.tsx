import { useCallback, useMemo, useRef, type DragEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SDNode } from './nodes/SDNode';
import { GroupNode } from './nodes/GroupNode';
import { CommentNode } from './nodes/CommentNode';
import { ProtocolEdge } from './edges/ProtocolEdge';
import { CanvasToolbar } from './Toolbar';
import { useCanvas } from '@/lib/store/canvasStore';
import { useSettings } from '@/lib/store/settingsStore';
import { findCatalogItem } from '@/lib/catalog';
import { DRAG_MIME } from '@/components/library/Sidebar';
import type { NodeData, EdgeData } from '@/types';

const NODE_TYPES = { sd: SDNode, group: GroupNode, comment: CommentNode };
const EDGE_TYPES = { protocol: ProtocolEdge };

/**
 * xyflow renders parents before children based on array order. After
 * mutating parentId we re-sort: groups (and any node with a parent) earlier
 * than their dependents, but stable for the rest.
 */
function reorderForParents(nodes: Node<NodeData>[]): Node<NodeData>[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const placed = new Set<string>();
  const out: Node<NodeData>[] = [];
  const visit = (n: Node<NodeData>) => {
    if (placed.has(n.id)) return;
    if (n.parentId && byId.has(n.parentId) && !placed.has(n.parentId)) {
      visit(byId.get(n.parentId)!);
    }
    out.push(n);
    placed.add(n.id);
  };
  for (const n of nodes) visit(n);
  return out;
}

function CanvasInner() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getIntersectingNodes } = useReactFlow();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNodeFromCatalog,
    selectNode,
    selectEdge,
    setNodes,
  } = useCanvas();
  const showGrid = useSettings((s) => s.showGrid);
  const showMinimap = useSettings((s) => s.showMinimap);
  const setInspectorOpen = useSettings((s) => s.setInspectorOpen);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DRAG_MIME);
      if (!type) return;
      const item = findCatalogItem(type);
      if (!item) return;
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNodeFromCatalog(item, position);
    },
    [screenToFlowPosition, addNodeFromCatalog],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      selectNode(node.id);
      setInspectorOpen(true);
    },
    [selectNode, setInspectorOpen],
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_e, edge) => {
      selectEdge(edge.id);
      setInspectorOpen(true);
    },
    [selectEdge, setInspectorOpen],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  // Drop-on-group detection: when a non-group node finishes dragging, check
  // whether it intersects a group. Set parentId + convert to parent-relative
  // position; or clear parentId + convert to absolute position when leaving.
  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_e, dragged) => {
      if (dragged.type === 'group') return;

      const all = useCanvas.getState().nodes as Node<NodeData>[];
      const intersections = getIntersectingNodes(dragged).filter(
        (n) => n.type === 'group',
      );

      // Pick the smallest intersecting group (most specific container).
      const candidate =
        intersections.length === 0
          ? null
          : intersections.reduce((best, n) => {
              const aw = (n.measured?.width ?? 0) * (n.measured?.height ?? 0);
              const bw =
                (best.measured?.width ?? 0) * (best.measured?.height ?? 0);
              return aw && (aw < bw || bw === 0) ? n : best;
            });

      const newParentId = candidate?.id;
      const draggedNode = all.find((n) => n.id === dragged.id);
      if (!draggedNode) return;
      const oldParentId = draggedNode.parentId;
      if (newParentId === oldParentId) return;

      // Compute the dragged node's absolute position before we change parents.
      const oldParent = oldParentId ? all.find((n) => n.id === oldParentId) : null;
      const absX = (oldParent?.position.x ?? 0) + draggedNode.position.x;
      const absY = (oldParent?.position.y ?? 0) + draggedNode.position.y;

      const newParent = newParentId ? all.find((n) => n.id === newParentId) : null;
      const nextPosition = newParent
        ? { x: absX - newParent.position.x, y: absY - newParent.position.y }
        : { x: absX, y: absY };

      setNodes(
        // xyflow renders nodes in array order; parent must come before child.
        reorderForParents(
          all.map((n) =>
            n.id === dragged.id
              ? {
                  ...n,
                  parentId: newParentId,
                  extent: newParentId ? ('parent' as const) : undefined,
                  position: nextPosition,
                }
              : n,
          ),
        ),
      );
    },
    [getIntersectingNodes, setNodes],
  );

  const isEmpty = useMemo(() => nodes.length === 0, [nodes]);

  // Derive xyflow-level constraints from data.locked / data.hidden so the
  // store stays simple. Locked = not draggable, not deletable, not connectable.
  const displayNodes = useMemo(
    () =>
      (nodes as Node<NodeData>[]).map((n) => {
        const locked = !!n.data.locked;
        const hidden = !!n.data.hidden;
        // Stacking: groups (0) < edges (CSS:1) < nodes (10)
        // Comments stay slightly above nodes so they remain readable.
        const zIndex =
          n.type === 'group' ? 0 : n.type === 'comment' ? 12 : 10;
        return {
          ...n,
          draggable: !locked,
          deletable: !locked,
          connectable: !locked,
          hidden,
          zIndex,
        };
      }),
    [nodes],
  );

  return (
    <div
      ref={wrapperRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="h-full w-full"
      style={{ background: 'var(--canvas-bg)' }}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={edges as Edge<EdgeData>[]}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={{ type: 'protocol' }}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        {showGrid && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1.2}
            color="var(--grid-dot)"
          />
        )}
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--panel-shadow)',
          }}
        />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(0,0,0,0.04)"
            nodeColor={(n) => {
              const data = n.data as NodeData | undefined;
              const tone = data?.tone ?? 'service';
              return `var(--tone-${tone}-fg)`;
            }}
            style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          />
        )}
      </ReactFlow>

      <CanvasToolbar />

      {isEmpty && <EmptyState />}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 1 }}
    >
      <div className="text-center">
        <div
          className="mx-auto mb-3 grid h-14 w-14 grid-cols-3 grid-rows-3 gap-1 opacity-50"
          aria-hidden
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[2px]"
              style={{ background: 'var(--grid-dot)' }}
            />
          ))}
        </div>
        <div className="text-[13px] font-medium text-text">
          Boş canvas — başlamak için bir component sürükle
        </div>
        <div className="mt-1 text-[11px] text-text-dim">
          Soldaki kütüphaneden Postgres, Redis ya da Kafka deneyebilirsin
        </div>
      </div>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
