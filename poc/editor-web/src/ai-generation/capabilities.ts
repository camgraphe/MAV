import { normalizeAIGenConfig } from "./defaults";
import type { AIGenConfig } from "./types";

export function ensureModelForEngine(_engineId: string, modelId: string): string {
  return modelId || "intent-default";
}

export function buildEffectiveConfig(config: AIGenConfig): { effectiveConfig: AIGenConfig; gatedOffFields: string[] } {
  return {
    effectiveConfig: normalizeAIGenConfig(config),
    gatedOffFields: [],
  };
}
