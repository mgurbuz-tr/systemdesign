# Graph Report - /Users/mustafagurbuz/Desktop/system-design-editor  (2026-05-02)

## Corpus Check
- 95 files · ~112,690 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 372 nodes · 395 edges · 66 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]

## God Nodes (most connected - your core abstractions)
1. `send()` - 13 edges
2. `applyPatches()` - 10 edges
3. `runAllAnalyses()` - 9 edges
4. `uid()` - 7 edges
5. `CapabilityRegistry` - 7 edges
6. `add()` - 6 edges
7. `getRecorder()` - 6 edges
8. `restoreVersion()` - 6 edges
9. `exportMermaid()` - 6 edges
10. `findCatalogItem()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `remove()` --calls--> `downloadDataUrl()`  [INFERRED]
  /Users/mustafagurbuz/Desktop/system-design-editor/src/components/inspector/ApiEndpointEditor.tsx → /Users/mustafagurbuz/Desktop/system-design-editor/src/lib/export/index.ts
- `add()` --calls--> `criticalEdgePairs()`  [INFERRED]
  /Users/mustafagurbuz/Desktop/system-design-editor/src/components/inspector/ApiEndpointEditor.tsx → /Users/mustafagurbuz/Desktop/system-design-editor/src/lib/store/analysisStore.ts
- `send()` --calls--> `serializeGraph()`  [INFERRED]
  /Users/mustafagurbuz/Desktop/system-design-editor/src/components/ai/AiPanel.tsx → /Users/mustafagurbuz/Desktop/system-design-editor/src/lib/ai/canvasContext.ts
- `insertNode()` --calls--> `findCatalogItem()`  [INFERRED]
  /Users/mustafagurbuz/Desktop/system-design-editor/src/components/command/CommandPalette.tsx → /Users/mustafagurbuz/Desktop/system-design-editor/src/lib/catalog/index.ts
- `async()` --calls--> `getRecorder()`  [INFERRED]
  /Users/mustafagurbuz/Desktop/system-design-editor/src/components/command/CommandPalette.tsx → /Users/mustafagurbuz/Desktop/system-design-editor/src/lib/persistence/versionRecorder.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (18): onClearThread(), async(), insertNode(), loadTemplate(), clearConversation(), loadProject(), saveSnapshot(), SDDatabase (+10 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (0): 

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (18): recordAiPatchVersion(), startAutoSave(), deepClone(), formatRelativeTime(), restoreVersion(), async(), onDelete(), onRestore() (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (12): attrFillHandler(), finalizeAssistantMessage(), promptHandler(), promptPayloadHandler(), runConnectionCheck(), send(), authHeaders(), checkConnection() (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (9): add(), addEndpoint(), ensureBlock(), remove(), removeEndpoint(), updateBlock(), updateEndpoint(), BroadcastChannelTransport (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (16): applyPatches(), defaultProtocolFor(), describePatch(), extractTopLevelObjects(), findEmptyPosition(), getLastJsonError(), injectMissingCommas(), parseLenientJson() (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (2): App(), useTweaks()

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (8): runCapAudit(), computeBottlenecks(), computeCriticalPaths(), runAllAnalyses(), classifyReadWritePaths(), effectiveEdgeLatencyMs(), buildScorecard(), findSpofs()

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (8): bottleneckFor(), criticalEdgePairs(), isArticulationPoint(), canonicalNode(), serializeGraph(), findCatalogItem(), buildNodeFromPatch(), SDNodeImpl()

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (5): autoLayout(), getElk(), buildTemplateWithAutoLayout(), findTemplate(), resetToTemplate()

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (5): listKnownOps(), buildCapabilityMatrix(), buildSystemMessage(), buildTaskModeInstructions(), CapabilityRegistry

### Community 11 - "Community 11"
Cohesion: 0.38
Nodes (11): captureCanvas(), downloadBlob(), downloadDataUrl(), escapeMermaid(), exportJson(), exportMermaid(), exportPng(), exportSvg() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (6): sendHybridReview(), askAi(), askAiAboutNode(), askAiForCapability(), askAiWithTask(), fire()

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 0.4
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): patch(), patchSlo()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (2): patchValue(), validateAiProposal()

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 26`** (2 nodes): `Icon()`, `icons.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `onClick()`, `FindingsList.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `AnalysisRunner()`, `AnalysisRunner.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `CursorMarker()`, `CursorMarker.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `EdgeProtocolEditor()`, `EdgeProtocolEditor.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `QuickStats()`, `QuickStats.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `cn()`, `TopBar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `WorkspaceMenu.tsx`, `WorkspaceMenu()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `usePresence()`, `usePresence.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `CommentNodeImpl()`, `CommentNode.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `GroupNodeImpl()`, `GroupNode.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `Shortcuts()`, `Shortcuts.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `onKey()`, `HelpModal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `endpointKey()`, `api.capability.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `pickDefaultColor()`, `identityStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `defaultProtocolFor()`, `canvasStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `audit-templates.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `data.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `Icon.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `ScheduledEditor.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `ConsumingEditor.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `CursorOverlay.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `ProtocolEdge.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `consuming.capability.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `scheduled.capability.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `producing.capability.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `schema.capability.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `settingsStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `projectStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `presenceStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `aiUiStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `send()` connect `Community 3` to `Community 0`, `Community 8`, `Community 10`, `Community 7`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `uid()` connect `Community 0` to `Community 8`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `runAllAnalyses()` connect `Community 7` to `Community 3`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `send()` (e.g. with `scanIssues()` and `formatIssuesMarkdown()`) actually correct?**
  _`send()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `applyPatches()` (e.g. with `deepClone()` and `.byPatchOp()`) actually correct?**
  _`applyPatches()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `runAllAnalyses()` (e.g. with `send()` and `scanIssues()`) actually correct?**
  _`runAllAnalyses()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `uid()` (e.g. with `addScreen()` and `send()`) actually correct?**
  _`uid()` has 6 INFERRED edges - model-reasoned connections that need verification._