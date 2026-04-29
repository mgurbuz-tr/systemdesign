import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';
import { useSettings } from '@/lib/store/settingsStore';
import type { EdgeData, Protocol } from '@/types';

const ASYNC_PROTOCOLS: Protocol[] = ['kafka', 'amqp', 'mqtt', 'websocket'];

const PROTOCOL_LABEL: Record<Protocol, string> = {
  rest: 'REST',
  grpc: 'gRPC',
  graphql: 'GraphQL',
  websocket: 'WS',
  signalr: 'SignalR',
  amqp: 'AMQP',
  kafka: 'Kafka',
  mqtt: 'MQTT',
  sql: 'SQL',
  redis: 'Redis',
  tcp: 'TCP',
};

const PROTOCOL_TONE: Record<Protocol, string> = {
  rest: 'service',
  grpc: 'service',
  graphql: 'service',
  websocket: 'service',
  signalr: 'service',
  amqp: 'queue',
  kafka: 'queue',
  mqtt: 'queue',
  sql: 'data',
  redis: 'cache',
  tcp: 'edge',
};

function ProtocolEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
  } = props;
  const edgeStyle = useSettings((s) => s.edgeStyle);
  const edgeData = (data as EdgeData | undefined) ?? { protocol: 'rest' };
  const protocol = edgeData.protocol;
  const isAsync = edgeData.async ?? ASYNC_PROTOCOLS.includes(protocol);

  const [path, labelX, labelY] =
    edgeStyle === 'straight'
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : edgeStyle === 'orthogonal'
        ? getSmoothStepPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
            borderRadius: 8,
          })
        : getBezierPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
          });

  const tone = PROTOCOL_TONE[protocol];
  const strokeColor = selected ? 'var(--accent)' : 'var(--edge-color)';
  const dasharray = isAsync ? '4 3' : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: dasharray,
          ...(selected && {
            animation: 'sd-edge-flow 1.4s linear infinite',
          }),
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.02em',
            padding: '2px 8px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: `var(--tone-${tone}-bg)`,
            color: `var(--tone-${tone}-fg)`,
            whiteSpace: 'nowrap',
          }}
        >
          {PROTOCOL_LABEL[protocol]}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const ProtocolEdge = memo(ProtocolEdgeImpl);
