import { AI_PRESET_LIMIT, normalizeAIGenConfig, trimPresetList } from "./defaults";
import type { AIGenConfig, AIGenPreset } from "./types";

export const AI_PRESETS_STORAGE_KEY = "mav.ai-generation.presets.v1";

function safeParsePresets(raw: string | null): AIGenPreset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is AIGenPreset => Boolean(item) && typeof (item as { id?: unknown }).id === "string")
      .map((item) => ({
        id: item.id,
        name: typeof item.name === "string" ? item.name : "Preset",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        config: normalizeAIGenConfig(item.config),
      }));
  } catch {
    return [];
  }
}

export function readAIGenPresets(): AIGenPreset[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParsePresets(window.localStorage.getItem(AI_PRESETS_STORAGE_KEY));
  return trimPresetList(parsed);
}

export function writeAIGenPresets(presets: AIGenPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_PRESETS_STORAGE_KEY, JSON.stringify(trimPresetList(presets)));
  } catch {
    // Ignore local storage failures.
  }
}

export function saveAIGenPreset(existing: AIGenPreset[], name: string, config: AIGenConfig): AIGenPreset[] {
  const safeName = name.trim() || "Untitled preset";
  const now = new Date().toISOString();
  const nextPreset: AIGenPreset = {
    id: crypto.randomUUID(),
    name: safeName,
    createdAt: now,
    updatedAt: now,
    config: normalizeAIGenConfig(config),
  };
  const next = [nextPreset, ...existing].slice(0, AI_PRESET_LIMIT);
  writeAIGenPresets(next);
  return next;
}

export function removeAIGenPreset(existing: AIGenPreset[], presetId: string): AIGenPreset[] {
  const next = existing.filter((preset) => preset.id !== presetId);
  writeAIGenPresets(next);
  return next;
}
