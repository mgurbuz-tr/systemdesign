/**
 * Capability registry — public API.
 *
 * Bu dosya tüm capability'leri singleton registry'ye kaydeder. Yeni bir
 * capability eklemek için:
 *   1. `src/lib/capabilities/<id>.capability.ts` dosyasını oluştur
 *   2. Aşağıya `register(...)` satırı ekle
 *   3. (gerekirse) `CapabilityId` union'ına id'i ekle (`@/types`)
 *
 * `patches.ts`, `Inspector.tsx`, `prompts.ts` çekirdek dosyalarına dokunma.
 */
import { capabilityRegistry } from './registry';
import { schemaCapability } from './schema.capability';
import { apiCapability } from './api.capability';
import { consumingCapability } from './consuming.capability';
import { scheduledCapability } from './scheduled.capability';
import { producingCapability } from './producing.capability';
import { reliabilityCapability } from './reliability.capability';
import { notesCapability } from './notes.capability';

capabilityRegistry.register(schemaCapability);
capabilityRegistry.register(apiCapability);
capabilityRegistry.register(consumingCapability);
capabilityRegistry.register(scheduledCapability);
capabilityRegistry.register(producingCapability);
capabilityRegistry.register(reliabilityCapability);
capabilityRegistry.register(notesCapability);

export { capabilityRegistry } from './registry';
export type { NodeCapability, CapabilityId, MergeStrategy } from './types';
export { schemaCapability } from './schema.capability';
export { apiCapability } from './api.capability';
export { consumingCapability } from './consuming.capability';
export { scheduledCapability } from './scheduled.capability';
export { producingCapability } from './producing.capability';
export { reliabilityCapability } from './reliability.capability';
export { notesCapability } from './notes.capability';
