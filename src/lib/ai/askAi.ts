import { useSettings } from '@/lib/store/settingsStore';
import type { CapabilityId, MergeStrategy } from '@/lib/capabilities';
import type { AiTaskDescriptor } from '@/lib/ai/prompts';

/**
 * Inspector + Toolbar butonlarının kullandığı `Ask AI about X` helper'ı.
 * AI panelini açar, mount'tan sonra `sd:ai-prompt` event'ini fırlatır.
 */
export function askAi(prompt: string): void {
  useSettings.getState().setAiOpen(true);
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('sd:ai-prompt', { detail: prompt }));
  }, 0);
}

export interface AiPromptPayload {
  prompt: string;
  task?: Partial<AiTaskDescriptor>;
}

export function askAiWithTask(payload: AiPromptPayload): void {
  useSettings.getState().setAiOpen(true);
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<AiPromptPayload>('sd:ai-prompt-payload', {
        detail: payload,
      }),
    );
  }, 0);
}

export function askAiAboutNode(label: string, type: string): void {
  askAi(
    `Analyze this node: **${label}** (${type}). ` +
      `List bottleneck risks, gaps, schema/API warnings, and possible improvements. ` +
      `If you propose a concrete change, append an sd-patch block after the explanation.`,
  );
}

/**
 * Inspector tab'ındaki "AI ile öner" butonunun tetikleyicisi. AI panel'i
 * `sd:ai-attr-fill` event'iyle uyarır; panel send'e `{ attributeFill: ... }`
 * geçer ve buildSystemMessage capability'nin promptInstruction'ını
 * sistem mesajına enjekte eder. AI yalnızca o set_* op'unu üretir.
 */
export interface AttrFillRequest {
  nodeId: string;
  nodeLabel: string;
  capabilityId: CapabilityId;
  capabilityLabel: string;
  mode: MergeStrategy;
}

export function askAiForCapability(req: AttrFillRequest): void {
  useSettings.getState().setAiOpen(true);
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<AttrFillRequest>('sd:ai-attr-fill', { detail: req }),
    );
  }, 0);
}
