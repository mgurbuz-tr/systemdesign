import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/Icon';
import { useSettings } from '@/lib/store/settingsStore';
import { useCanvas } from '@/lib/store/canvasStore';
import { useProject } from '@/lib/store/projectStore';
import { checkConnection, streamChat, type ChatMessage } from '@/lib/ai/client';
import {
  buildSystemMessage,
  type AiTaskDescriptor,
  type AiTaskMode,
  type BuildPromptOpts,
} from '@/lib/ai/prompts';
import { serializeGraph } from '@/lib/ai/canvasContext';
import {
  parsePatches,
  stripPatchFences,
  applyPatches,
  revertToSnapshot,
  describePatch,
  type AiPatch,
  type PatchSnapshot,
} from '@/lib/ai/patches';
import {
  loadConversation,
  saveConversation,
  clearConversation,
} from '@/lib/db/database';
import { scanIssues, formatIssuesMarkdown } from '@/lib/ai/issues';
import type { AiPromptPayload, AttrFillRequest } from '@/lib/ai/askAi';
import { useAiUi } from '@/lib/store/aiUiStore';
import { validateAiProposal } from '@/lib/ai/validation';
import { cn, uid } from '@/lib/utils';

type PatchProposalState = 'proposed' | 'applied' | 'reverted' | 'discarded';

interface PatchProposal {
  id: string;
  patches: AiPatch[];
  errors: string[];
  state: PatchProposalState;
  /** Captured at apply-time, used to revert later. */
  snapshot?: PatchSnapshot;
  appliedAt?: number;
  warnings?: string[];
  /**
   * Short rationale extracted from the assistant text immediately preceding
   * the patch fence — the "why". Surfaced on the proposal card and folded
   * into the version-history label so users don't have to scroll back up
   * to remember what the AI was justifying.
   */
  reason?: string;
}

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  ts: number;
  proposals?: PatchProposal[];
}

const ISSUE_SCAN_KEY = '__issue_scan__';
const ARCH_REVIEW_KEY = '__arch_review__';
const WHAT_IF_KEY = '__what_if__';
const CAP_AUDIT_KEY = '__cap_audit__';
const LATENCY_BUDGET_KEY = '__latency_budget__';

const QUICK_ACTIONS: {
  label: string;
  prompt: string;
  taskMode: AiTaskMode;
}[] = [
  {
    label: 'Architecture review',
    prompt: ARCH_REVIEW_KEY,
    taskMode: 'annotate_architecture',
  },
  {
    label: 'What-if fails?',
    prompt: WHAT_IF_KEY,
    taskMode: 'annotate_architecture',
  },
  {
    label: 'CAP audit',
    prompt: CAP_AUDIT_KEY,
    taskMode: 'annotate_architecture',
  },
  {
    label: 'Latency budget',
    prompt: LATENCY_BUDGET_KEY,
    taskMode: 'annotate_architecture',
  },
  {
    label: 'Issue scan',
    prompt: ISSUE_SCAN_KEY,
    taskMode: 'analyze_only',
  },
  {
    label: 'Find bottlenecks',
    prompt:
      'Which node will bottleneck in this architecture and why? Walk through specific traffic paths.',
    taskMode: 'annotate_architecture',
  },
  {
    label: 'Suggest cache',
    prompt:
      'Where should I add caching in this system? Infer the read patterns, suggest, and emit applicable patches.',
    taskMode: 'annotate_architecture',
  },
  {
    label: 'Schema review',
    prompt:
      'Review my DB schemas: any missing indexes, FKs, or things that should be denormalized?',
    taskMode: 'annotate_architecture',
  },
  {
    label: 'Security gaps',
    prompt:
      'What gaps does this system have around auth, secrets, and edge security?',
    taskMode: 'annotate_architecture',
  },
  {
    label: 'Estimate cost',
    prompt:
      'Make a quick Fermi estimate: roughly what is the monthly infra cost for medium traffic (1k RPS)?',
    taskMode: 'analyze_only',
  },
];

const WELCOME_MSG: UiMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi — your system architect. I can see the canvas. If you want changes, I'll propose patches that you approve first.",
  ts: Date.now(),
};

