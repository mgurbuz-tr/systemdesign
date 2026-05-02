import { z } from 'zod';
import type {
  ArchitectureNotesSpec,
  NodeData,
  Tone,
} from '@/types';
import type { NodeCapability } from './types';

const NOTES_TONES: Tone[] = [
  'service',
  'data',
  'cache',
  'queue',
  'edge',
  'ai',
  'external',
  'client',
  'ops',
];

const StringListSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return (
          (typeof record.name === 'string' && record.name.trim()) ||
          (typeof record.title === 'string' && record.title.trim()) ||
          (typeof record.description === 'string' && record.description.trim()) ||
          null
        );
      }
      return null;
    })
    .filter((item): item is string => !!item);
}, z.array(z.string()).default([]));

export const ArchitectureNotesSchema = z.object({
  summary: z.string().optional(),
  designPatterns: StringListSchema.optional(),
  capTradeoffs: StringListSchema.optional(),
  operationalRisks: StringListSchema.optional(),
  recommendations: StringListSchema.optional(),
}) as unknown as z.ZodType<ArchitectureNotesSpec>;

function dedupe(values: string[] = []): string[] {
  return Array.from(
    new Map(values.map((value) => [value.toLowerCase(), value])).values(),
  );
}

function renderMarkdown(value: ArchitectureNotesSpec | undefined): string | undefined {
  if (!value) return undefined;
  const sections: string[] = [];
  if (value.summary?.trim()) {
    sections.push(`## Summary\n${value.summary.trim()}`);
  }
  const listSections: Array<[string, string[] | undefined]> = [
    ['Design Patterns', value.designPatterns],
    ['CAP / Tradeoffs', value.capTradeoffs],
    ['Operational Risks', value.operationalRisks],
    ['Recommendations', value.recommendations],
  ];
  for (const [title, items] of listSections) {
    if (!items || items.length === 0) continue;
    sections.push(`## ${title}\n${items.map((item) => `- ${item}`).join('\n')}`);
  }
  return sections.join('\n\n').trim() || undefined;
}

export const notesCapability: NodeCapability<ArchitectureNotesSpec> = {
  id: 'notes',
  label: 'Notes',
  patchOp: 'set_notes',
  schema: ArchitectureNotesSchema,
  mergeStrategy: 'augment',
  order: 60,
  appliesTo: (node: NodeData) => NOTES_TONES.includes(node.tone as Tone),
  read: (node) => node.architectureNotes,
  write: (node, value) => ({
    ...node,
    architectureNotes: value,
    notes: renderMarkdown(value) ?? node.notes,
  }),
  merge: (prev, incoming) => ({
    summary: incoming.summary ?? prev?.summary,
    designPatterns: dedupe([
      ...(prev?.designPatterns ?? []),
      ...(incoming.designPatterns ?? []),
    ]),
    capTradeoffs: dedupe([
      ...(prev?.capTradeoffs ?? []),
      ...(incoming.capTradeoffs ?? []),
    ]),
    operationalRisks: dedupe([
      ...(prev?.operationalRisks ?? []),
      ...(incoming.operationalRisks ?? []),
    ]),
    recommendations: dedupe([
      ...(prev?.recommendations ?? []),
      ...(incoming.recommendations ?? []),
    ]),
  }),
  promptInstruction: (mode) => {
    const base = [
      'Write architecture notes for this node in a structured way.',
      'STRICT shape:',
      '```json',
      '{',
      '  "summary": "1-3 sentences tailored to this node and its neighbors",',
      '  "designPatterns": ["cache-aside", "outbox", "cqrs"],',
      '  "capTradeoffs": ["Strong writes in primary region, eventual reads on replicas"],',
      '  "operationalRisks": ["Redis outage degrades p99 and forces DB fallback"],',
      '  "recommendations": ["Add read replica for analytics traffic"]',
      '}',
      '```',
      'Hard rules:',
      '- Mention concrete neighboring systems and protocols from the canvas.',
      '- Include CAP/PACELC implications whenever the node stores data or gates consistency.',
      '- Mention applicable production patterns like CQRS, saga, outbox, cache-aside, read replica, circuit breaker, event sourcing, idempotent consumer.',
      '- Avoid generic advice; tie every recommendation to workload or failure mode.',
      '- Emit ONE OR MORE `set_notes` patches if related nodes also need architectural annotation.',
    ].join('\n');
    return mode === 'replace'
      ? `${base}\n- Replace existing architect notes completely.`
      : `${base}\n- Preserve useful existing notes and append missing guidance.`;
  },
};
