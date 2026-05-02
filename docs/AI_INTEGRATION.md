# AI Integration

Editör, yerel LM Studio sunucusuna bağlanarak chat + canvas üzerinde **geri-alınabilir patch'ler** uygular. Üçüncü parti API çağrısı yok, model tarayıcı dışına çıkmaz.

## LM Studio kurulumu

1. [LM Studio](https://lmstudio.ai/) indir, kur.
2. Bir chat modeli yükle. Önerilenler:
   - `qwen2.5-coder-7b-instruct` (hızlı, JSON üretiminde tutarlı)
   - `llama-3.1-8b-instruct` (daha geniş bilgi, biraz yavaş)
3. **Local Server** sekmesinden modelin `Start Server` düğmesine bas. Varsayılan endpoint: `http://localhost:1234/v1`.
4. (Opsiyonel) LM Studio yeni sürümlerinde "Require API Key" varsayılan açık. Settings'ten bir token oluştur.
5. Editörde Settings paneli → **LM Studio Base URL** ve **API Key** alanlarını doldur.
6. AI panelini aç (`Cmd+I`), bir mesaj yaz. Bağlantı sağlam ise streaming yanıt akar.

Bağlantı sorununda DevTools network tab'ında `/v1/chat/completions`'a bakılır; 401 → token hatalı, ECONNREFUSED → server kapalı.

## Sistem promptu ve patch protokolü

Kalp dosya: `src/lib/ai/prompts.ts`. İçinde:
- LLM'e canvas özetinin nasıl geldiği (`canvasContext.ts` çıktısı).
- Üretmesi beklenen patch fence formatı.
- Capability `set_*` op'ları için kullanım örnekleri.
- `<think>` tag'lerinin (reasoning modellerinde) çıktıdan ayıklandığı uyarı (commit `cb4dfa0`).

Yanıt iki bölümden oluşur:
1. **Açıklayıcı metin** (Markdown).
2. **Patch fence(ler)** — `\`\`\`patch` veya `\`\`\`json` fence içinde JSON dizisi. `parsePatches` lenient: birden fazla fence varsa hepsi merge edilir (commit `ef6c8d9`).

### Patch op tablosu

| Op | Anlam |
|---|---|
| `add_node` | Yeni node ekle. `type`, `label`, opsiyonel `position`, `groupId`, capability seed'leri. |
| `update_node` | Var olan node'un `data` alanını yamalar (shallow merge). |
| `remove_node` | Node'u + bağlı edge'lerini siler. |
| `add_edge` | İki node arası bağlantı + protocol/async. `from`/`to` id, prefix, label ya da `$last`/`$ref`. |
| `update_edge` | Edge `data` alanını yamalar. |
| `remove_edge` | Edge'i siler. |
| `add_group` | Group container ekler (xyflow group node). |
| `set_schema` / `set_api` / `set_consuming` / `set_scheduled` / `set_producing` | Capability registry üzerinden dispatch. `mode: 'replace' \| 'augment'` ile merge stratejisi. |

`from`/`to`/`id` alanları için `resolveRef` esnek arama yapar: exact id → prefix-id → label → `$ref`. AI sıkça `postgres-abc123` yerine `postgres` yazar; bu yüzden tolerans kritik.

### Reversibility

```
applyPatches(patches)
   ├── deep-clone canvas → snapshot
   ├── tüm op'ları context üstünde uygula
   ├── tek `applyAtomic({ nodes, edges })` çağrısı (zundo: tek undo entry)
   ├── versionRecorder.recordAuto('ai-patch', summary)  ← kalıcı geçmiş
   └── return { snapshot, applied, warnings }
```

AiPanel her assistant mesajında snapshot'ı tutar. Kullanıcı "Revert" derse `revertToSnapshot(snapshot)` çalışır — AI patch'inden sonra başka düzenlemeler yapılmış olsa bile snapshot deep-clone olduğu için bozulmaz (commit `a5c567d`).

## Yaygın sorunlar

| Belirti | Sebep & çözüm |
|---|---|
| Patch uygulanmıyor, "JSON parse failed" | `<think>...</think>` blokları içinden patch fence çıkmış olabilir. Yeni sürümlerde `cb4dfa0` ile strip ediliyor; eski commit'lerde manuel temizlik gerekebilir. |
| Birden fazla fence varken sadece biri uygulanıyor | Eski parser tek fence okuyordu; `ef6c8d9` ile multi-fence merge edildi. Güncel sürümde sorun olmamalı. |
| Protocol "sqs" / "http" / "postgres" hatası | Alias coercion devrede (commit `4f2a15a`); `Protocol` union'a düşüyor. Bilinmeyen alias eklemek için `patches.ts` içindeki coercion tablosuna ekleyin. |
| 401 Unauthorized | LM Studio "Require API Key" açık ama editör tarafında Bearer boş. Settings → API Key alanını doldurun (commit `0327beb` desteği ekledi). |
| Patch geri alma çalışmıyor | Snapshot mevcut canvas'la pointer'ı paylaşıyorsa drag/resize bozar. Yeni sürüm deep-clone yapıyor; eski projelerde çıkıyorsa proje açıp kapamak yeter. |

## İlgili dosyalar

- `src/lib/ai/prompts.ts` — sistem promptu + patch dökümanı (kanonik kaynak).
- `src/lib/ai/patches.ts:705-1003` — `applyPatches`, `revertToSnapshot`, capability dispatch.
- `src/lib/ai/canvasContext.ts` — canvas → text özet.
- `src/lib/ai/issues.ts` — kuralsal scan (Issue scan butonu).
- `src/components/ai/AiPanel.tsx` — chat UI + proposal kartları.
- `src/lib/persistence/versionRecorder.ts` — AI patch sonrası `recordAuto('ai-patch', …)`.
