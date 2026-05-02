# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The in-app 200-step version history is edit-level; this CHANGELOG is for released versions.

## [Unreleased]

### Added — System Architect Analysis Suite
- `reliability` capability (CAP / PACELC / consistency model / SLO / replicas / redundancy / failure modes) — appears as Inspector tab on every service / data / cache / queue / ai / edge node, AI-fillable via `set_reliability` patch op.
- `EdgeData.latencyMsHint` + `criticality` — feeds latency budget and bottleneck weighting; per-protocol defaults from `reliabilityDefaults.ts`.
- Static analyzers (`src/lib/analysis/`):
  - `spof.ts` — Tarjan articulation points + bridge edges.
  - `centrality.ts` — weighted bottleneck score per node.
  - `criticalPath.ts` — top-K longest latency paths from client/edge to data/sink.
  - `readWritePath.ts` — service ↔ store classifier (hot reads, uncached, async writes).
  - `capAudit.ts` — strong-consistency vs AP-store mismatch, latency-budget-blown, unreplicated-spof, low-availability-target.
  - `scorer.ts` — 6-pillar scorecard (reliability / performance / cost / security / operations / consistency) with A-F grades and weighted total.
  - `runAllAnalyses` — single entry point producing an `AnalysisReport`.
- Sidebar **Analysis** tab (`metrics` icon): scorecard + signal summary + findings list + 3 overlay toggles (Heat-map / SPOF / Critical path).
- Inspector **Reliability** tab — CAP radio, PACELC dropdown, consistency model, SLO inputs (p99 ms / availability / RPS), replicas, redundancy, failure-modes textarea, SPOF banner.
- Canvas overlays — heat-map background gradient, SPOF dashed ring + corner badge, critical-path edges in 2.5 px accent stroke.
- AI Copilot quick actions: **Architecture review**, **What-if X fails?**, **CAP audit**, **Latency budget** — each runs the static analyzer first and folds the structured report into the LLM prompt.
- Top-level `AnalysisRunner` re-runs the suite on every canvas mutation (200 ms debounce) and publishes to `useAnalysis` store.

### Added
- 200-step persistent version history panel (`Cmd+Shift+H`). Sidebar tab with list, restore + safety snapshot, manual save button.
- `versions` IndexedDB table (`[projectId+createdAt]` compound index, FIFO ring buffer).
- Trigger-driven snapshot recorder: AI patch, manual "Save version", auto-layout, 5 s idle.
- Restore flow: automatic pre-restore safety snapshot + single-setState `applyAtomic` (revertible via Cmd+Z).
- Command Palette: `Show version history`, `Save version now`, `Restore last version`.
- Toolbar: History and Save buttons.
- Documentation: `README.md`, `ARCHITECTURE.md`, `docs/AI_INTEGRATION.md`.

### Changed
- `package.json` description filled in.
- Deleting a project also clears that project's version history (`deleteAllVersionsForProject`).
- Sidebar nav reduced to Architecture / Analysis / Changelog (Documentation/Resources placeholders removed).
- Entire UI surface translated to English (toasts, prompts, panels, AI copilot quick actions).

## [0.1.0] - 2026-05-02

İlk açık sürüm. Ana özellikler:

### Added
- Canvas tabanlı sistem tasarım editörü (xyflow + custom node renderer'ları).
- Capability sistemi: `schema`, `api`, `consuming`, `scheduled`, `producing` — registry + Inspector tab dinamizmi.
- IndexedDB persistence (Dexie): otomatik kayıt, son proje yeniden açma, duplicate, rename, template'ten reset.
- Auto-layout (ELK, top-bottom / left-right).
- AI Copilot:
  - LM Studio integration, streaming chat.
  - Reversible patch protocol — `applyPatches` snapshot + atomik setState.
  - Patch parser, multi-fence merge, protocol alias coercion, `<think>` block strip, Bearer auth.
  - Inspector → AI bridge, Issue Scan, Notes tab.
- 80 adımlık `zundo` tabanlı oturum-içi undo (`Cmd+Z`/`Cmd+Shift+Z`); drag fırtınaları 250 ms coalesce.
- Command Palette (`Cmd+K`), HelpModal (`Shift+?`), tema/density/edge style/node display ayarları.
- Workspace Menu: proje listele, oluştur, kopyala, sil, template yükle.
- Sonner tabanlı toast bildirim sistemi.
