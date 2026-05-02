/**
 * Capability'ler arasında paylaşılan zod parçaları. Tek noktada tutarak hem
 * patch parser'ı (`src/lib/ai/patches.ts`) hem capability şemaları aynı
 * lenient validation davranışını paylaşır.
 */
import { z } from 'zod';
import type { Protocol, NodeData, CapabilityId } from '@/types';
import { findCatalogItem } from '@/lib/catalog';

const VALID_PROTOCOLS: Protocol[] = [
  'rest',
  'grpc',
  'graphql',
  'websocket',
  'signalr',
  'amqp',
  'kafka',
  'mqtt',
  'sql',
  'redis',
  'tcp',
];

const PROTOCOL_ALIASES: Record<string, Protocol> = {
  sqs: 'amqp',
  sns: 'amqp',
  rabbitmq: 'amqp',
  pubsub: 'amqp',
  http: 'rest',
  https: 'rest',
  json: 'rest',
  ws: 'websocket',
  wss: 'websocket',
  proto: 'grpc',
  protobuf: 'grpc',
  postgres: 'sql',
  mysql: 'sql',
  cassandra: 'sql',
  mongo: 'sql',
  mongodb: 'sql',
  redisproto: 'redis',
};

/** AI'ın gönderdiği serbest protokol stringini koersiyonla doğrular. */
export const ProtocolSchema = z.preprocess((val) => {
  if (typeof val !== 'string') return undefined;
  const lower = val.toLowerCase().trim();
  if ((VALID_PROTOCOLS as string[]).includes(lower)) return lower;
  if (lower in PROTOCOL_ALIASES) return PROTOCOL_ALIASES[lower];
  return undefined;
}, z.enum(VALID_PROTOCOLS as [Protocol, ...Protocol[]]).optional());

/**
 * `appliesTo` factory — capability id → catalog item'a bakarak node'un
 * bu capability'yi taşıyıp taşımadığını söyler. Tek doğru kaynak: catalog.
 */
export function makeAppliesTo(id: CapabilityId): (node: NodeData) => boolean {
  return (node: NodeData) => {
    const item = findCatalogItem(node.type);
    return item?.capabilities?.includes(id) ?? false;
  };
}

/** ID listesinin tekilleştirilmiş hali — augment merge'te yardımcı. */
export function dedupeBy<T, K>(arr: T[], key: (x: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
