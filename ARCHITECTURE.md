# Architecture

`system-design-editor` is a single-page React 19 + TypeScript app. All state lives in the browser; the only external dependency is the user's local LM Studio.

## High-level data flow

```
[User input]              [LLM (LM Studio)]
     │                            │
     ▼                            │ stream chunks
[xyflow Canvas] ←─ patches.applyPatches() ──┘
     │
     ▼
[useCanvas (Zustand + zundo)]
     │
     ├──► subscribe ──► startAutoSave (300 ms debounce) ──► Dexie `projects`
     │
     ├──► subscribe ──► versionRecorder (zundo step / explicit) ──► Dexie `versions`
     │                                                                │
     │                                                                └──► VersionHistoryPanel (Sidebar)
     │                                                                      │
     │                                                                      └──► restoreVersion → applyAtomic
     │
     └──► subscribe ──► AnalysisRunner (200 ms debounce) ──► useAnalysis store
                                                                  │
                                                                  ├──► AnalysisPanel (Sidebar)
                                                                  ├──► SDNode (SPOF / heat-map overlays)
                                                                  └──► ProtocolEdge (critical-path stroke)
```

## Module responsibilities

### `src/lib/store/`

| Store | Lives in | Responsibility |
|---|---|---|
| `canvasStore.ts` | memory (zundo wrap) | nodes, edges, selection, `applyAtomic` (one setState = one undo entry) |
| `projectStore.ts` | memory | `current` active project meta |
| `settingsStore.ts` | localStorage (zustand persist) | theme, density, edge style, panel toggles, LM Studio settings, `historyPanelOpen`, `analysisPanelOpen`, `analysisOverlays` |
| `aiUiStore.ts` | memory | `pendingPatchCount` — locks the Inspector while AI patches are pending |
| `analysisStore.ts` | memory | latest `AnalysisReport` published by `AnalysisRunner` |

### `src/lib/persistence.ts` and `src/lib/persistence/`

| File | Job |
|---|---|
| `persistence.ts` | autosave loop, `openProject`, `createProject`, `createFromTemplate`, `resetToTemplate`, `renameCurrent`, `deleteCurrent`, `duplicateCurrent`, `restoreLastProject` |
| `persistence/versions.ts` | `recordVersion`, `listVersions`, `getVersion`, `deleteVersion`, `pruneOldVersions` (200 cap, FIFO) |
| `persistence/versionRecorder.ts` | single-active recorder; subscribes to zundo's temporal store; dedup fingerprint; `recordManual` / `recordAuto` |
| `persistence/restoreVersion.ts` | pre-restore safety snapshot + atomic restore via `applyAtomic` |
| `db/database.ts` | Dexie v3 schema: `projects`, `conversations`, `versions` (compound index `[projectId+createdAt]`) |

### `src/lib/ai/`

- `client.ts` — LM Studio streaming chat with Bearer auth.
- `prompts.ts` — system prompt and patch protocol definition.
- `patches.ts` — `applyPatches` (snapshot → atomic apply → record version), `revertToSnapshot`, `parsePatches`, `describePatch`. Capability `set_*` ops dispatch through the registry.
- `canvasContext.ts` — serialises the canvas to a markdown brief for the LLM (now includes reliability fields).
- `issues.ts` — rule-based issue scan (orphan node, missing index, async-non-queue, etc.).
- `askAi.ts` — Inspector helpers for one-click AI calls.

### `src/lib/capabilities/`

Each capability (`schema`, `api`, `consuming`, `scheduled`, `producing`, `reliability`) is a single-file module: `id`, `appliesTo(data)`, `read`, `write`, `merge`, `mergeStrategy`, `patchOp`. `registry.ts` collects them; the Inspector tab list and `set_*` patch dispatch are derived from here. Adding a new capability = new file + register call + entry in `CapabilityId`.

`reliabilityDefaults.ts` carries the protocol-latency table, criticality weights, and tone-driven defaults consumed by both the analyzer suite and the Inspector form.

### `src/lib/analysis/` (new)

Pure, deterministic analyzers — never reach into stores. Designed to run in <50 ms on graphs of ~100 nodes.

