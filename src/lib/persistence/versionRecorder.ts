import { useCanvas } from '@/lib/store/canvasStore';
import { useProject } from '@/lib/store/projectStore';
import { recordVersion } from '@/lib/persistence/versions';
import type { VersionTrigger } from '@/lib/db/database';

/**
 * Position vb. küçük değişiklikleri yakalayabilmek için fingerprint, nodes +
 * edges'in tam JSON'u üzerinden hesaplanır. Önceki "uzunluk + count" yaklaşımı
 * `100` → `200` gibi aynı uzunluktaki değişiklikleri kaçırıyordu.
 */
function fingerprintFor(
  nodes: ReturnType<typeof useCanvas.getState>['nodes'],
  edges: ReturnType<typeof useCanvas.getState>['edges'],
): string {
  try {
    return JSON.stringify({ n: nodes, e: edges });
  } catch {
    return `${nodes.length}:${edges.length}`;
  }
}

interface RecorderHandle {
  recordManual: (label?: string) => Promise<void>;
  recordAuto: (
    trigger: Exclude<VersionTrigger, 'idle' | 'manual'>,
    label: string,
    summary?: string,
  ) => Promise<void>;
  stop: () => void;
}

let active: RecorderHandle | null = null;

/**
 * Photoshop history mantığı: her "anlamlı user action" (drag bitti, node
 * eklendi, edge bağlandı, vs.) bir history step'i. zundo middleware bu
 * step'leri zaten coalesce ediyor (`canvasStore.ts:240-248`, 250 ms
 * drag-quiescence). Recorder, zundo'nun temporal store'una abone olup
 * `pastStates` büyüdüğünde bir versiyon yazar — drag biter bitmez (~250 ms
 * sonra) satır oluşur.
 *
 * Undo/redo filtrelenir, çünkü Photoshop'ta da Cmd+Z yeni satır yaratmaz,
 * sadece var olan bir step'e gidilir. AI patch / manuel save / auto-layout /
 * pre-restore gibi etiketli yazımlar zaten kendi yollarından yazılır; bu
 * yazımların ürettiği zundo entry'si tekrarlanmasın diye `suppressNextStep`
 * flag'i ile tek seferlik yutulur.
 */
export function startVersionRecorder(): RecorderHandle {
  if (active) active.stop();

  let lastFingerprint: string | null = null;
  let suppressNextStep = false;

  const projectId = (): string | null =>
    useProject.getState().current?.id ?? null;

  const writeVersion = async (
    trigger: VersionTrigger,
    label: string,
    summary?: string,
    force = false,
  ) => {
    const id = projectId();
    if (!id) return;
    const { nodes, edges } = useCanvas.getState();
    const fp = fingerprintFor(nodes, edges);
    if (!force && fp === lastFingerprint && trigger !== 'pre-restore') return;
    await recordVersion({ projectId: id, trigger, label, nodes, edges, summary });
    lastFingerprint = fp;
  };

  // Mount'ta mevcut state'i fingerprint olarak al — açılışta spam yazma.
  {
    const { nodes, edges } = useCanvas.getState();
    lastFingerprint = fingerprintFor(nodes, edges);
  }

  // zundo temporal store: pastStates ve futureStates'e bakarak undo/redo'yu
  // ayırt edebiliriz.
  // - Yeni mutation: pastStates +1, futureStates → 0 (her zaman temizlenir)
  // - Redo:          pastStates +1, futureStates -1
  // - Undo:          pastStates -1, futureStates +1
  const tempStore = useCanvas.temporal;
  const unsubTemp = tempStore.subscribe((state, prev) => {
    if (state.pastStates.length <= prev.pastStates.length) return;
    const wasRedo =
      prev.futureStates.length > 0 &&
      state.futureStates.length === prev.futureStates.length - 1;
    if (wasRedo) return;

    if (suppressNextStep) {
      // AI patch / manuel / auto-layout / pre-restore zaten kendi etiketiyle
      // yazıldı; gelen zundo entry'sini bir kez yut.
      suppressNextStep = false;
      return;
    }

    void writeVersion('idle', 'Auto save');
  });

  const handle: RecorderHandle = {
    recordManual: async (label = 'Manual save') => {
      // Manual kayıt canvas state'ini değiştirmez — zundo entry üretmez,
      // suppress'e gerek yok. Force ile yazılır ki "tekrar kaydet" istemi
      // dedup'a yutulmasın.
      await writeVersion('manual', label, undefined, true);
    },
    recordAuto: async (trigger, label, summary) => {
      // Bu trigger'lar canvas state'ini değiştirir → ~250 ms sonra zundo
      // entry yazar; kendi satırımızı zaten yazdığımız için geleni yut.
      suppressNextStep = true;
      await writeVersion(trigger, label, summary);
    },
    stop: () => {
      unsubTemp();
      if (active === handle) active = null;
    },
  };

  active = handle;
  return handle;
}

export function getRecorder(): RecorderHandle | null {
  return active;
}
