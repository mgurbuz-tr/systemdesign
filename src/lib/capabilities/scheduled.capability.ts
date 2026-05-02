/**
 * `scheduled` capability — cron / interval tabanlı tetiklenen runner config.
 * Tetikleyici: zaman. Default merge: replace.
 */
import { z } from 'zod';
import type { NodeData, ScheduledSpec } from '@/types';
import type { NodeCapability } from './types';
import { makeAppliesTo } from './zod-shared';

export const ScheduledSchema = z.object({
  schedule: z.string(),
  handler: z.string().optional(),
  description: z.string().optional(),
  timezone: z.string().optional(),
});

export const scheduledCapability: NodeCapability<ScheduledSpec> = {
  id: 'scheduled',
  label: 'Scheduled',
  patchOp: 'set_scheduled',
  schema: ScheduledSchema as unknown as z.ZodType<ScheduledSpec>,
  mergeStrategy: 'replace',
  order: 40,
  appliesTo: makeAppliesTo('scheduled'),
  read: (node: NodeData) => {
    if (node.scheduled) return node.scheduled;
    // Backwards-compat: legacy `consumer.schedule`.
    if (node.consumer?.schedule) {
      return {
        schedule: node.consumer.schedule,
        handler: node.consumer.handler,
      };
    }
    return undefined;
  },
  write: (node, value) => ({ ...node, scheduled: value }),
  promptInstruction: (mode) => {
    const base =
      'For this cron/scheduler suggest a cron expression (e.g. "0 */4 * * *" ' +
      'or "@hourly"), the handler/job name to run, and a timezone if relevant. ' +
      'Write everything in a single set_scheduled patch.';
    return mode === 'replace'
      ? base + ' Ignore the existing config.'
      : base + ' Fill empty fields, leave populated ones untouched.';
  },
};
