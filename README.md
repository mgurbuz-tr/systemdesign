# System Design Editor

Local-first, canvas-based system architecture editor. Drag PostgreSQL, Redis, Kafka, gateways, mobile/web clients onto the canvas; argue about the design with a local LLM running on LM Studio; let it propose **reversible patches** that you approve. Everything lives in IndexedDB — nothing leaves the browser.

## Quick start

Requirements:
- Node 18+
- pnpm (recommended) or npm
- For local AI: [LM Studio](https://lmstudio.ai/) and a chat model

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Build:
```bash
pnpm typecheck
pnpm build
pnpm preview
```

## Highlights

- **Reversible AI patches** — When the LLM says "add a Redis", the editor applies an atomic patch to nodes/edges and stores the pre-apply snapshot. One click reverts.
- **System Architect Analysis Suite** — Sidebar **Analysis** tab runs deterministic analyzers (SPOF / Tarjan, weighted bottleneck centrality, longest-latency critical paths, read/write classifier, CAP audit) and produces a 6-pillar scorecard (Reliability / Performance / Cost / Security / Operations / Consistency). Canvas overlays toggle SPOF rings, heat-map, and critical-path edges. AI Copilot quick actions (Architecture review, What-if X fails?, CAP audit, Latency budget) feed the analyzer report into the LLM prompt.
- **CAP / PACELC annotation** — Every service / data / cache / queue / ai / edge node gets a Reliability tab: CAP profile, PACELC mode, consistency model, SLO targets (p99 ms / availability / RPS), replicas, redundancy, failure modes. AI-fillable via `set_reliability` patch op.
- **200-step persistent version history** — Every meaningful action (AI patch, manual save, auto-layout, zundo step) writes a snapshot. Sidebar **Changelog** tab restores any version after a safety snapshot.
- **Capability-driven inspector** — Per-node tabs (`schema`, `api`, `consuming`, `scheduled`, `producing`, `reliability`) generated from the registry; new capabilities plug in via one file.
- **80-step in-session undo** (`Cmd+Z` / `Cmd+Shift+Z`) — independent from the version history; coalesces drag storms.
- **Auto-layout** — ELK top-bottom or left-right.
- **Command Palette** (`Cmd+K`) — components, templates, AI quick actions, version management.

## Folder map

```
src/
  App.tsx                    # main layout + AnalysisRunner mount
  components/
    canvas/                  # React Flow + Toolbar + custom nodes/edges (SPOF + heat-map + critical-path overlays)
    inspector/               # Inspector + capability editors (incl. ReliabilityEditor)
    ai/                      # AiPanel + patch proposal cards
    history/                 # VersionHistoryPanel
    analysis/                # AnalysisPanel, Scorecard, FindingsList, AnalysisRunner
    command/                 # Cmd+K palette
    projects/                # WorkspaceMenu
    shortcuts/               # global hotkeys
    layout/                  # TopBar
    library/                 # left Sidebar (Architecture / Analysis / Changelog)
    ui/                      # Icon, primitives
  lib/
    store/                   # canvas, project, settings, aiUi, analysis stores
    persistence.ts           # autosave + project lifecycle
    persistence/             # versions repository, recorder, restore
    db/database.ts           # Dexie schema
    ai/                      # askAi, patches, prompts, issues, canvasContext
    analysis/                # spof, centrality, criticalPath, readWritePath, capAudit, scorer
    capabilities/            # node capability registry (incl. reliability)
    catalog/                 # component catalog
    templates/               # pre-built architectures
    layout/elk.ts            # auto-layout
  types/index.ts             # domain types
  styles/globals.css         # design tokens + tailwind
```

For deeper detail see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for the AI side see [`docs/AI_INTEGRATION.md`](./docs/AI_INTEGRATION.md).

## LM Studio setup

1. Install LM Studio and download a chat model (e.g. `qwen2.5-coder-7b-instruct`).
2. Start the **Local Server** tab (default `http://localhost:1234`).
3. In the editor, open Settings and fill in `LM Studio Base URL` (and a Bearer token if your LM Studio version requires one).
4. Open the AI panel (`Cmd+I`) and start chatting.

Newer LM Studio versions enable Bearer auth by default — the editor supports it.

## CHANGELOG

Release notes in [`CHANGELOG.md`](./CHANGELOG.md). The in-app 200-step history tracks edits inside one project; the CHANGELOG tracks released versions.

## License

Internal use — license not yet specified.
