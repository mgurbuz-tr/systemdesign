import type { Edge, Node } from '@xyflow/react';
import type { EdgeData, NodeData } from '@/types';
import type { AiTaskDescriptor, BuildPromptOpts } from './prompts';
import type { AiPatch } from './patches';

interface ValidationContext {
  task: AiTaskDescriptor;
  attributeFill?: BuildPromptOpts['attributeFill'];
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
}

function isSetOp(
  patch: AiPatch,
  op: string,
): patch is AiPatch & { id: string; value: Record<string, unknown> } {
  return (patch as { op?: string }).op === op;
}

function patchValue(
  patch: AiPatch,
): Record<string, unknown> | null {
  const value = (patch as { value?: unknown }).value;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateAiProposal(
  patches: AiPatch[],
  ctx: ValidationContext,
): string[] {
  const warnings: string[] = [];
  const opNames = patches.map((patch) => (patch as { op?: string }).op ?? '');
  if (ctx.task.mode === 'analyze_only' && patches.length > 0) {
    warnings.push('Analyze-only task emitted a patch. Review whether this should stay descriptive only.');
  }

  if (ctx.attributeFill) {
    const { nodeId, capabilityId } = ctx.attributeFill;
    const targetOp = `set_${capabilityId}`;
    const primaryPatch = patches.find(
      (patch) => isSetOp(patch, targetOp) && patch.id === nodeId,
    );
    if (!primaryPatch) {
      warnings.push(`Missing primary ${targetOp} patch for anchor node "${nodeId}".`);
    }

    if (primaryPatch && capabilityId === 'api') {
      const value = patchValue(primaryPatch);
      const protocols = Array.isArray(value?.protocols)
        ? value.protocols
        : [];
      const endpoints = protocols.flatMap((block: unknown) =>
        Array.isArray((block as { endpoints?: unknown[] }).endpoints)
          ? (block as { endpoints: unknown[] }).endpoints
          : [],
      ) as Array<Record<string, unknown>>;
      if (
        endpoints.some(
          (endpoint) => !Array.isArray(endpoint.request) || !Array.isArray(endpoint.response),
        )
      ) {
        warnings.push('API fill left at least one endpoint without both request and response DTO arrays.');
      }
    }

    if (primaryPatch && capabilityId === 'schema') {
      const value = patchValue(primaryPatch);
      const tables = Array.isArray(value?.tables)
        ? value.tables
        : [];
      if (tables.length === 0) {
        warnings.push('Schema fill did not propose any tables.');
      }
      const hasIndexes = tables.some(
        (table: unknown) =>
          Array.isArray((table as { indexes?: unknown[] }).indexes) &&
          ((table as { indexes?: unknown[] }).indexes?.length ?? 0) > 0,
      );
      if (!hasIndexes) {
        warnings.push('Schema fill did not add any representative indexes.');
      }
    }

    if (primaryPatch && capabilityId === 'reliability') {
      const value = patchValue(primaryPatch) ?? {};
      if (
        !value.cap ||
        !value.consistencyModel ||
        value.replicas === undefined ||
        !Array.isArray(value.failureModes)
      ) {
        warnings.push('Reliability fill omitted one of cap, consistencyModel, replicas, or failureModes.');
      }
      if (!opNames.includes('set_notes')) {
        warnings.push('Reliability fill did not leave behind architect notes explaining the tradeoff.');
      }
    }
  }

  if (ctx.task.mode === 'annotate_architecture') {
    if (!opNames.includes('set_notes') && !opNames.includes('set_reliability')) {
      warnings.push('Architecture annotation task did not emit any set_notes or set_reliability patches.');
    }
  }

  if (ctx.task.mode === 'refactor_graph') {
    const addNodePatches = patches.filter(
      (patch) => (patch as { op?: string }).op === 'add_node',
    ) as Array<AiPatch & { ref?: string; type?: string }>;
    const serviceRefs = addNodePatches
      .filter((patch) => patch.type === 'service' && patch.ref)
      .map((patch) => `$${patch.ref}`);
    const dbRefs = addNodePatches
      .filter((patch) => ['postgres', 'mysql', 'mongo', 'dynamo', 'cassandra', 'neo4j', 'clickhouse', 'influx'].includes(patch.type ?? ''))
      .map((patch) => `$${patch.ref}`);
    if (!opNames.includes('remove_node')) {
      warnings.push('Refactor patch did not remove the old shared node(s); this may leave the canvas in a dual-state.');
    }
    if (!opNames.includes('set_api') || !opNames.includes('set_schema')) {
      warnings.push('Refactor patch is missing either set_api or set_schema payloads for the new bounded contexts.');
    }
    if (!opNames.includes('set_notes') || !opNames.includes('set_reliability')) {
      warnings.push('Refactor patch is missing architect notes or reliability annotations on the new design.');
    }
    for (const ref of serviceRefs) {
      const wired = patches.some((patch) => {
        if ((patch as { op?: string }).op !== 'add_edge') return false;
        const edge = patch as { source?: string; target?: string };
        return edge.source === ref || edge.target === ref;
      });
      if (!wired) warnings.push(`Refactor added service ${ref} without any edge.`);
    }
    for (const ref of dbRefs) {
      const hasSchema = patches.some(
        (patch) => isSetOp(patch, 'set_schema') && patch.id === ref,
      );
      if (!hasSchema) warnings.push(`Refactor added DB ${ref} without a schema payload.`);
    }
  }

  return warnings;
}