export function AiPanel() {
  const {
    aiOpen,
    setAiOpen,
    lmStudioBaseUrl,
    setLmStudioBaseUrl,
    lmStudioApiKey,
    setLmStudioApiKey,
    lmStudioModel,
    setLmStudioModel,
    aiTemperature,
    setAiTemperature,
    aiContextPolicy,
    setAiContextPolicy,
  } = useSettings();
  const projectId = useProject((s) => s.current?.id);
  const setPendingPatchCount = useAiUi((s) => s.setPendingPatchCount);

  const [messages, setMessages] = useState<UiMessage[]>([WELCOME_MSG]);
  const [draft, setDraft] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [connDetail, setConnDetail] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<number | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Load thread when project changes / panel opens.
  useEffect(() => {
    if (!projectId) return;
    if (loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    loadConversation(projectId).then((stored) => {
      if (stored && Array.isArray(stored) && stored.length > 0) {
        setMessages(stored as UiMessage[]);
      } else {
        setMessages([WELCOME_MSG]);
      }
    });
  }, [projectId]);

  // Patch-pending lock köprüsü — Inspector buradan disabled durumunu okur.
  // 'proposed' state'teki her proposal kullanıcı eylemi (apply/discard)
  // bekliyor; bu sayı 0'a düşene kadar manuel inspector edit'leri kilitli.
  useEffect(() => {
    const count = messages.reduce(
      (sum, m) =>
        sum + (m.proposals?.filter((p) => p.state === 'proposed').length ?? 0),
      0,
    );
    setPendingPatchCount(count);
  }, [messages, setPendingPatchCount]);

  // Debounced persistence.
  useEffect(() => {
    if (!projectId) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      // Don't persist while a stream is in-flight to keep the on-disk content
      // consistent — saved snapshot will land when the stream ends.
      if (busy) return;
      const toSave = messages.filter((m) => m.id !== 'welcome' || messages.length > 1);
      saveConversation(projectId, toSave).catch(console.error);
    }, 350);
  }, [messages, busy, projectId]);

  useEffect(() => {
    if (!aiOpen) return;
    runConnectionCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOpen, lmStudioBaseUrl, lmStudioApiKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  useEffect(() => {
    const promptHandler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === 'string') send(ce.detail);
    };
    const promptPayloadHandler = (e: Event) => {
      const ce = e as CustomEvent<AiPromptPayload>;
      const payload = ce.detail;
      if (!payload?.prompt) return;
      send(payload.prompt, { task: payload.task });
    };
    const attrFillHandler = (e: Event) => {
      const ce = e as CustomEvent<AttrFillRequest>;
      const req = ce.detail;
      if (!req) return;
      const modeLabel =
        req.mode === 'replace' ? 'Suggest from scratch' : 'Fill missing';
      const userText =
        `Suggest **${req.capabilityLabel}** (${modeLabel}) — node: ${req.nodeLabel}`;
      send(userText, {
        attributeFill: {
          nodeId: req.nodeId,
          capabilityId: req.capabilityId,
          mode: req.mode,
        },
      });
    };
    window.addEventListener('sd:ai-prompt', promptHandler);
    window.addEventListener('sd:ai-prompt-payload', promptPayloadHandler);
    window.addEventListener('sd:ai-attr-fill', attrFillHandler);
    return () => {
      window.removeEventListener('sd:ai-prompt', promptHandler);
      window.removeEventListener('sd:ai-prompt-payload', promptPayloadHandler);
      window.removeEventListener('sd:ai-attr-fill', attrFillHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runConnectionCheck = async () => {
    const r = await checkConnection(lmStudioBaseUrl, lmStudioApiKey);
    setConn(r.ok ? 'ok' : 'fail');
    setConnDetail(r.detail);
    if (r.needsAuth) setShowSettings(true);
  };

  const finalizeAssistantMessage = (
    id: string,
    task: AiTaskDescriptor,
    attributeFill?: BuildPromptOpts['attributeFill'],
  ) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== id) return m;
        // MERGE all fenced blocks in one assistant message into a single
        // proposal. Models often split patches across separate ```json
        // fences (one per suggestion), which would otherwise scope `ref`s
        // to that block only — add_edge in block #2 can't see refs from
        // block #1. Merging gives a shared scope and a single Apply.
        const blocks = parsePatches(m.content);
        const allPatches = blocks.flatMap((b) => b.patches);
        const allErrors = blocks.flatMap((b) => b.errors);
        const reason = extractReason(m.content);
        const validationWarnings = validateAiProposal(allPatches, {
          task,
          attributeFill,
          nodes: useCanvas.getState().nodes,
          edges: useCanvas.getState().edges,
        });
        const proposals: PatchProposal[] =
          allPatches.length > 0 || allErrors.length > 0
            ? [
                {
                  id: uid('prop'),
                  patches: allPatches,
                  errors: allErrors,
                  state: 'proposed' as const,
                  warnings: validationWarnings,
                  reason,
                },
              ]
            : [];
        return { ...m, streaming: false, proposals };
      }),
    );
  };

  const send = async (
    override?: string,
    opts?: {
      attributeFill?: BuildPromptOpts['attributeFill'];
      task?: Partial<AiTaskDescriptor>;
    },
  ) => {
    let text = (override ?? draft).trim();
    if (!text || busy) return;
    setDraft('');

    // Issue Scan: run local heuristic first, fold findings into the prompt.
    if (text === ISSUE_SCAN_KEY) {
      const { nodes, edges } = useCanvas.getState();
      const found = scanIssues(nodes, edges);
      const md = formatIssuesMarkdown(found);
      text =
        `I want an issue scan. The local heuristic caught:\n\n${md}\n\n` +
        `Validate these and add any other architectural / scalability / security concerns you spot. ` +
        `End with a prioritized 3-item action list. ` +
        `If you propose a concrete change, include an sd-patch block.`;
    }

    // Architecture review — multi-pillar audit using the deterministic
    // analyzer suite, then ask the model to enrich and prioritize.
    if (text === ARCH_REVIEW_KEY) {
      const { nodes, edges } = useCanvas.getState();
      const { runAllAnalyses } = await import('@/lib/analysis');
      const { formatAnalysisMarkdown } = await import('@/lib/analysis/format');
      const report = runAllAnalyses(nodes, edges);
      const md = formatAnalysisMarkdown(report, nodes);
      text =
        `Run a full architecture review. Static analysis below:\n\n${md}\n\n` +
        `Write a 6-pillar review (Reliability, Performance, Cost, Security, Operations, Consistency). ` +
        `For each pillar give 1-2 priority recommendations. End with a ranked top-3 action list. ` +
        `If a recommendation is concretely applicable, append an sd-patch block.`;
    }

    // What-if X fails — pick selected node, else top bottleneck.
    if (text === WHAT_IF_KEY) {
      const { nodes, edges, selectedNodeId } = useCanvas.getState();
      const { runAllAnalyses } = await import('@/lib/analysis');
      const report = runAllAnalyses(nodes, edges);
      const targetId =
        selectedNodeId && nodes.some((n) => n.id === selectedNodeId)
          ? selectedNodeId
          : report.bottlenecks[0]?.nodeId;
      if (!targetId) {
        toast.error('No node to simulate failure for.');
        return;
      }
      const target = nodes.find((n) => n.id === targetId);
      const isSpof = report.spof.articulationPoints.includes(targetId);
      const downstream = edges
        .filter((e) => e.source === targetId)
        .map((e) => e.target);
      const upstream = edges
        .filter((e) => e.target === targetId)
        .map((e) => e.source);
      const labelOf = (id: string) =>
        nodes.find((n) => n.id === id)?.data.label ?? id;
      text =
        `Failure simulation: assume **${target?.data.label ?? targetId}** (${targetId}) goes down.\n\n` +
        `- Articulation point: ${isSpof ? 'YES — graph splits' : 'no'}\n` +
        `- Direct upstream callers: ${
          upstream.length ? upstream.map(labelOf).join(', ') : '—'
        }\n` +
        `- Direct downstream dependencies: ${
          downstream.length ? downstream.map(labelOf).join(', ') : '—'
        }\n\n` +
        `Walk through the blast radius (which user flows break, which fall back), the recovery path, and 2-3 mitigations (redundancy, circuit breaker, queue absorbing load, …). ` +
        `If a mitigation is concretely applicable here, append an sd-patch block.`;
    }

    // CAP audit — combine reliability annotations + cap-audit findings.
    if (text === CAP_AUDIT_KEY) {
      const { nodes, edges } = useCanvas.getState();
      const { runAllAnalyses } = await import('@/lib/analysis');
      const report = runAllAnalyses(nodes, edges);
      const annotated = nodes
        .filter((n) => n.data.reliability)
        .map((n) => {
          const r = n.data.reliability!;
          return `- ${n.id} (${n.data.label}): cap=${r.cap ?? '?'} pacelc=${r.pacelc ?? '?'} consistency=${r.consistencyModel ?? '?'} replicas=${r.replicas ?? '?'}`;
        })
        .join('\n');
      const findings = report.findings.filter((f) =>
        ['cap-mismatch', 'low-availability-target', 'unreplicated-spof'].includes(
          f.code,
        ),
      );
      const findingsBlock = findings.length
        ? findings
            .map(
              (f) => `- [${f.severity}] ${f.code} — ${f.message}`,
            )
            .join('\n')
        : '_(no static mismatches detected)_';
      text =
        `CAP / PACELC audit. Current annotations:\n\n${annotated || '_(none)_'}\n\n` +
        `Static mismatches:\n\n${findingsBlock}\n\n` +
        `Identify CAP/PACELC issues, suggest the right profile per data-store given how it is used, and propose set_reliability patches for nodes missing annotations.`;
    }

    // Latency budget — top critical paths + SLO targets.
    if (text === LATENCY_BUDGET_KEY) {
      const { nodes, edges } = useCanvas.getState();
      const { runAllAnalyses } = await import('@/lib/analysis');
      const report = runAllAnalyses(nodes, edges);
      const labelOf = (id: string) =>
        nodes.find((n) => n.id === id)?.data.label ?? id;
      const paths = report.criticalPaths.length
        ? report.criticalPaths
            .map(
              (p, i) =>
                `${i + 1}. ${p.path.map(labelOf).join(' → ')} · ~${p.totalLatencyMs}ms p99`,
            )
            .join('\n')
        : '_(no client→data paths detected — add a client/edge node first)_';
      const slos = nodes
        .filter((n) => n.data.reliability?.slo?.latencyP99Ms)
        .map(
          (n) =>
            `- ${n.data.label}: target ${n.data.reliability!.slo!.latencyP99Ms}ms`,
        )
        .join('\n');
      text =
        `Latency budget review. Top critical paths:\n\n${paths}\n\n` +
        `SLO targets:\n\n${slos || '_(no SLOs set)_'}\n\n` +
        `For each path evaluate p99 budget vs SLO. Suggest concrete fixes (caching, batching, async, co-location, replica routing) and emit set_reliability or add_node patches when applicable.`;
    }

    const userMsg: UiMessage = {
      id: uid('m'),
      role: 'user',
      content: text,
      ts: Date.now(),
    };
    const assistantId = uid('r');
    const assistantMsg: UiMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setBusy(true);

    const { nodes, edges, selectedNodeId } = useCanvas.getState();
    // Attribute-fill akışında selection'ı request'teki node'a sabitle ki
    // SELECTED bloğu doğru node'u detaylı render etsin.
    const focusedNodeId = opts?.attributeFill?.nodeId ?? selectedNodeId;
    const graphMd = serializeGraph(nodes, edges, {
      selectedNodeId: focusedNodeId,
    });

    const inferTaskMode = (): AiTaskMode => {
      if (opts?.task?.mode) return opts.task.mode;
      if (opts?.attributeFill) return 'fill_capability';
      if (/\b(no patch|review only|just analyze|analysis only|explain only)\b/i.test(text)) {
        return 'analyze_only';
      }
      if (/\b(split|microservice|decompose|bounded context|refactor|break up|break apart)\b/i.test(text)) {
        return 'refactor_graph';
      }
      if (/\b(review|audit|bottleneck|latency|security|consistency|cap|pacelc|what-if|issue scan|cost)\b/i.test(text)) {
        return 'annotate_architecture';
      }
      return 'annotate_architecture';
    };

    const taskMode = inferTaskMode();
    const task: AiTaskDescriptor = {
      mode: taskMode,
      anchorNodeId: focusedNodeId,
      allowRelatedUpdates:
        opts?.task?.allowRelatedUpdates ??
        (!!opts?.attributeFill || taskMode === 'refactor_graph'),
      objective: opts?.task?.objective ?? text,
    };

    // Models routinely "forget" to emit sd-patch blocks even when the user
    // clearly asked for changes. When trigger verbs are present, append a
    // hard reminder right before the model generates its response.
    const wantsChange = /\b(patch|add|remove|delete|change|edit|apply|connect|wire|suggest|fill|propose|insert|rewrite)\b/i.test(
      text,
    );
    const isAttrFill = !!opts?.attributeFill;
    const finalUserText = isAttrFill
      ? text // The ATTR_FILL block in the system prompt already enforces the contract.
      : wantsChange
        ? `${text}\n\n_(NOTE: This message asks for a change — a \`\`\`sd-patch [...] block at the end of your reply is REQUIRED. A bare list is NOT enough.)_`
        : text;

    // Aggressive history trim — local models often have tight context
    // (LM Studio defaults to 4K). Keep only the most recent turns and strip
    // <think>...</think> blocks (reasoning model artifacts that waste budget).
    const RECENT_TURNS =
      aiContextPolicy === 'full'
        ? 12
        : aiContextPolicy === 'balanced'
          ? taskMode === 'refactor_graph'
            ? 8
            : 6
          : taskMode === 'refactor_graph'
            ? 6
            : 4;
    const recentMessages = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-RECENT_TURNS * 2);
    const stripThink = (s: string) =>
      s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    const history: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemMessage(graphMd, {
          task,
          attributeFill: opts?.attributeFill,
        }),
      },
      ...recentMessages.map(
        (m): ChatMessage => ({
          role: m.role,
          content: stripThink(m.content),
        }),
      ),
      { role: 'user', content: finalUserText },
    ];

    abortRef.current = new AbortController();

    try {
      await streamChat({
        baseUrl: lmStudioBaseUrl,
        apiKey: lmStudioApiKey,
        model: lmStudioModel,
        temperature:
          taskMode === 'fill_capability'
            ? Math.min(aiTemperature, 0.12)
            : taskMode === 'refactor_graph'
              ? Math.min(aiTemperature, 0.18)
              : aiTemperature,
        messages: history,
        signal: abortRef.current.signal,
        onToken: (delta) => {
          setMessages((all) =>
            all.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + delta }
                : m,
            ),
          );
        },
        onError: (err) => {
          console.error(err);
        },
      });
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError';
      if (!isAbort) {
        toast.error(`AI error: ${(err as Error).message ?? 'unknown'}`);
        setMessages((all) =>
          all.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    '_Could not reach LM Studio. Check the base URL in Settings or make sure the "Local Server" is running in LM Studio._',
                }
              : m,
          ),
        );
      }
    } finally {
      finalizeAssistantMessage(assistantId, task, opts?.attributeFill);
      setBusy(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const onApply = (msgId: string, propId: string) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== msgId) return m;
        const proposals = (m.proposals ?? []).map((p) => {
          if (p.id !== propId) return p;
          if (p.state !== 'proposed') return p;
          // Pass the extracted rationale into applyPatches so the
          // version-history row shows "AI: <reason>" instead of just op counts.
          const result = applyPatches(p.patches, p.reason);
          if (result.warnings.length > 0) {
            toast.warning(`${result.warnings.length} warning(s) — see console`);
            console.warn('Patch warnings:', result.warnings);
          }
          // Toast prefers the AI's "why"; falls back to a per-patch digest if
          // no reason was extracted, and finally to a bare count.
          const summaries = p.patches
            .map((patch) => describePatch(patch))
            .filter(Boolean);
          const toastMsg = p.reason
            ? `Applied · ${p.reason.length > 80 ? p.reason.slice(0, 77) + '…' : p.reason}`
            : summaries.length === 1
              ? `Applied · ${summaries[0]}`
              : `Applied · ${result.applied} change(s)`;
          toast.success(toastMsg);

          // Tell the Inspector to switch to the affected capability tab so
          // the user sees the new state immediately.
          for (const patch of p.patches) {
            const op = (patch as { op?: string }).op;
            const id = (patch as { id?: string }).id;
            if (typeof op === 'string' && op.startsWith('set_') && id) {
              window.dispatchEvent(
                new CustomEvent('sd:capability-applied', {
                  detail: { nodeId: id, capabilityId: op.slice(4) },
                }),
              );
              break; // single tab focus is enough; pick the first set_*
            }
          }

          return {
            ...p,
            state: 'applied' as const,
            snapshot: result.snapshot,
            appliedAt: Date.now(),
            warnings: [...(p.warnings ?? []), ...result.warnings],
          };
        });
        return { ...m, proposals };
      }),
    );
  };

  const onDiscard = (msgId: string, propId: string) => {
    setMessages((all) =>
      all.map((m) =>
        m.id === msgId
          ? {
              ...m,
              proposals: (m.proposals ?? []).map((p) =>
                p.id === propId && p.state === 'proposed'
                  ? { ...p, state: 'discarded' as const }
                  : p,
              ),
            }
          : m,
      ),
    );
  };

  const onRevert = (msgId: string, propId: string) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== msgId) return m;
        const proposals = (m.proposals ?? []).map((p) => {
          if (p.id !== propId || p.state !== 'applied' || !p.snapshot) return p;
          revertToSnapshot(p.snapshot);
          toast.success('Change reverted');
          return { ...p, state: 'reverted' as const };
        });
        return { ...m, proposals };
      }),
    );
  };

  const onReapply = (msgId: string, propId: string) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== msgId) return m;
        const proposals = (m.proposals ?? []).map((p) => {
          if (p.id !== propId || p.state !== 'reverted') return p;
          const result = applyPatches(p.patches);
          toast.success(`${result.applied} change(s) reapplied`);
          return {
            ...p,
            state: 'applied' as const,
            snapshot: result.snapshot,
            appliedAt: Date.now(),
            warnings: result.warnings,
          };
        });
        return { ...m, proposals };
      }),
    );
  };

  const onClearThread = () => {
    if (!projectId) return;
    setMessages([WELCOME_MSG]);
    clearConversation(projectId).catch(console.error);
  };

  if (!aiOpen) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setAiOpen(true)}
        className="absolute bottom-4 right-4 flex h-9 items-center gap-1.5 rounded-full border border-border bg-panel px-3.5 text-[12px] font-medium text-text shadow-panel hover:bg-hover"
        style={{ zIndex: 20 }}
      >
        <Icon name="sparkles" size={13} color="var(--accent)" />
        Ask AI
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      <motion.aside
        key="ai-panel"
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 380, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex flex-col overflow-hidden border-l border-border bg-panel"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Icon name="sparkles" size={13} />
          </span>
          <div className="flex-1 leading-tight">
            <div className="text-[12.5px] font-semibold text-text">AI Copilot</div>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-text-dim hover:text-text"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    conn === 'ok' ? '#7c9c5e' : conn === 'fail' ? '#c96442' : '#8a8a85',
                }}
              />
              <span>
                {conn === 'ok'
                  ? `Connected · ${connDetail}`
                  : conn === 'fail'
                    ? 'Disconnected — click to configure'
                    : 'Checking…'}
              </span>
            </button>
          </div>
          <button
            onClick={onClearThread}
            title="Clear thread"
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-dim hover:bg-hover hover:text-text"
            aria-label="Clear thread"
          >
            <Icon name="trash" size={12} />
          </button>
          <button
            onClick={() => setAiOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-dim hover:bg-hover hover:text-text"
            aria-label="Close AI panel"
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden border-b border-border bg-input/40 px-3.5 py-2.5"
            >
              <label className="block">
                <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  LM Studio base URL
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    value={lmStudioBaseUrl}
                    onChange={(e) => setLmStudioBaseUrl(e.target.value)}
                    placeholder="http://localhost:1234"
                    className="h-7 flex-1 rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={runConnectionCheck}
                    className="rounded-md border border-border bg-input px-2 py-1 text-[10.5px] text-text hover:bg-hover"
                  >
                    Test
                  </button>
                </div>
              </label>
              <label className="mt-2 block">
                <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  API key (Bearer · optional)
                </span>
                <input
                  type="password"
                  value={lmStudioApiKey}
                  onChange={(e) => setLmStudioApiKey(e.target.value)}
                  placeholder="lms-… (leave empty if LM Studio auth is off)"
                  className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                />
              </label>
              <label className="mt-2 block">
                <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Model
                </span>
                <input
                  value={lmStudioModel}
                  onChange={(e) => setLmStudioModel(e.target.value)}
                  placeholder="local-model"
                  className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                />
              </label>
              <label className="mt-2 block">
                <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Temperature
                </span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={aiTemperature}
                  onChange={(e) =>
                    setAiTemperature(Math.max(0, Math.min(1, Number(e.target.value) || 0)))
                  }
                  className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                />
              </label>
              <label className="mt-2 block">
                <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  Context policy
                </span>
                <select
                  value={aiContextPolicy}
                  onChange={(e) =>
                    setAiContextPolicy(
                      e.target.value as 'compact' | 'balanced' | 'full',
                    )
                  }
                  className="h-7 w-full rounded-md border border-border bg-input px-2 text-[11px] text-text focus:border-accent focus:outline-none"
                >
                  <option value="compact">Compact</option>
                  <option value="balanced">Balanced</option>
                  <option value="full">Full</option>
                </select>
              </label>
              <p className="mt-1.5 text-[10px] text-text-dim">
                Start LM Studio's Local Server. Newer versions enable Settings → Developer → "Require API key" by default.
                {connDetail && conn === 'ok' && (
                  <span className="ml-1 text-[#7c9c5e]">✓ {connDetail}</span>
                )}
                {conn === 'fail' && (
                  <span className="ml-1 text-[#c96442]">⚠ {connDetail}</span>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto px-3.5 py-3">
          {messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              onApply={(propId) => onApply(m.id, propId)}
              onDiscard={(propId) => onDiscard(m.id, propId)}
              onRevert={(propId) => onRevert(m.id, propId)}
              onReapply={(propId) => onReapply(m.id, propId)}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q.label}
              onClick={() =>
                send(q.prompt, {
                  task: {
                    mode: q.taskMode,
                    objective: q.label,
                    allowRelatedUpdates: true,
                  },
                })
              }
              disabled={busy}
              className="rounded-full border border-border bg-input px-2.5 py-1 text-[10.5px] text-text-dim hover:bg-hover hover:text-text disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-1.5 border-t border-border p-2.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask something about your system…"
            rows={1}
            disabled={busy}
            className="max-h-24 flex-1 resize-none rounded-lg border border-border bg-input px-2.5 py-1.5 text-[12px] text-text placeholder:text-text-dim focus:border-accent focus:outline-none disabled:opacity-60"
          />
          {busy ? (
            <button
              onClick={cancel}
              className="flex h-8 items-center rounded-lg border border-border bg-input px-2.5 text-[10.5px] font-medium text-text hover:bg-hover"
              aria-label="Cancel"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => send()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: 'var(--accent)' }}
              aria-label="Send"
            >
              <Icon name="send" size={13} color="#fff" />
            </button>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

/**
 * Pulls the "why" from an assistant message. Aggressive about removing any
 * patch / JSON detritus — local models sometimes emit single-line fences,
 * malformed fences, or even bare JSON arrays without fences. None of that
 * should ever leak into the proposal card's "Why" box.
 *
 * Returns the full prose (no length cap here — the UI controls truncation).
 */
function extractReason(content: string): string | undefined {
  let text = content
    // <think>…</think> reasoning blocks
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    // Whatever stripPatchFences can recognise as a parsed patch fence
    .trim();
  text = stripPatchFences(text);

  // Belt-and-braces: drop any code fence the parser missed (any language tag,
  // single-line or multi-line), then any bare top-level JSON array of objects
  // — sd-patch payloads — that the model emitted without a fence wrapper.
  text = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/\[\s*\{[\s\S]*?\}\s*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) return undefined;

  // Markdown clean-up: turn bullets into inline text, drop heading hashes.
  const cleaned = text
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*]\s+/, '')
        .replace(/^#+\s*/, '')
        .replace(/^\s*\d+\.\s+/, ''),
    )
    .join('\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

interface ChatBubbleProps {
  message: UiMessage;
  onApply: (propId: string) => void;
  onDiscard: (propId: string) => void;
  onRevert: (propId: string) => void;
  onReapply: (propId: string) => void;
}

function ChatBubble({
  message,
  onApply,
  onDiscard,
  onRevert,
  onReapply,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  // Hide reasoning model <think>...</think> blocks from chat — they're
  // internal scratch, not user-facing. Open <think> with no close = still
  // streaming; show "thinking…" placeholder until it closes.
  const stripThinking = (s: string): string => {
    const closed = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return closed.replace(/<think>[\s\S]*$/, '').trim();
  };
  const isThinking =
    !isUser && /<think>(?![\s\S]*<\/think>)/.test(message.content);
  const cleaned = isUser
    ? message.content
    : stripPatchFences(stripThinking(message.content));
  const visibleText = cleaned || (isThinking ? '_thinking…_' : '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className={cn('flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}
    >
      <div
        className={cn(
          'max-w-[88%] whitespace-pre-wrap px-3 py-2 text-[12.5px] leading-relaxed',
          isUser
            ? 'rounded-[12px_12px_3px_12px] text-white'
            : 'rounded-[12px_12px_12px_3px] bg-hover text-text',
        )}
        style={isUser ? { background: 'var(--accent)' } : undefined}
      >
        {visibleText || (message.streaming ? <Cursor /> : null)}
        {message.streaming && visibleText && <Cursor />}
      </div>

      {!isUser &&
        (message.proposals ?? []).map((p) => (
          <PatchProposalCard
            key={p.id}
            proposal={p}
            onApply={() => onApply(p.id)}
            onDiscard={() => onDiscard(p.id)}
            onRevert={() => onRevert(p.id)}
            onReapply={() => onReapply(p.id)}
          />
        ))}
    </motion.div>
  );
}

function PatchProposalCard({
  proposal,
  onApply,
  onDiscard,
  onRevert,
  onReapply,
}: {
  proposal: PatchProposal;
  onApply: () => void;
  onDiscard: () => void;
  onRevert: () => void;
  onReapply: () => void;
}) {
  const { state, patches, errors, warnings, reason } = proposal;
  const count = patches.length;
  const hasErrors = errors.length > 0;
  const previews = patches
    .map((patch) => patchPreview(patch))
    .filter((preview): preview is string => !!preview);

  const stateLabel =
    state === 'proposed'
      ? `${count} change(s) proposed`
      : state === 'applied'
        ? `Applied · ${count} change(s)`
        : state === 'reverted'
          ? `Reverted · ${count} change(s)`
          : 'Discarded';

  const stateColor =
    state === 'applied'
      ? '#7c9c5e'
      : state === 'reverted'
        ? '#c96442'
        : state === 'discarded'
          ? '#8a8a85'
          : 'var(--accent)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className="w-[88%] rounded-lg border border-border bg-panel"
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: stateColor }}
        />
        <span className="text-[10.5px] font-semibold text-text">{stateLabel}</span>
        {hasErrors && (
          <span className="ml-auto text-[9.5px] text-[#c96442]">
            {errors.length} parse error(s)
          </span>
        )}
      </div>

      {reason && (
        <div className="border-b border-border bg-input/40 px-2.5 py-1.5">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
            Why
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-[11px] leading-snug text-text">
            {reason}
          </div>
        </div>
      )}

      {patches.length > 0 && (
        <ul className="space-y-0.5 border-b border-border px-2.5 py-2 font-mono text-[10.5px] text-text-dim">
          {patches.map((p, i) => (
            <li key={i} className="truncate">
              {describePatch(p)}
            </li>
          ))}
        </ul>
      )}

      {previews.length > 0 && (
        <div className="border-b border-border bg-input/30 px-2.5 py-2">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-dim">
            Description
          </div>
          <div className="mt-1 space-y-2 text-[11px] leading-snug text-text">
            {previews.map((preview, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {preview}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasErrors && (
        <ul className="space-y-0.5 border-b border-border bg-[var(--input-bg)] px-2.5 py-2 font-mono text-[10px] text-[#c96442]">
          {errors.map((e, i) => (
            <li key={i} className="truncate">
              {e}
            </li>
          ))}
        </ul>
      )}

      {warnings && warnings.length > 0 && (
        <ul className="space-y-0.5 border-b border-border bg-[var(--input-bg)] px-2.5 py-2 font-mono text-[10px] text-[#a8773d]">
          {warnings.map((w, i) => (
            <li key={i} className="truncate">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1 px-2.5 py-1.5">
        {state === 'proposed' && patches.length > 0 && (
          <>
            <button
              onClick={onApply}
              className="rounded-md px-2.5 py-1 text-[10.5px] font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              Apply
            </button>
            <button
              onClick={onDiscard}
              className="rounded-md border border-border bg-input px-2.5 py-1 text-[10.5px] text-text-dim hover:bg-hover hover:text-text"
            >
              Discard
            </button>
          </>
        )}
        {state === 'applied' && (
          <button
            onClick={onRevert}
            className="rounded-md border border-border bg-input px-2.5 py-1 text-[10.5px] text-text hover:bg-hover"
          >
            ↺ Geri al
          </button>
        )}
        {state === 'reverted' && (
          <button
            onClick={onReapply}
            className="rounded-md border border-border bg-input px-2.5 py-1 text-[10.5px] text-text hover:bg-hover"
          >
            ⟳ Tekrar uygula
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Cursor() {
  return (
    <span
      className="ml-0.5 inline-block h-3 w-[6px] align-middle"
      style={{
        background: 'currentColor',
        opacity: 0.6,
        animation: 'sd-cursor-blink 0.9s steps(2, end) infinite',
      }}
    />
  );
}

function patchPreview(patch: AiPatch): string | null {
  const op = (patch as { op?: string }).op;
  if (op !== 'set_notes') return null;
  const dyn = patch as { id?: string; mode?: string; value?: unknown };
  const value =
    dyn.value && typeof dyn.value === 'object' && !Array.isArray(dyn.value)
      ? (dyn.value as Record<string, unknown>)
      : null;
  if (!value) return null;

  const lines: string[] = [];
  const nodeLabel = dyn.id ? `Node: ${dyn.id}` : null;
  if (nodeLabel) lines.push(nodeLabel);
  if (typeof value.summary === 'string' && value.summary.trim()) {
    lines.push(value.summary.trim());
  }

  const sections: Array<[string, unknown]> = [
    ['Patterns', value.designPatterns],
    ['CAP / Tradeoffs', value.capTradeoffs],
    ['Risks', value.operationalRisks],
    ['Recommendations', value.recommendations],
  ];

  for (const [title, raw] of sections) {
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const items = raw
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, 3);
    if (items.length === 0) continue;
    lines.push(`${title}: ${items.join(' · ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}
