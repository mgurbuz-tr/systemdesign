/**
 * Capability registry — runtime kayıt defteri.
 *
 * Bütün NodeCapability instance'ları burada toplanır. Inspector, patch
 * sistemi ve prompt builder hep bu registry'ye sorar:
 *
 *   - Inspector.tsx: `registry.forNode(node)` → tab listesi
 *   - patches.ts: `registry.byPatchOp('set_schema')` → apply
 *   - prompts.ts: `registry.all()` → AI'a verilen op listesi + matrix
 *
 * Yeni capability eklemek = yeni dosya + `registry.register(...)`. Çekirdek
 * dosyalara (`patches.ts` / `Inspector.tsx` / `prompts.ts`) dokunma.
 */
import type { CatalogItem, NodeData } from '@/types';
import type { CapabilityId, NodeCapability } from './types';

export class CapabilityRegistry {
  private items: NodeCapability[] = [];

  register(cap: NodeCapability): void {
    if (this.items.some((c) => c.id === cap.id)) {
      throw new Error(`Capability "${cap.id}" already registered`);
    }
    this.items.push(cap);
    this.items.sort((a, b) => a.order - b.order);
  }

  /** Bu node'un sahip olduğu capability'ler, `order` sırasıyla. */
  forNode(node: NodeData): NodeCapability[] {
    return this.items.filter((c) => c.appliesTo(node));
  }

  byId<T = unknown>(id: CapabilityId): NodeCapability<T> | undefined {
    return this.items.find((c) => c.id === id) as NodeCapability<T> | undefined;
  }

  byPatchOp<T = unknown>(op: string): NodeCapability<T> | undefined {
    return this.items.find((c) => c.patchOp === op) as
      | NodeCapability<T>
      | undefined;
  }

  all(): NodeCapability[] {
    return [...this.items];
  }

  /**
   * Belirli bir capability'nin uygulandığı *catalog type id*'lerini döndürür.
   * Prompt builder bunu "set_schema yalnızca [postgres, mysql, …] için
   * geçerli" matrisini AI'a yazmak için kullanır.
   */
  typesFor(id: CapabilityId, catalog: CatalogItem[]): string[] {
    return catalog
      .filter((it) => {
        if (it.capabilities?.includes(id)) return true;
        const syntheticNode = {
          type: it.type,
          category: it.category,
          tone: it.tone,
          label: it.label,
        } as NodeData;
        return this.byId(id)?.appliesTo(syntheticNode) ?? false;
      })
      .map((it) => it.type);
  }
}

/** Singleton — tüm uygulama tek registry kullanır. */
export const capabilityRegistry = new CapabilityRegistry();
