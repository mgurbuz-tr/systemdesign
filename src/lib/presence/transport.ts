/**
 * Presence transport — abstracted messaging layer.
 *
 * Two implementations ship together:
 *   - BroadcastChannel: instant, zero-infra, but limited to the same browser
 *     storage partition (incognito ↔ normal cannot talk to each other).
 *   - WebSocket: cross-partition / cross-device via the relay in
 *     `server/presence-server.mjs` (`npm run dev:all` to start it).
 *
 * `createTransport` returns a Composite that fans out to both. Since presence
 * messages are state-overwriting (`upsert` by userId), receiving the same
 * payload twice is a no-op — no dedup is needed.
 */

export type PresenceMsg =
  | {
      type: 'cursor';
      userId: string;
      x: number;
      y: number;
      ts: number;
    }
  | {
      type: 'hello';
      userId: string;
      username: string;
      color: string;
    }
  | {
      type: 'bye';
      userId: string;
    };

export interface PresenceTransport {
  publish(msg: PresenceMsg): void;
  onMessage(cb: (msg: PresenceMsg) => void): () => void;
  dispose(): void;
}

class BroadcastChannelTransport implements PresenceTransport {
  private channel: BroadcastChannel | null;
  private listeners = new Set<(msg: PresenceMsg) => void>();
  private bound: ((ev: MessageEvent) => void) | null = null;

  constructor(channelId: string) {
    if (typeof BroadcastChannel === 'undefined') {
      this.channel = null;
      return;
    }
    this.channel = new BroadcastChannel(channelId);
    this.bound = (ev: MessageEvent) => {
      const data = ev.data as PresenceMsg | undefined;
      if (!data || typeof data !== 'object') return;
      for (const cb of this.listeners) cb(data);
    };
    this.channel.addEventListener('message', this.bound);
  }

  publish(msg: PresenceMsg) {
    this.channel?.postMessage(msg);
  }

  onMessage(cb: (msg: PresenceMsg) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  dispose() {
    if (this.channel && this.bound) {
      this.channel.removeEventListener('message', this.bound);
      this.channel.close();
    }
    this.listeners.clear();
    this.channel = null;
    this.bound = null;
  }
}

class WebSocketTransport implements PresenceTransport {
  private ws: WebSocket | null = null;
  private listeners = new Set<(msg: PresenceMsg) => void>();
  /** Bounded outbox — old cursor positions are stale anyway, drop them. */
  private outQueue: PresenceMsg[] = [];
  private url: string;
  private reconnectMs = 0;
  private closed = false;
  private reconnectTimer: number | null = null;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.addEventListener('open', () => {
      this.reconnectMs = 0;
      while (this.outQueue.length) {
        const msg = this.outQueue.shift()!;
        try {
          this.ws!.send(JSON.stringify(msg));
        } catch {
          break;
        }
      }
    });
    this.ws.addEventListener('message', (ev) => {
      try {
        const raw = typeof ev.data === 'string' ? ev.data : '';
        if (!raw) return;
        const msg = JSON.parse(raw) as PresenceMsg;
        if (!msg || typeof msg !== 'object') return;
        for (const cb of this.listeners) cb(msg);
      } catch {
        /* malformed frame — ignore */
      }
    });
    this.ws.addEventListener('close', () => {
      this.ws = null;
      this.scheduleReconnect();
    });
    this.ws.addEventListener('error', () => {
      try {
        this.ws?.close();
      } catch {
        /* noop */
      }
    });
  }

  private scheduleReconnect() {
    if (this.closed) return;
    this.reconnectMs = Math.min(
      this.reconnectMs ? this.reconnectMs * 2 : 600,
      5000,
    );
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = window.setTimeout(
      () => this.connect(),
      this.reconnectMs,
    );
  }

  publish(msg: PresenceMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        return;
      } catch {
        /* fall through to queue */
      }
    }
    this.outQueue.push(msg);
    if (this.outQueue.length > 32) this.outQueue.shift();
  }

  onMessage(cb: (msg: PresenceMsg) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  dispose() {
    this.closed = true;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.listeners.clear();
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
  }
}

class CompositeTransport implements PresenceTransport {
  private transports: PresenceTransport[];

  constructor(transports: PresenceTransport[]) {
    this.transports = transports;
  }

  publish(msg: PresenceMsg) {
    for (const t of this.transports) t.publish(msg);
  }

  onMessage(cb: (msg: PresenceMsg) => void) {
    const offs = this.transports.map((t) => t.onMessage(cb));
    return () => {
      for (const off of offs) off();
    };
  }

  dispose() {
    for (const t of this.transports) t.dispose();
  }
}

function resolveWsUrl(): string | null {
  // Vite injects env vars at build time — guard for non-Vite contexts.
  const env =
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: Record<string, string | undefined> }).env) ||
    {};
  const explicit = env.VITE_PRESENCE_WS_URL;
  if (explicit === '') return null; // explicit disable
  if (explicit) return explicit;
  // Vite dev server: presence WS lives on a sibling port.
  if (env.DEV) return 'ws://localhost:3001';
  // Production (e.g. nginx in docker-compose): same-origin /ws is proxied to
  // the presence container — works under both http (ws) and https (wss).
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return null;
}

export function createTransport(channelId: string): PresenceTransport {
  const transports: PresenceTransport[] = [
    new BroadcastChannelTransport(channelId),
  ];
  const wsUrl = resolveWsUrl();
  if (wsUrl) {
    const url = `${wsUrl.replace(/\/$/, '')}/?c=${encodeURIComponent(channelId)}`;
    transports.push(new WebSocketTransport(url));
  }
  return new CompositeTransport(transports);
}
