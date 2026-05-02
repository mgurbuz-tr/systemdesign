import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type XYPosition,
} from '@xyflow/react';
import type { CatalogItem, EdgeData, NodeData, Protocol } from '@/types';
import { uid } from '@/lib/utils';

type SDNode = Node<NodeData>;
type SDEdge = Edge<EdgeData>;

interface CanvasState {
  nodes: SDNode[];
  edges: SDEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  setNodes: (n: SDNode[]) => void;
  setEdges: (e: SDEdge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;

  addNodeFromCatalog: (item: CatalogItem, position: XYPosition) => SDNode;
  addGroup: (
    label: string,
    position: XYPosition,
    size?: { width: number; height: number },
  ) => SDNode;
  addComment: (text: string, position: XYPosition) => SDNode;
  updateNode: (id: string, patch: Partial<NodeData>) => void;
  toggleNodeLock: (id: string) => void;
  toggleNodeHidden: (id: string) => void;
  removeNode: (id: string) => void;

  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;

  updateEdge: (id: string, patch: Partial<EdgeData>) => void;
  removeEdge: (id: string) => void;

  /**
   * Atomic state replacement used by AI patches and revert. Both nodes and
   * edges are set in a single setState so zundo's handleSet coalesces them
   * into ONE history entry — Cmd+Z reverts the whole AI change at once.
   */
  applyAtomic: (next: { nodes: SDNode[]; edges: SDEdge[] }) => void;
}

const ASYNC_PROTOCOLS: Protocol[] = ['kafka', 'amqp', 'mqtt', 'websocket'];

function defaultProtocolFor(item: CatalogItem): Protocol {
  if (item.supportedProtocols && item.supportedProtocols.length > 0) {
    return item.supportedProtocols[0]!;
  }
  switch (item.tone) {
    case 'data':
      return 'sql';
    case 'cache':
      return 'redis';
    case 'queue':
      return 'kafka';
    case 'service':
      return 'rest';
    default:
      return 'rest';
  }
}

export const useCanvas = create<CanvasState>()(
  temporal(
    (set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) as SDNode[] }),
  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) as SDEdge[] }),

  onConnect: (params) => {
    const sourceNode = get().nodes.find((n) => n.id === params.source);
    const targetNode = get().nodes.find((n) => n.id === params.target);
    const protocol: Protocol =
      sourceNode?.data.tone === 'queue' || targetNode?.data.tone === 'queue'
        ? 'kafka'
        : sourceNode?.data.tone === 'data' || targetNode?.data.tone === 'data'
          ? 'sql'
          : sourceNode?.data.tone === 'cache' || targetNode?.data.tone === 'cache'
            ? 'redis'
            : 'rest';
    const data: EdgeData = {
      protocol,
      async: ASYNC_PROTOCOLS.includes(protocol),
    };
    set({
      edges: addEdge(
        {
          ...params,
          id: uid('edge'),
          type: 'protocol',
          data,
        },
        get().edges,
      ) as SDEdge[],
    });
  },

  addNodeFromCatalog: (item, position) => {
    const id = uid(item.type);
    const protocol = defaultProtocolFor(item);
    const caps = new Set(item.capabilities ?? []);
    const node: SDNode = {
      id,
      type: 'sd', // single custom node renderer routes by data.tone
      position,
      data: {
        type: item.type,
        category: item.category,
        tone: item.tone,
        label: item.label,
        meta: item.description,
        config: { ...(item.defaultConfig ?? {}) },
        ...(caps.has('schema') ? { schema: { tables: [] } } : {}),
        ...(caps.has('api')
          ? { api: { protocols: [{ kind: protocol, endpoints: [] }] } }
          : {}),
        ...(caps.has('consuming')
          ? { consuming: { handler: '', concurrency: 1 } }
          : {}),
        ...(caps.has('scheduled') ? { scheduled: { schedule: '' } } : {}),
        ...(caps.has('producing') ? { producing: { events: [] } } : {}),
        ...(item.hasMockupEditor ? { mockup: { screens: [] } } : {}),
      },
    };
    set({ nodes: [...get().nodes, node] });
    return node;
  },

  addGroup: (label, position, size) => {
    const id = uid('group');
    const node = {
      id,
      type: 'group',
      position,
      style: { width: size?.width ?? 480, height: size?.height ?? 200 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { label, tone: 'edge' } as any,
    } as SDNode;
    // Groups must be earlier in the array so they render *behind* their
    // children — xyflow draws nodes in array order.
    set({ nodes: [node, ...get().nodes] });
    return node;
  },

  addComment: (text, position) => {
    const id = uid('cmt');
    const node = {
      id,
      type: 'comment',
      position,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { text, resolved: false } as any,
    } as SDNode;
    set({ nodes: [...get().nodes, node] });
    return node;
  },

  updateNode: (id, patch) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    }),

  toggleNodeLock: (id) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, locked: !(n.data as NodeData).locked } }
          : n,
      ),
    }),

  toggleNodeHidden: (id) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, hidden: !(n.data as NodeData).hidden } }
          : n,
      ),
    }),

  removeNode: (id) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    }),

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  updateEdge: (id, patch) =>
    set({
      edges: get().edges.map((e) =>
        e.id === id
          ? {
              ...e,
              data: { ...(e.data as EdgeData), ...patch },
            }
          : e,
      ),
    }),

  removeEdge: (id) =>
    set({
      edges: get().edges.filter((e) => e.id !== id),
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
    }),

  applyAtomic: ({ nodes, edges }) => set({ nodes, edges }),
    }),
    {
      // Only nodes/edges flow into undo history — selection isn't worth tracking.
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
      limit: 80,
      // Coalesce drag-storms into a single undo step (250ms quiescence).
      handleSet: (handleSet) => {
        let timer: number | null = null;
        return (pastState) => {
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(() => handleSet(pastState), 250);
        };
      },
    },
  ),
);
