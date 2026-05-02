/**
 * `consuming` capability — kuyruktan/topic'ten mesaj tüketen worker config.
 * Tetikleyici: queue mesajı. Default merge: replace (tek config).
 */
import { z } from 'zod';
import type { ConsumingSpec, NodeData } from '@/types';
import type { NodeCapability } from './types';
import { makeAppliesTo } from './zod-shared';

export const ConsumingSchema = z.object({
  sourceNodeId: z.string().optional(),
  handler: z.string(),
  concurrency: z.number().int().positive().optional(),
  deadLetterNodeId: z.string().optional(),
  notes: z.string().optional(),
});

export const consumingCapability: NodeCapability<ConsumingSpec> = {
  id: 'consuming',
  label: 'Consuming',
  patchOp: 'set_consuming',
  schema: ConsumingSchema as unknown as z.ZodType<ConsumingSpec>,
  mergeStrategy: 'replace',
  order: 30,
  appliesTo: makeAppliesTo('consuming'),
  read: (node: NodeData) => {
    if (node.consuming) return node.consuming;
    // Backwards-compat: legacy `consumer` field (pre capability split).
    if (node.consumer) {
      return {
        sourceNodeId: node.consumer.sourceNodeId,
        handler: node.consumer.handler,
        concurrency: node.consumer.concurrency,
      };
    }
    return undefined;
  },
  write: (node, value) => {
    // Yeni alana yaz; legacy `consumer.schedule` varsa scheduled tarafına
    // bırak. Burada scheduled'a dokunmuyoruz, sadece consuming alanını
    // güncelliyoruz. Migration: ileride consumer alanı boşalırsa silinebilir.
    return { ...node, consuming: value };
  },
  promptInstruction: (mode) => {
    const base =
      'For this worker/consumer suggest the SOURCE queue node id, the ' +
      'handler/processor name, and a concurrency value. If a dead-letter ' +
      'queue (DLQ) makes sense, fill in deadLetterNodeId too. Write everything ' +
      'in a single set_consuming patch.';
    return mode === 'replace'
      ? base + ' Ignore the existing config.'
      : base + ' Fill empty fields, leave populated ones untouched.';
  },
};
