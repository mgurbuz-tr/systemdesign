/**
 * AI UI ortak state — AiPanel ile Inspector arasında köprü kurar.
 *
 * `pendingPatchCount > 0` iken Inspector'daki capability tab editörleri
 * disabled olur ve bir banner çıkar: kullanıcı önce AI'ın önerdiği patch'i
 * Apply / Discard etmeli. Bu, race condition'ı engeller — kullanıcı manuel
 * editlerken AI patch'i Apply'a bassa, manuel değişiklik AI'ın yakaladığı
 * snapshot ile birlikte ezilirdi.
 */
import { create } from 'zustand';

interface AiUiState {
  pendingPatchCount: number;
  setPendingPatchCount: (n: number) => void;
}

export const useAiUi = create<AiUiState>((set) => ({
  pendingPatchCount: 0,
  setPendingPatchCount: (n) => set({ pendingPatchCount: n }),
}));
