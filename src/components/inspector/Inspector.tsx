import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Node } from '@xyflow/react';
import { Icon } from '@/components/ui/Icon';
import { useCanvas } from '@/lib/store/canvasStore';
import { useSettings } from '@/lib/store/settingsStore';
import { useAiUi } from '@/lib/store/aiUiStore';
import { askAiAboutNode, askAiForCapability } from '@/lib/ai/askAi';
import { findCatalogItem } from '@/lib/catalog';
import {
  capabilityRegistry,
  type CapabilityId,
  type MergeStrategy,
  type NodeCapability,
} from '@/lib/capabilities';
import { DbSchemaEditor } from './DbSchemaEditor';
import { ApiEndpointEditor } from './ApiEndpointEditor';
import { ConsumingEditor } from './ConsumingEditor';
import { ScheduledEditor } from './ScheduledEditor';
import { ProducingEditor } from './ProducingEditor';
import { ReliabilityEditor } from './ReliabilityEditor';
import { EdgeProtocolEditor } from './EdgeProtocolEditor';
import { MockupEditor } from './MockupEditor';
import { QuickStats } from './QuickStats';
import type {
  ConsumingSpec,
  EdgeData,
  MockupSpec,
  NodeData,
  ProducingSpec,
  ReliabilitySpec,
  ScheduledSpec,
  Tone,
} from '@/types';
import { findSpofs } from '@/lib/analysis';
import { cn } from '@/lib/utils';

/** Statik tab'lar — capability'sizler. */
type StaticTabKey = 'basic' | 'mockup';
type TabKey = StaticTabKey | CapabilityId;

