import { useSettings } from '@/lib/store/settingsStore';

/**
 * Convenience helper used by Inspector + Toolbar buttons that want to
 * "ask AI about X". Opens the AI panel and dispatches a sd:ai-prompt event
 * the panel listens for.
 */
export function askAi(prompt: string): void {
  useSettings.getState().setAiOpen(true);
  // Dispatch on next tick so the AI panel is mounted before receiving.
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('sd:ai-prompt', { detail: prompt }));
  }, 0);
}

export function askAiAboutNode(label: string, type: string): void {
  askAi(
    `Şu node'u analiz et: **${label}** (${type}). ` +
      `Bu node için bottleneck riskleri, eksikler, schema/API uyarıları ve yapılabilecek iyileştirmeleri listele. ` +
      `Eğer somut değişiklik öneriyorsan açıklamadan sonra sd-patch bloğu ekle.`,
  );
}
