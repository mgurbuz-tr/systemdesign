import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/Icon';
import { useSettings } from '@/lib/store/settingsStore';
import { useCanvas } from '@/lib/store/canvasStore';
import { checkConnection, streamChat, type ChatMessage } from '@/lib/ai/client';
import { buildSystemMessage } from '@/lib/ai/prompts';
import { serializeGraph } from '@/lib/ai/canvasContext';
import { cn, uid } from '@/lib/utils';

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  ts: number;
}

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: 'Find bottlenecks',
    prompt: 'Bu mimaride hangi node bottleneck olur ve neden? Spesifik trafik path’leri üzerinden açıkla.',
  },
  {
    label: 'Suggest cache',
    prompt: 'Bu sisteme nereye cache koymalıyım? Read pattern’leri tahmin ederek öner.',
  },
  {
    label: 'Schema review',
    prompt: 'DB schema’larımı değerlendir: eksik index, FK, denormalize edilmesi gerekenler var mı?',
  },
  {
    label: 'Security gaps',
    prompt: 'Bu sistemde auth, secrets, edge security açısından hangi açıklar var?',
  },
  {
    label: 'Estimate cost',
    prompt: 'Hızlı bir Fermi tahmini yap: orta-trafik (1k RPS) için aylık altyapı maliyeti yaklaşık ne?',
  },
];

export function AiPanel() {
  const { aiOpen, setAiOpen, lmStudioBaseUrl, setLmStudioBaseUrl } = useSettings();
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Selam — sistem mimarın. Canvas'ı görüyorum. Şu an ne üzerine çalışıyorsun? Sol-alttaki hızlı aksiyonlardan da başlayabilirsin.",
      ts: Date.now(),
    },
  ]);
  const [draft, setDraft] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [connDetail, setConnDetail] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aiOpen) return;
    runConnectionCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOpen, lmStudioBaseUrl]);

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
    const r = await checkConnection(lmStudioBaseUrl);
    setConn(r.ok ? 'ok' : 'fail');
    setConnDetail(r.detail);
  };

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || busy) return;
    setDraft('');

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

    const { nodes, edges } = useCanvas.getState();
    const graphMd = serializeGraph(nodes, edges);

    const history: ChatMessage[] = [
      { role: 'system', content: buildSystemMessage(graphMd) },
      ...messages
        .filter((m) => m.id !== 'welcome')
        .map((m): ChatMessage => ({
          role: m.role,
          content: m.content,
        })),
      { role: 'user', content: text },
    ];

    abortRef.current = new AbortController();

    try {
      await streamChat({
        baseUrl: lmStudioBaseUrl,
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
      setMessages((all) =>
        all.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      );
      setBusy(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
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
              <p className="mt-1.5 text-[10px] text-text-dim">
                LM Studio uygulamasında Local Server'ı başlat. Default: 1234.
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
            <ChatBubble key={m.id} message={m} />
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

function ChatBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
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
        {message.content || (message.streaming ? <Cursor /> : null)}
        {message.streaming && message.content && <Cursor />}
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
