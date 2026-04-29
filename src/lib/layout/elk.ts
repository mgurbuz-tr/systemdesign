import type { ElkNode } from 'elkjs/lib/elk-api';
import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';

// Lazy-load elkjs (1.5 MB bundle) only when the user actually clicks
// "Auto-layout" — keeps the initial bundle slim.
let elkPromise: Promise<{
  layout: (g: ElkNode) => Promise<ElkNode>;
}> | null = null;

async function getElk() {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then((mod) => {
      const ELK = (mod.default ?? mod) as unknown as new () => {
        layout: (g: ElkNode) => Promise<ElkNode>;
      };
      return new ELK();
    });
  }
  return elkPromise;
}

const ROOT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '70',
  'elk.spacing.nodeNode': '40',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.edgeRouting': 'ORTHOGONAL',
  // Critical for group-aware layout: ELK considers cross-hierarchy edges
  // when placing children inside parents.
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.crossingMinimization.semiInteractive': 'true',
};

const GROUP_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '50',
  'elk.spacing.nodeNode': '28',
  'elk.padding': '[top=44,left=24,bottom=20,right=24]',
};

const DEFAULT_NODE_W = 200;
const DEFAULT_NODE_H = 60;

/**
 * Layered auto-layout that respects logical groups via ELK's hierarchical
 * layout (`hierarchyHandling: INCLUDE_CHILDREN`).
 *
 * - Each canvas group becomes an ELK parent node.
 * - Each non-group node is assigned to a group based on whose bbox its
 *   centre is inside (uses *current* positions, before layout).
 * - Nodes that belong to no group become orphans at the root level.
 * - All edges live at root level — ELK routes them through hierarchy.
 *
 * After layout we translate ELK's parent-relative coordinates back to
 * xyflow's flat absolute positions and resize each group to its
 * computed bbox.
 */
export async function autoLayout(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  direction: 'DOWN' | 'RIGHT' = 'DOWN',
): Promise<Node<NodeData>[]> {
  if (nodes.length === 0) return nodes;

  const groups = nodes.filter((n) => n.type === 'group');
  const others = nodes.filter((n) => n.type !== 'group');

  // 1. Detect group membership.
  // Prefer xyflow-native `parentId` (set when user drops a node onto a group);
  // fall back to centre-in-bbox for legacy nodes/templates without parentId.
  const groupIds = new Set(groups.map((g) => g.id));
  const groupOf = new Map<string, string>();
  for (const n of others) {
    if (n.parentId && groupIds.has(n.parentId)) {
      groupOf.set(n.id, n.parentId);
      continue;
    }
    for (const g of groups) {
      const gw = (g.style?.width as number | undefined) ?? 480;
      const gh = (g.style?.height as number | undefined) ?? 200;
      const cx = n.position.x + DEFAULT_NODE_W / 2;
      const cy = n.position.y + DEFAULT_NODE_H / 2;
      if (
        cx >= g.position.x &&
        cx <= g.position.x + gw &&
        cy >= g.position.y &&
        cy <= g.position.y + gh
      ) {
        groupOf.set(n.id, g.id);
        break;
      }
    }
  }

  const childrenByGroup = new Map<string, Node<NodeData>[]>();
  for (const g of groups) childrenByGroup.set(g.id, []);
  const orphans: Node<NodeData>[] = [];
  for (const n of others) {
    const gid = groupOf.get(n.id);
    if (gid) childrenByGroup.get(gid)!.push(n);
    else orphans.push(n);
  }

  // 2. Build the hierarchical ELK graph.
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: { ...ROOT_OPTIONS, 'elk.direction': direction },
    children: [
      ...groups.map((g) => ({
        id: g.id,
        layoutOptions: { ...GROUP_OPTIONS, 'elk.direction': direction },
        children: (childrenByGroup.get(g.id) ?? []).map((n) => ({
          id: n.id,
          width: DEFAULT_NODE_W,
          height: DEFAULT_NODE_H,
        })),
      })),
      ...orphans.map((n) => ({
        id: n.id,
        width: DEFAULT_NODE_W,
        height: DEFAULT_NODE_H,
      })),
    ],
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const elk = await getElk();
  const out = await elk.layout(elkGraph);

  // 3. Extract positions.
  // Top-level (group / orphan) → absolute. Child of a group → relative to
  // its parent (xyflow's parentId stores parent-relative positions).
  const groupBox = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  // Map<nodeId, { pos, parentId? }> — parentId tells the consumer below
  // whether to write parentId+extent or to clear them.
  const nodePos = new Map<
    string,
    { x: number; y: number; parentId?: string }
  >();

  for (const child of out.children ?? []) {
    if (typeof child.x !== 'number' || typeof child.y !== 'number') continue;
    const isGroup = !!child.children && child.children.length > 0;
    if (isGroup) {
      groupBox.set(child.id, {
        x: child.x,
        y: child.y,
        width: child.width ?? 480,
        height: child.height ?? 200,
      });
      for (const grand of child.children ?? []) {
        if (typeof grand.x === 'number' && typeof grand.y === 'number') {
          nodePos.set(grand.id, {
            x: grand.x,
            y: grand.y,
            parentId: child.id,
          });
        }
      }
    } else {
      nodePos.set(child.id, { x: child.x, y: child.y });
    }
  }

  // 4. Empty groups stay where they are but get parked below the others
  // so they don't collide with the laid-out graph.
  const allBottom = Array.from(nodePos.values()).reduce(
    (m, p) => Math.max(m, p.y + DEFAULT_NODE_H),
    0,
  );
  let parkedY = allBottom + 60;

  const newGroups = groups.map((g) => {
    const box = groupBox.get(g.id);
    if (box) {
      return {
        ...g,
        position: { x: box.x, y: box.y },
        style: {
          ...(g.style ?? {}),
          width: box.width,
          height: box.height,
        },
      };
    }
    // Empty group → park below.
    const parked = { ...g, position: { x: 30, y: parkedY } };
    parkedY += ((g.style?.height as number | undefined) ?? 160) + 30;
    return parked;
  });

  const newOthers = others.map((n) => {
    const p = nodePos.get(n.id);
    if (!p) return n;
    if (p.parentId) {
      return {
        ...n,
        position: { x: p.x, y: p.y },
        parentId: p.parentId,
        extent: 'parent' as const,
      };
    }
    // Orphan: ensure stale parentId / extent are cleared.
    const { parentId: _pid, extent: _ext, ...rest } = n;
    void _pid;
    void _ext;
    return { ...rest, position: { x: p.x, y: p.y } };
  });

  // Groups must come first so they render behind their children.
  return [...newGroups, ...newOthers];
}
