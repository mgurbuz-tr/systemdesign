/**
 * `producing` capability — Kafka/RabbitMQ/SNS gibi event-bus node'larında
 * "buraya hangi event'ler yazılıyor, kimler publisher" tanımı. Augment.
 */
import { z } from 'zod';
import type { NodeData, ProducedEvent, ProducingSpec } from '@/types';
import type { NodeCapability } from './types';
import { dedupeBy, makeAppliesTo } from './zod-shared';

const ProducedEventSchema = z.object({
  name: z.string(),
  publishers: z.array(z.string()).optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  description: z.string().optional(),
});

export const ProducingSchema = z.object({
  events: z.array(ProducedEventSchema),
});

export const producingCapability: NodeCapability<ProducingSpec> = {
  id: 'producing',
  label: 'Producing',
  patchOp: 'set_producing',
  schema: ProducingSchema as unknown as z.ZodType<ProducingSpec>,
  mergeStrategy: 'augment',
  order: 50,
  appliesTo: makeAppliesTo('producing'),
  read: (node: NodeData) => node.producing,
  write: (node, value) => ({ ...node, producing: value }),
  merge: (prev, incoming) => {
    if (!prev || prev.events.length === 0) return incoming;
    // Event adı bazında dedupe — mevcut event korunur, yeni publishers/fields
    // birleştirilir.
    const byName = new Map<string, ProducedEvent>();
    for (const e of prev.events) byName.set(e.name.toLowerCase(), { ...e });
    for (const e of incoming.events) {
      const key = e.name.toLowerCase();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, e);
        continue;
      }
      byName.set(key, {
        ...existing,
        publishers: dedupeBy(
          [...(existing.publishers ?? []), ...(e.publishers ?? [])],
          (id) => id,
        ),
        fields: existing.fields ?? e.fields,
        description: existing.description ?? e.description,
      });
    }
    return { events: Array.from(byName.values()) };
  },
  promptInstruction: (mode) => {
    const base =
      'Suggest which events/messages are written to this queue/topic. For each ' +
      'event emit a name (e.g. OrderCreated), publisher service node ids, and ' +
      'the main payload fields (name:type). Look at edges to figure out which ' +
      'services write to this queue. Use a set_producing patch.';
    return mode === 'replace'
      ? base + ' Ignore the existing event list — this is replace mode.'
      : base + ' Copy existing events into the payload and append new ones.';
  },
};
