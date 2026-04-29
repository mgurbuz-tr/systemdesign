import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Node } from '@xyflow/react';
import { Icon } from '@/components/ui/Icon';
import { useCanvas } from '@/lib/store/canvasStore';
import { useSettings } from '@/lib/store/settingsStore';
import { findCatalogItem } from '@/lib/catalog';
import { DbSchemaEditor } from './DbSchemaEditor';
import { ApiEndpointEditor } from './ApiEndpointEditor';
import { ConsumerEditor } from './ConsumerEditor';
import { EdgeProtocolEditor } from './EdgeProtocolEditor';
import { MockupEditor } from './MockupEditor';
import { QuickStats } from './QuickStats';
import type {
  ApiSpec,
  ConsumerSpec,
  DbSchema,
  EdgeData,
  MockupSpec,
  NodeData,
} from '@/types';
import { cn } from '@/lib/utils';

type TabKey = 'basic' | 'schema' | 'api' | 'consumer' | 'mockup';

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
              onLabel={(label) => updateNode(selectedNode.id, { label })}
              onMeta={(meta) => updateNode(selectedNode.id, { meta })}
              onSchema={(schema) => updateNode(selectedNode.id, { schema })}
              onApi={(api) => updateNode(selectedNode.id, { api })}
              onConsumer={(consumer) => updateNode(selectedNode.id, { consumer })}
              onMockup={(mockup) => updateNode(selectedNode.id, { mockup })}
              onLock={() => useCanvas.getState().toggleNodeLock(selectedNode.id)}
              onHide={() => useCanvas.getState().toggleNodeHidden(selectedNode.id)}
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
  onLabel,
  onMeta,
  onSchema,
  onApi,
  onConsumer,
  onMockup,
  onLock,
  onHide,
  onClose,
  onDelete,
}: {
  node: Node<NodeData>;
  nodes: Node<NodeData>[];
  onLabel: (v: string) => void;
  onMeta: (v: string) => void;
  onSchema: (s: DbSchema) => void;
  onApi: (a: ApiSpec) => void;
  onConsumer: (c: ConsumerSpec) => void;
  onMockup: (m: MockupSpec) => void;
  onLock: () => void;
  onHide: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const catalog = findCatalogItem(node.data.type);
  const tabs = useMemo<{ key: TabKey; label: string }[]>(() => {
    const arr: { key: TabKey; label: string }[] = [{ key: 'basic', label: 'Basic' }];
    if (catalog?.hasSchemaEditor) arr.push({ key: 'schema', label: 'Schema' });
    if (catalog?.hasMockupEditor) arr.push({ key: 'mockup', label: 'Screens' });
    if (catalog?.hasApiEditor) arr.push({ key: 'api', label: 'API' });
    if (catalog?.hasConsumerEditor) arr.push({ key: 'consumer', label: 'Consumer' });
    return arr;
  }, [catalog]);

  // Open the most useful tab by default rather than always landing on Basic.
  // Schema > Mockup > Consumer > API > Basic — match the most likely first
  // edit for a given node type.
  const defaultTab: TabKey = catalog?.hasSchemaEditor
    ? 'schema'
    : catalog?.hasMockupEditor
      ? 'mockup'
      : catalog?.hasConsumerEditor
        ? 'consumer'
        : catalog?.hasApiEditor
          ? 'api'
          : 'basic';
  const [active, setActive] = useState<TabKey>(defaultTab);

  // Suggestions for "API calls" autocomplete in Mockup editor —
  // surface every endpoint defined elsewhere on the canvas.
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
      />

      <div className="-mb-px flex gap-0.5 border-b border-border px-3.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              'relative px-2 pb-1.5 pt-0.5 text-[11px] font-medium',
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

      <div className="flex-1 overflow-auto p-3.5">
        {active === 'basic' && (
          <div className="space-y-5">
            <NodeBasics
              label={node.data.label}
              meta={node.data.meta}
              onLabel={onLabel}
              onMeta={onMeta}
            />
            <QuickStats node={node} nodes={nodes} edges={useCanvas.getState().edges} />
          </div>
        )}
        {active === 'schema' && catalog?.hasSchemaEditor && (
          <DbSchemaEditor
            schema={node.data.schema ?? { tables: [] }}
            onChange={onSchema}
          />
        )}
        {active === 'api' && catalog?.hasApiEditor && (
          <ApiEndpointEditor
            api={node.data.api ?? { protocols: [] }}
            allowedProtocols={catalog?.supportedProtocols}
            onChange={onApi}
          />
        )}
        {active === 'consumer' && catalog?.hasConsumerEditor && (
          <ConsumerEditor
            consumer={node.data.consumer ?? { handler: '', concurrency: 1 }}
            nodes={nodes}
            selfId={node.id}
            onChange={onConsumer}
          />
        )}
        {active === 'mockup' && catalog?.hasMockupEditor && (
          <MockupEditor
            mockup={node.data.mockup ?? { screens: [] }}
            apiSuggestions={apiSuggestions}
            onChange={onMockup}
          />
        )}
      </div>
    </>
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
      {onLock && (
        <button
          onClick={onLock}
          title={locked ? 'Unlock (⌘L)' : 'Lock (⌘L)'}
          aria-pressed={locked}
          className={cn(
            'ml-auto flex h-6 w-6 items-center justify-center rounded-md',
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