export function Inspector() {
  const { inspectorOpen, setInspectorOpen } = useSettings();
  const {
    selectedNodeId,
    selectedEdgeId,
    nodes,
    edges,
    updateNode,
    updateEdge,
    removeNode,
    removeEdge,
  } = useCanvas();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const isOpen = inspectorOpen && (selectedNode || selectedEdge);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 360, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex flex-col overflow-hidden border-l border-border bg-panel"
          style={{ flexShrink: 0 }}
        >
          {selectedNode ? (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              nodes={nodes}
              onPatch={(patch) => updateNode(selectedNode.id, patch)}
              onAskAi={() =>
                askAiAboutNode(selectedNode.data.label, selectedNode.data.type)
              }
              onLock={() =>
                useCanvas.getState().toggleNodeLock(selectedNode.id)
              }
              onHide={() =>
                useCanvas.getState().toggleNodeHidden(selectedNode.id)
              }
              onClose={() => setInspectorOpen(false)}
              onDelete={() => removeNode(selectedNode.id)}
            />
          ) : selectedEdge ? (
            <EdgeInspector
              key={selectedEdge.id}
              data={(selectedEdge.data as EdgeData | undefined) ?? { protocol: 'rest' }}
              onChange={(d) => updateEdge(selectedEdge.id, d)}
              onClose={() => setInspectorOpen(false)}
              onDelete={() => removeEdge(selectedEdge.id)}
            />
          ) : null}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function NodeInspector({
  node,
  nodes,
  onPatch,
  onAskAi,
  onLock,
  onHide,
  onClose,
  onDelete,
}: {
  node: Node<NodeData>;
  nodes: Node<NodeData>[];
  onPatch: (patch: Partial<NodeData>) => void;
  onAskAi: () => void;
  onLock: () => void;
  onHide: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const catalog = findCatalogItem(node.data.type);
  // Capabilities order'a göre sıralı; statik tab'lar arasına serpiştirilir.
  const caps = useMemo(
    () => capabilityRegistry.forNode(node.data),
    [node.data],
  );

  const tabs = useMemo<{ key: TabKey; label: string }[]>(() => {
    const arr: { key: TabKey; label: string }[] = [
      { key: 'basic', label: 'Basic' },
    ];
    for (const c of caps) arr.push({ key: c.id, label: c.label });
    if (catalog?.hasMockupEditor) arr.push({ key: 'mockup', label: 'Screens' });
    return arr;
  }, [caps, catalog]);

  // İlk anlamlı capability açık başlasın; yoksa basic.
  const defaultTab: TabKey = caps[0]?.id ?? (catalog?.hasMockupEditor ? 'mockup' : 'basic');
  const [active, setActive] = useState<TabKey>(defaultTab);

  // When an AI patch (set_<cap>) lands on this node, jump to the matching
  // capability tab so the user immediately sees what changed instead of
  // wondering whether the patch did anything.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ nodeId: string; capabilityId: CapabilityId }>;
      if (!ce.detail) return;
      if (ce.detail.nodeId !== node.id) return;
      // Only switch if the tab is one this node actually exposes.
      if (caps.some((c) => c.id === ce.detail.capabilityId)) {
        setActive(ce.detail.capabilityId);
      }
    };
    window.addEventListener('sd:capability-applied', handler as EventListener);
    return () =>
      window.removeEventListener(
        'sd:capability-applied',
        handler as EventListener,
      );
  }, [node.id, caps]);

  // Mockup editor için "elsewhere defined endpoint" suggestions.
  const apiSuggestions = useMemo(() => {
    const arr: string[] = [];
    for (const n of nodes) {
      if (!n.data.api) continue;
      for (const block of n.data.api.protocols) {
        for (const ep of block.endpoints) {
          if (block.kind === 'rest' && ep.method && ep.path) {
            arr.push(`${n.data.label}: ${ep.method} ${ep.path}`);
          } else if (ep.name) {
            arr.push(`${n.data.label}: ${block.kind}/${ep.name}`);
          }
        }
      }
    }
    return arr;
  }, [nodes]);

  const activeCap = caps.find((c) => c.id === active);

  return (
    <>
      <Header
        tone={node.data.tone}
        title={node.data.label}
        subtitle={node.data.type}
        onClose={onClose}
        onDelete={onDelete}
        deleteLabel="Delete node"
        locked={!!node.data.locked}
        onLock={onLock}
        hidden={!!node.data.hidden}
        onHide={onHide}
        onAskAi={onAskAi}
      />

      <div className="-mb-px flex gap-0.5 overflow-x-auto border-b border-border px-3.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              'relative px-2 pb-1.5 pt-0.5 text-[11px] font-medium whitespace-nowrap',
              active === t.key ? 'text-text' : 'text-text-dim hover:text-text',
            )}
          >
            {t.label}
            {active === t.key && (
              <motion.span
                layoutId="inspector-tab-indicator"
                className="absolute bottom-[-1px] left-0 right-0 h-[1.5px]"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* AI fill bar — capability tab'larında görünür */}
      {activeCap && (
        <CapabilityAiBar
          capability={activeCap}
          nodeId={node.id}
          nodeLabel={node.data.label}
        />
      )}

      {/* Patch-pending lock — AI bekleyen bir öneri varsa manuel edit kapalı.
          Yoksa kullanıcının bir kolonu ekleyip AI Apply'a basması arasında
          AI'ın snapshot'ı kullanıcı edit'ini eziyordu. */}
      <PatchPendingBanner activeCap={activeCap} />

      <div className="flex-1 overflow-auto p-3.5">
        {active === 'basic' && (
          <div className="space-y-5">
            <NodeBasics
              label={node.data.label}
              meta={node.data.meta}
              onLabel={(label) => onPatch({ label })}
              onMeta={(meta) => onPatch({ meta })}
            />
            <QuickStats node={node} nodes={nodes} edges={useCanvas.getState().edges} />
          </div>
        )}

        {activeCap && (
          <CapabilityTabContent
            cap={activeCap}
            node={node}
            nodes={nodes}
            onPatch={onPatch}
          />
        )}

        {active === 'mockup' && catalog?.hasMockupEditor && (
          <MockupEditor
            mockup={node.data.mockup ?? { screens: [] }}
            apiSuggestions={apiSuggestions}
            onChange={(mockup: MockupSpec) => onPatch({ mockup })}
          />
        )}

      </div>
    </>
  );
}

/**
 * Capability tab'ında AI fill butonları + mode seçici. Default mode
 * capability.mergeStrategy'den gelir, kullanıcı override edebilir.
 */