| File | Output |
|---|---|
| `spof.ts` | Tarjan articulation points + bridges (treats the graph as undirected). |
| `centrality.ts` | Per-node bottleneck score (in/out degree weighted by protocol latency × criticality + neighbour propagation). |
| `criticalPath.ts` | Top-K longest latency paths from client/edge sources to data/cache/queue/external sinks. |
| `readWritePath.ts` | (service → store) classification: hot reads, uncached, async writes. |
| `capAudit.ts` | Cross-checks reliability annotations against graph structure: cap-mismatch, latency-budget-blown, unreplicated-spof, low-availability-target. |
| `scorer.ts` | 6-pillar scorecard (Reliability / Performance / Cost / Security / Operations / Consistency) with A–F grades and weighted total. |
| `index.ts` | `runAllAnalyses(nodes, edges) → AnalysisReport` orchestrator. |
| `format.ts` | Markdown serializer used by AI Copilot quick actions. |

### `src/lib/catalog/`, `templates/`, `layout/`

- `catalog/` — draggable component list + icon + tone + default capabilities.
- `templates/` — pre-built architectures (`build()` returns nodes + edges).
- `layout/elk.ts` — ELK auto-layout (top-bottom / left-right).

### `src/components/`

| Folder | Contents |
|---|---|
| `canvas/` | `Canvas.tsx` (xyflow root), `Toolbar.tsx`, custom node/edge renderers |
| `inspector/` | `Inspector.tsx` + capability editors (`DbSchemaEditor`, `ApiEndpointEditor`, `ConsumingEditor`, `ScheduledEditor`, `ProducingEditor`, `MockupEditor`, `ReliabilityEditor`) |
| `ai/` | `AiPanel.tsx` — chat stream, patch proposal cards, revert button |
| `history/` | `VersionHistoryPanel.tsx` — 200-row list, restore + delete |
| `analysis/` | `AnalysisPanel.tsx`, `Scorecard.tsx`, `FindingsList.tsx`, `AnalysisRunner.tsx` |
| `command/` | `CommandPalette.tsx` (`Cmd+K`) |
| `projects/` | `WorkspaceMenu.tsx` — project switcher + templates |
| `shortcuts/` | `Shortcuts.tsx` — global hotkeys (`Cmd+Z`, `Cmd+I`, `Cmd+Shift+H`, …) |
| `layout/` | `TopBar.tsx` |
| `library/` | left `Sidebar` — Architecture / Analysis / Changelog tabs |
| `help/` | `HelpModal` (`Shift+?`) |
| `ui/` | `Icon`, `QuickStats`, shared primitives |

## State management decisions

### Two kinds of "history" — why are they separate?

| | `zundo` (in-session) | `versions` table (persistent) |
|---|---|---|
| Scope | last 80 setStates | last 200 meaningful actions |
| Visibility | Cmd+Z only | Sidebar list with label, time, summary |
| Storage | memory (lost on refresh) | IndexedDB |
| Trigger | every setState (250 ms drag coalesce) | AI patch / manual / auto-layout / idle / pre-restore |
| Restore | Cmd+Z step-by-step | jump to any point + safety snapshot |

Wiring them together looked tempting but `zundo` swallows every micro-setState; what the user sees as a "version" is a *meaningful action*. Hence two layers, decoupled.

### Snapshot vs reverse-patch

`patches.ts` uses **snapshot-based revert** (not RFC 6902 reverse patches). Reason: capability `set_*` ops merge differently per strategy, so synthesizing a reverse op is fragile. Deep-clone snapshots are cheap and unambiguous.

### Ring buffer FIFO

`pruneOldVersions` deletes the oldest rows per project via the compound index in a single `bulkDelete` — never loads everything into memory. The cap is `MAX_VERSIONS_PER_PROJECT`.

### Static-first, AI-second analysis

Every AI Copilot quick action involving structure (Architecture review, What-if, CAP audit, Latency budget) runs the deterministic analyzer suite first and folds its markdown report into the prompt. The LLM enriches and prioritizes; it does not re-derive structural facts that the analyzers already know. This keeps results consistent on small local models (LM Studio at 4–8 K context) and trims token cost.

## Patch protocol (summary)

The LLM emits a JSON patch list inside a fence:
```json
[
  { "op": "add_node", "type": "redis", "label": "Cache" },
  { "op": "add_edge", "from": "$last", "to": "service-1", "protocol": "redis" },
  { "op": "set_reliability", "id": "pg", "value": { "cap": "CP", "pacelc": "PC/EC", "replicas": 3 } }
]
```
Ops: `add_node`, `add_edge`, `add_group`, `update_node`, `update_edge`, `remove_node`, `remove_edge`, `set_*` (capability ops). See `docs/AI_INTEGRATION.md`.
