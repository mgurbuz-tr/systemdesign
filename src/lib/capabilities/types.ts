/**
 * NodeCapability — bir node tipinin taşıyabileceği "yetenek".
 *
 * Sistem tasarımındaki primitive'leri (DB, Service, Worker, Cron, Topic…) tek
 * bir "type" alanı ile değil, *birden çok* trait üzerinden modelliyoruz. Bir
 * Hangfire instance hem `consuming` (queue tüketir) hem `scheduled` (cron'a
 * göre tetiklenir) capability'sini taşır. Her capability:
 *
 *  - kendi alt-alanını (schema / api / consuming / scheduled / producing)
 *    *yalnızca o alanı* okuyup yazar (Single Responsibility),
 *  - `set_<id>` patch op'u olarak AI'a açılır (Open/Closed — yeni capability
 *    çekirdek dosyalara dokunmadan eklenebilir),
 *  - kendi merge stratejisini (replace vs augment) deklare eder,
 *  - kendi prompt instruction'ını üretir.
 *
 * Editor component'leri burada tutulmaz — `src/components/capabilities/` üstüne
 * monte edilir, böylece `lib/capabilities/` saf data/zod kalır ve `prompts.ts`
 * ile `patches.ts` React'i import etmek zorunda kalmaz.
 */
import type { ZodType } from 'zod';
import type { NodeData } from '@/types';

export type CapabilityId =
  | 'schema'
  | 'api'
  | 'consuming'
  | 'scheduled'
  | 'producing'
  | 'reliability'
  | 'notes';

/**
 * AI capability fill modu:
 *  - replace: mevcut veriyi sil, sıfırdan üret.
 *  - augment: mevcut veriyi koru, eksikleri ekle.
 *
 * Default karar capability'nin `mergeStrategy` alanından gelir; kullanıcı
 * inspector'da AI butonuna basarken aktif olarak override edebilir.
 */
export type MergeStrategy = 'replace' | 'augment';

export interface NodeCapability<TData = unknown> {
  /** Stable id — hem registry key hem patch op suffix'i (`set_<id>`). */
  readonly id: CapabilityId;
  /** Inspector tab başlığı (TR). */
  readonly label: string;
  /** AI patch op adı; her zaman `set_<id>` formatında. */
  readonly patchOp: `set_${CapabilityId}`;
  /** Payload zod şeması — patch parsing'te validation, write'ta type guard. */
  readonly schema: ZodType<TData>;
  /** Default davranış. UI bu default'u override edebilir. */
  readonly mergeStrategy: MergeStrategy;
  /** Inspector tab sıralaması (düşük olan önce). */
  readonly order: number;

  /**
   * Bu node bu capability'yi taşıyor mu?
   * Source of truth: catalog item'ın `capabilities` listesi.
   */
  appliesTo(node: NodeData): boolean;

  /** Mevcut değeri oku (yoksa undefined). */
  read(node: NodeData): TData | undefined;

  /** Yeni değeri yaz — pure, returns new NodeData. */
  write(node: NodeData, value: TData): NodeData;

  /**
   * Augment modu için merge — `mergeStrategy: 'augment'` capability'lerde
   * tanımlı olmalı. Replace capability'lerinde çağrılmaz.
   */
  merge?(prev: TData | undefined, incoming: TData): TData;

  /**
   * AI'a verilen kind-specific talimat. `mode` parametresi inspector
   * butonuna basıldığında seçilen modu yansıtır (Sıfırdan / Eksikleri tamamla).
   */
  promptInstruction(mode: MergeStrategy): string;
}
