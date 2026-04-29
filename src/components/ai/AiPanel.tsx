import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/Icon';
import { useSettings } from '@/lib/store/settingsStore';
import { useCanvas } from '@/lib/store/canvasStore';
import { useProject } from '@/lib/store/projectStore';
import { checkConnection, streamChat, type ChatMessage } from '@/lib/ai/client';
import { buildSystemMessage } from '@/lib/ai/prompts';
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

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: 'Issue scan',
    prompt: ISSUE_SCAN_KEY,
  },
  {
    label: 'Find bottlenecks',
    prompt:
      'Bu mimaride hangi node bottleneck olur ve neden? Spesifik trafik path’leri üzerinden açıkla.',
  },
  {
    label: 'Suggest cache',
    prompt:
      'Bu sisteme nereye cache koymalıyım? Read pattern’leri tahmin ederek öner ve uygulanabilir patch’ler ver.',
  },
  {
    label: 'Schema review',
    prompt:
      'DB schema’larımı değerlendir: eksik index, FK, denormalize edilmesi gerekenler var mı?',
  },
  {
    label: 'Security gaps',
    prompt:
      'Bu sistemde auth, secrets, edge security açısından hangi açıklar var?',
  },
  {
    label: 'Estimate cost',
    prompt:
      'Hızlı bir Fermi tahmini yap: orta-trafik (1k RPS) için aylık altyapı maliyeti yaklaşık ne?',
  },
];

const WELCOME_MSG: UiMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Selam — sistem mimarın. Canvas'ı görüyorum. Değişiklik istersen patch öneririm, önce sen onaylarsın.",
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
  } = useSettings();
  const projectId = useProject((s) => s.current?.id);

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
    const handler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === 'string') {
        send(ce.detail);
      }
    };
    window.addEventListener('sd:ai-prompt', handler);
    return () => window.removeEventListener('sd:ai-prompt', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runConnectionCheck = async () => {
    const r = await checkConnection(lmStudioBaseUrl, lmStudioApiKey);
    setConn(r.ok ? 'ok' : 'fail');
    setConnDetail(r.detail);
    if (r.needsAuth) setShowSettings(true);
  };

  const finalizeAssistantMessage = (id: string) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== id) return m;
        const blocks = parsePatches(m.content);
        const proposals: PatchProposal[] = blocks
          .filter((b) => b.patches.length > 0 || b.errors.length > 0)
          .map((b) => ({
            id: uid('prop'),
            patches: b.patches,
            errors: b.errors,
            state: 'proposed' as const,
          }));
        return { ...m, streaming: false, proposals };
      }),
    );
  };

  const send = async (override?: string) => {
    let text = (override ?? draft).trim();
    if (!text || busy) return;
    setDraft('');

    // Issue Scan: run local heuristic first, fold findings into the prompt.
    if (text === ISSUE_SCAN_KEY) {
      const { nodes, edges } = useCanvas.getState();
      const found = scanIssues(nodes, edges);
      const md = formatIssuesMarkdown(found);
      text =
        `Issue scan istiyorum. Önce yerel heuristic şunları yakaladı:\n\n${md}\n\n` +
        `Bunları doğrula, eklemen gereken başka mimari/scalability/security uyarıları varsa ekle. ` +
        `Sonunda öncelik sırasına göre 3 maddelik aksiyon listesi ver. ` +
        `Somut bir değişiklik öneriyorsan sd-patch bloğu ekle.`;
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
    const graphMd = serializeGraph(nodes, edges, { selectedNodeId });

    const history: ChatMessage[] = [
      { role: 'system', content: buildSystemMessage(graphMd) },
      ...messages
        .filter((m) => m.id !== 'welcome')
        .map(
          (m): ChatMessage => ({
            role: m.role,
            // Send the model the raw content (with patches) so it sees its own
            // history; UI strips fences for human display.
            content: m.content,
          }),
        ),
      { role: 'user', content: text },
    ];

    abortRef.current = new AbortController();

    try {
      await streamChat({
        baseUrl: lmStudioBaseUrl,
        apiKey: lmStudioApiKey,
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
        toast.error(`AI hatası: ${(err as Error).message ?? 'unknown'}`);
        setMessages((all) =>
          all.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    '_LM Studio ile bağlantı kurulamadı. Settings’den base URL’i kontrol et veya LM Studio’nun "Local Server"ı aktif mi diye bak._',
                }
              : m,
          ),
        );
      }
    } finally {
      finalizeAssistantMessage(assistantId);
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
          const result = applyPatches(p.patches);
          if (result.warnings.length > 0) {
            toast.warning(`${result.warnings.length} uyarı (konsola yazıldı)`);
            console.warn('Patch warnings:', result.warnings);
          }
          toast.success(`${result.applied} değişiklik uygulandı`);
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
          toast.success('Değişiklik geri alındı');
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
          toast.success(`${result.applied} değişiklik tekrar uygulandı`);
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
                  API key (Bearer · opsiyonel)
                </span>
                <input
                  type="password"
                  value={lmStudioApiKey}
                  onChange={(e) => setLmStudioApiKey(e.target.value)}
                  placeholder="lms-… (LM Studio'da auth kapalıysa boş bırak)"
                  className="h-7 w-full rounded-md border border-border bg-input px-2 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
                />
              </label>
              <p className="mt-1.5 text-[10px] text-text-dim">
                LM Studio Local Server'ı başlat. Yeni sürümlerde Settings → Developer → "Require API key" varsayılan açık.
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
              onClick={() => send(q.prompt)}
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
            placeholder="Sistemin hakkında bir şey sor…"
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
  const visibleText = isUser ? message.content : stripPatchFences(message.content);

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
  const { state, patches, errors, warnings } = proposal;
  const count = patches.length;
  const hasErrors = errors.length > 0;

  const stateLabel =
    state === 'proposed'
      ? `${count} değişiklik öneriliyor`
      : state === 'applied'
        ? `Uygulandı · ${count} değişiklik`
        : state === 'reverted'
          ? `Geri alındı · ${count} değişiklik`
          : 'Reddedildi';

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
            {errors.length} parse hatası
          </span>
        )}
      </div>

      {patches.length > 0 && (
        <ul className="space-y-0.5 border-b border-border px-2.5 py-2 font-mono text-[10.5px] text-text-dim">
          {patches.map((p, i) => (
            <li key={i} className="truncate">
              {describePatch(p)}
            </li>
          ))}
        </ul>
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

      {warnings && warnings.length > 0 && state !== 'proposed' && (
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
