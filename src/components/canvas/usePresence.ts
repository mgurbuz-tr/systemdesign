import { useEffect, useRef, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useIdentity } from '@/lib/store/identityStore';
import { useProject } from '@/lib/store/projectStore';
import { usePresence as usePresenceStore } from '@/lib/store/presenceStore';
import {
  createTransport,
  type PresenceTransport,
} from '@/lib/presence/transport';

const PUBLISH_INTERVAL_MS = 33; // ~30Hz: ağ/store hafif, render spring ile pürüzsüz
const PRUNE_INTERVAL_MS = 2000;
const STALE_AFTER_MS = 5000;

/**
 * Canvas wrapper içine kurulur. Aynı projeyi açan diğer sekmelere kendi
 * cursor pozisyonumu yayınlar; gelen mesajları presenceStore'a yazar.
 *
 * Kişilik (username/color) henüz girilmemişse hiçbir şey yapmaz — hello
 * yayınlamadan önce username'i bekleriz.
 */
export function usePresence(wrapperRef: RefObject<HTMLDivElement | null>) {
  const { screenToFlowPosition } = useReactFlow();
  const userId = useIdentity((s) => s.userId);
  const username = useIdentity((s) => s.username);
  const userColor = useIdentity((s) => s.userColor);
  // Channel = project NAME, not id. Two tabs (especially incognito vs normal)
  // each generate a fresh random projectId locally because storage isolation
  // prevents them from sharing IndexedDB. Project names ("Untitled System")
  // happen to coincide → same room. URL `?room=…` overrides for ad-hoc demos.
  const projectName = useProject((s) => s.current?.name ?? null);

  // Closure refresh için en güncel kimlik bilgileri ref'te tutulur
  // (mousemove handler her render'da yeniden bağlanmasın diye).
  const identityRef = useRef({ userId, username, userColor });
  identityRef.current = { userId, username, userColor };

  useEffect(() => {
    if (!username) {
      usePresenceStore.getState().clear();
      return;
    }

    const urlRoom =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('room')?.trim()
        : null;
    const room =
      (urlRoom && urlRoom.length > 0 ? urlRoom : null) ??
      projectName?.trim() ??
      'lobby';
    const channelId = `sd-presence-${room}`;
    const transport: PresenceTransport = createTransport(channelId);
    const store = usePresenceStore.getState;

    // Aynı kullanıcı için username/color cache'i (cursor mesajları sadece pos taşır).
    const peerMeta = new Map<string, { username: string; color: string }>();

    const announceHello = () => {
      const id = identityRef.current;
      if (!id.username) return;
      transport.publish({
        type: 'hello',
        userId: id.userId,
        username: id.username,
        color: id.userColor,
      });
    };

    const offMessage = transport.onMessage((msg) => {
      if (msg.userId === identityRef.current.userId) return; // self echo
      if (msg.type === 'hello') {
        peerMeta.set(msg.userId, {
          username: msg.username,
          color: msg.color,
        });
        // Yeni gelen kullanıcıya kim olduğumuzu söyle ki anında görsün.
        announceHello();
        // Var olan cursor'ın metadata'sını güncelle (renk/isim değişmiş olabilir).
        store().patch(msg.userId, {
          username: msg.username,
          color: msg.color,
        });
      } else if (msg.type === 'cursor') {
        const meta = peerMeta.get(msg.userId);
        // Henüz hello almadıysak placeholder kullan; hello geldiğinde patch'lenir.
        store().upsert({
          userId: msg.userId,
          username: meta?.username ?? '…',
          color: meta?.color ?? '#64748b',
          x: msg.x,
          y: msg.y,
          lastSeenMs: Date.now(),
        });
      } else if (msg.type === 'bye') {
        peerMeta.delete(msg.userId);
        store().remove(msg.userId);
      }
    });

    // İlk hello + diğer sekmelerin bize hello atması için kısa gecikmeli ikinci hello.
    announceHello();
    const helloRetry = window.setTimeout(announceHello, 250);

    // Mousemove yayını
    const wrapper = wrapperRef.current;
    let lastSent = 0;
    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastSent < PUBLISH_INTERVAL_MS) return;
      lastSent = now;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      transport.publish({
        type: 'cursor',
        userId: identityRef.current.userId,
        x: flow.x,
        y: flow.y,
        ts: Date.now(),
      });
    };
    wrapper?.addEventListener('mousemove', onMouseMove, { passive: true });

    // Prune döngüsü
    const pruneTimer = window.setInterval(() => {
      store().pruneStale(STALE_AFTER_MS);
    }, PRUNE_INTERVAL_MS);

    // Sayfa kapanırken bye yay
    const onUnload = () => {
      transport.publish({ type: 'bye', userId: identityRef.current.userId });
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearTimeout(helloRetry);
      window.clearInterval(pruneTimer);
      wrapper?.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('beforeunload', onUnload);
      transport.publish({ type: 'bye', userId: identityRef.current.userId });
      offMessage();
      transport.dispose();
      usePresenceStore.getState().clear();
    };
    // wrapperRef intentionally excluded — ref objesi kararlı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, username, screenToFlowPosition]);
}