function CapabilityAiBar({
  capability,
  nodeId,
  nodeLabel,
}: {
  capability: NodeCapability;
  nodeId: string;
  nodeLabel: string;
}) {
  const fire = (mode: MergeStrategy) =>
    askAiForCapability({
      nodeId,
      nodeLabel,
      capabilityId: capability.id,
      capabilityLabel: capability.label,
      mode,
    });

  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-input/30 px-3 py-1.5">
      <Icon name="sparkles" size={11} color="var(--accent)" />
      <span className="text-[10.5px] text-text-dim">Suggest with AI</span>
      <button
        onClick={() => fire('augment')}
        title="Keep existing fields, append new ones"
        className="ml-auto rounded-full border border-border bg-input px-2 py-0.5 text-[10px] text-text hover:bg-hover"
      >
        Fill missing
      </button>
      <button
        onClick={() => fire('replace')}
        title="Rewrite the whole field from scratch"
        className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
        style={{ background: 'var(--accent)' }}
      >
        Suggest from scratch
      </button>
    </div>
  );
}

function PatchPendingBanner({ activeCap }: { activeCap?: NodeCapability }) {
  const pending = useAiUi((s) => s.pendingPatchCount);
  if (pending === 0 || !activeCap) return null;
  return (
    <div className="border-b border-border bg-[#fff8e6] px-3 py-2 text-[10.5px] text-[#a8773d]">
      <div className="flex items-center gap-1.5">
        <Icon name="sparkles" size={11} />
        <span className="font-semibold">
          Awaiting AI suggestion ({pending} patch)
        </span>
      </div>
      <div className="mt-0.5 text-text-dim">
        Manual edits are locked — Apply / Discard the patch, then continue
        editing.
      </div>
    </div>
  );
}

/** Aktif capability tab'ının editor'ünü routing yapan switch component. */
function CapabilityTabContent({
  cap,
  node,
  nodes,
  onPatch,
}: {
  cap: NodeCapability;
  node: Node<NodeData>;
  nodes: Node<NodeData>[];
  onPatch: (patch: Partial<NodeData>) => void;
}) {
  const pending = useAiUi((s) => s.pendingPatchCount);
  const disabled = pending > 0;
  const wrapperClass = disabled
    ? 'pointer-events-none select-none opacity-50'
    : '';
  const wrap = (children: React.ReactNode) => (
    <div className={wrapperClass} aria-disabled={disabled}>
      {children}
    </div>
  );
  switch (cap.id) {
    case 'schema':
      return wrap(
        <DbSchemaEditor
          schema={node.data.schema ?? { tables: [] }}
          onChange={(schema) => onPatch({ schema })}
        />,
      );
    case 'api': {
      const allowed = findCatalogItem(node.data.type)?.supportedProtocols;
      return wrap(
        <ApiEndpointEditor
          api={node.data.api ?? { protocols: [] }}
          allowedProtocols={allowed}
          onChange={(api) => onPatch({ api })}
        />,
      );
    }
    case 'consuming': {
      const current =
        (cap.read(node.data) as ConsumingSpec | undefined) ??
        ({ handler: '', concurrency: 1 } as ConsumingSpec);
      return wrap(
        <ConsumingEditor
          consuming={current}
          nodes={nodes}
          selfId={node.id}
          onChange={(consuming) => onPatch({ consuming })}
        />,
      );
    }
    case 'scheduled': {
      const current =
        (cap.read(node.data) as ScheduledSpec | undefined) ??
        ({ schedule: '' } as ScheduledSpec);
      return wrap(
        <ScheduledEditor
          scheduled={current}
          onChange={(scheduled) => onPatch({ scheduled })}
        />,
      );
    }
    case 'producing': {
      const current =
        (cap.read(node.data) as ProducingSpec | undefined) ??
        ({ events: [] } as ProducingSpec);
      return wrap(
        <ProducingEditor
          producing={current}
          nodes={nodes}
          selfId={node.id}
          onChange={(producing) => onPatch({ producing })}
        />,
      );
    }
    case 'reliability': {
      const current =
        (cap.read(node.data) as ReliabilitySpec | undefined) ?? {};
      // Recompute SPOF info; cheap on small/medium graphs. Topology may
      // mark the node as a cut vertex, but the production reality is that
      // replicas >= 2 means the box on screen is N runtime instances behind
      // a load balancer — not a true SPOF. Mirror SDNode's chrome rule so
      // Inspector and canvas tell the same story.
      const allEdges = useCanvas.getState().edges;
      const spof = findSpofs(nodes, allEdges);
      const articulation = spof.articulationPoints.includes(node.id);
      const replicas = current.replicas;
      const isScaled = typeof replicas === 'number' && replicas >= 2;
      const isSpof = articulation && !isScaled;
      return wrap(
        <ReliabilityEditor
          reliability={current}
          tone={(node.data.tone as Tone) ?? 'service'}
          isSpof={isSpof}
          onChange={(reliability) => onPatch({ reliability })}
        />,
      );
    }
    case 'notes':
      return wrap(
        <NotesEditor
          notes={node.data.notes ?? ''}
          onChange={(notes) => onPatch({ notes })}
        />,
      );
    default:
      return null;
  }
}

