import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useViewport } from '@xyflow/react';
import { useIdentity } from '@/lib/store/identityStore';
import { usePresence as usePresenceStore } from '@/lib/store/presenceStore';
import { CursorMarker } from '@/components/identity/CursorMarker';

/**
 * React Flow `<ReactFlow>` çocuğu olarak render edilir. Pozisyonlar flow-space
 * koordinatlarında saklanır; viewport (translate + zoom) burada uygulanır →
 * pan/zoom sırasında cursor'lar canvas içeriğine yapışık kalır.
 *
 * `motion.div` spring transition cursor hareketini yumuşatır; ağ tarafı 30Hz
 * yayınlasa bile kullanıcı ~60fps yumuşak hareket görür.
 */
export function CursorOverlay() {
  const viewport = useViewport();
  const selfId = useIdentity((s) => s.userId);
  const remote = usePresenceStore((s) => s.remote);

  const cursors = useMemo(
    () => Object.values(remote).filter((c) => c.userId !== selfId),
    [remote, selfId],
  );

  if (cursors.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 5 }}
      aria-hidden
    >
      {cursors.map((c) => {
        const screenX = c.x * viewport.zoom + viewport.x;
        const screenY = c.y * viewport.zoom + viewport.y;
        return (
          <motion.div
            key={c.userId}
            className="absolute left-0 top-0"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: screenX,
              y: screenY,
            }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{
              x: { type: 'spring', stiffness: 380, damping: 30, mass: 0.4 },
              y: { type: 'spring', stiffness: 380, damping: 30, mass: 0.4 },
              opacity: { duration: 0.16 },
              scale: { duration: 0.16 },
            }}
            style={{ willChange: 'transform' }}
          >
            <CursorMarker color={c.color} label={c.username} />
          </motion.div>
        );
      })}
    </div>
  );
}
