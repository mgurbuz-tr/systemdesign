/**
 * LM Studio chat client.
 * LM Studio exposes an OpenAI-compatible REST at <baseUrl>/v1/chat/completions.
 * Streaming follows the Server-Sent Events format used by OpenAI.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  baseUrl: string;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
  onToken: (delta: string) => void;
  onError?: (err: unknown) => void;
}

export async function streamChat(opts: StreamOptions): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const body = {
    model: opts.model ?? 'local-model',
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    stream: true,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    opts.onError?.(err);
    throw err;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LM Studio returned ${res.status} ${res.statusText} ${text}`);
    opts.onError?.(err);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split by SSE delimiter (\n\n) — keep last partial line in buffer.
    const segments = buffer.split('\n\n');
    buffer = segments.pop() ?? '';

    for (const seg of segments) {
      const line = seg.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        return full;
      }
      try {
        const json = JSON.parse(payload);
        const delta: string = json.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          opts.onToken(delta);
        }
      } catch {
        // Some servers emit keep-alives or partial chunks; ignore parse errors.
      }
    }
  }

  return full;
}

export async function checkConnection(baseUrl: string): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
      method: 'GET',
    });
    if (!res.ok) return { ok: false, detail: `${res.status} ${res.statusText}` };
    const json = await res.json();
    const count = Array.isArray(json?.data) ? json.data.length : 0;
    const first = json?.data?.[0]?.id ?? 'unknown';
    return { ok: true, detail: count > 0 ? `${count} model · ${first}` : 'connected' };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