function NotesEditor({
  notes,
  onChange,
}: {
  notes: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
        Notes (markdown · included in AI context)
      </label>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Notes about this node:\n- expected RPS: ~2k\n- read-heavy, writes rare\n- TODO: where does TLS terminate?`}
        rows={14}
        className="w-full resize-y rounded-md border border-border bg-input px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function EdgeInspector({
  data,
  onChange,
  onClose,
  onDelete,
}: {
  data: EdgeData;
  onChange: (next: EdgeData) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Header
        tone="edge"
        title={`Edge · ${data.protocol.toUpperCase()}`}
        subtitle="connection"
        onClose={onClose}
        onDelete={onDelete}
        deleteLabel="Delete edge"
      />
      <div className="flex-1 overflow-auto p-3.5">
        <EdgeProtocolEditor data={data} onChange={onChange} />
      </div>
    </>
  );
}

function Header({
  tone,
  title,
  subtitle,
  onClose,
  onDelete,
  deleteLabel,
  locked,
  onLock,
  hidden,
  onHide,
  onAskAi,
}: {
  tone: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  onDelete: () => void;
  deleteLabel: string;
  locked?: boolean;
  onLock?: () => void;
  hidden?: boolean;
  onHide?: () => void;
  onAskAi?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]"
        style={{
          background: `var(--tone-${tone}-bg)`,
          color: `var(--tone-${tone}-fg)`,
        }}
      >
        {subtitle}
      </span>
      <span className="truncate text-[12.5px] font-semibold text-text">
        {title}
      </span>
      {onAskAi && (
        <button
          onClick={onAskAi}
          title="Ask AI about this node"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-text-dim hover:bg-[var(--accent-soft)] hover:text-accent"
        >
          <Icon name="sparkles" size={12} />
        </button>
      )}
      {onLock && (
        <button
          onClick={onLock}
          title={locked ? 'Unlock (⌘L)' : 'Lock (⌘L)'}
          aria-pressed={locked}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md',
            !onAskAi && 'ml-auto',
            locked
              ? 'bg-[var(--accent-soft)] text-accent'
              : 'text-text-dim hover:bg-hover hover:text-text',
          )}
        >
          <Icon name="auth" size={12} stroke={1.7} />
        </button>
      )}
      {onHide && (
        <button
          onClick={onHide}
          title={hidden ? 'Show' : 'Hide'}
          aria-pressed={hidden}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md',
            hidden
              ? 'bg-[var(--accent-soft)] text-accent'
              : 'text-text-dim hover:bg-hover hover:text-text',
          )}
        >
          <Icon name={hidden ? 'circle' : 'check'} size={12} />
        </button>
      )}
      <button
        onClick={onDelete}
        title={deleteLabel}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md text-text-dim hover:bg-hover hover:text-[#c96442]',
          !onLock && 'ml-auto',
        )}
      >
        <Icon name="trash" size={12} />
      </button>
      <button
        onClick={onClose}
        className="flex h-6 w-6 items-center justify-center rounded-md text-text-dim hover:bg-hover hover:text-text"
        aria-label="Close inspector"
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

function NodeBasics({
  label,
  meta,
  onLabel,
  onMeta,
}: {
  label: string;
  meta?: string;
  onLabel: (v: string) => void;
  onMeta: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Label">
        <input
          value={label}
          onChange={(e) => onLabel(e.target.value)}
          className="h-8 w-full rounded-md border border-border bg-input px-2.5 text-[12px] text-text focus:border-accent focus:outline-none"
        />
      </Field>
      <Field label="Description">
        <input
          value={meta ?? ''}
          onChange={(e) => onMeta(e.target.value)}
          placeholder="3 tables · 2.8k RPS"
          className="h-8 w-full rounded-md border border-border bg-input px-2.5 text-[12px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
        {label}
      </span>
      {children}
    </label>
  );
}
