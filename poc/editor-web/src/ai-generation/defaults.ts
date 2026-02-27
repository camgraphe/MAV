import type {
  AIGenerationState,
  IntentBlockKind,
  IntentContract,
  IntentCreateTemplate,
  IntentReferenceBank,
  IntentRenderState,
} from "./types";

export const INTENT_RENDER_HISTORY_LIMIT = 24;
export const AI_GENERATION_HISTORY_LIMIT = 100;
export const AI_PROMPT_HISTORY_LIMIT = 150;
export const AI_PRESET_LIMIT = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createDefaultReferenceBank(): IntentReferenceBank {
  return {
    characters: [],
    objects: [],
  };
}

function titleFromKind(kind: IntentBlockKind): string {
  if (kind === "hook") return "Hook";
  if (kind === "scene") return "Video Intent";
  if (kind === "outro") return "Outro";
  if (kind === "vo") return "Audio Intent";
  if (kind === "music") return "Music";
  return "SFX";
}

function promptFromKind(kind: IntentBlockKind): string {
  if (kind === "hook") return "Strong opening visual with clear subject and movement.";
  if (kind === "scene") return "Visual intent block for shots and sequence continuity.";
  if (kind === "outro") return "Closing visual with clean ending and room for call-to-action.";
  if (kind === "vo") return "Audio intent block for narration, music, or SFX direction.";
  if (kind === "music") return "Background music bed matching scene emotion and rhythm.";
  return "Focused sound effect accent for transition or emphasis.";
}

export function createDefaultIntentContract(kind: IntentBlockKind): IntentContract {
  return {
    blockKind: kind,
    title: titleFromKind(kind),
    prompt: promptFromKind(kind),
    negativePrompt: "",
    firstFrame: null,
    endFrame: null,
    characterRefs: [],
    objectRefs: [],
    output: {
      aspectRatio: "16:9",
      durationSec: kind === "vo" || kind === "music" ? 8 : 5,
      fps: 30,
    },
    motion: {
      movement: "auto",
      intensity: 50,
    },
    anglePreset: null,
    matchLensAndLighting: true,
    audio: {
      text: "",
      mood: kind === "music" ? "uplifting" : "neutral",
      tempo: 100,
      intensity: 50,
    },
  };
}

export function createDefaultIntentRenderState(): IntentRenderState {
  return {
    status: "draft",
    progressPct: 0,
    queuedAt: null,
    activeVersionId: null,
    versions: [],
    error: null,
    hasDraftChanges: false,
  };
}

export function createDefaultAIGenerationState(): AIGenerationState {
  return {
    selectedClipId: null,
    referenceBank: createDefaultReferenceBank(),
  };
}

export function normalizeIntentRenderState(input: Partial<IntentRenderState> | undefined): IntentRenderState {
  const defaults = createDefaultIntentRenderState();
  const status =
    input?.status === "queued" ||
    input?.status === "generating" ||
    input?.status === "ready" ||
    input?.status === "failed"
      ? input.status
      : "draft";
  return {
    status,
    progressPct: clamp(Math.round(input?.progressPct ?? defaults.progressPct), 0, 100),
    queuedAt: input?.queuedAt ?? null,
    activeVersionId: input?.activeVersionId ?? null,
    versions: Array.isArray(input?.versions) ? input.versions.slice(-INTENT_RENDER_HISTORY_LIMIT) : [],
    error: input?.error ?? null,
    hasDraftChanges: Boolean(input?.hasDraftChanges),
  };
}

export function normalizeAIGenerationState(input: AIGenerationState | undefined): AIGenerationState {
  if (!input) return createDefaultAIGenerationState();
  const characterRefs = Array.isArray(input.referenceBank?.characters) ? input.referenceBank.characters : [];
  const objectRefs = Array.isArray(input.referenceBank?.objects) ? input.referenceBank.objects : [];
  return {
    selectedClipId: input.selectedClipId ?? null,
    referenceBank: {
      characters: characterRefs,
      objects: objectRefs,
    },
  };
}

export const INTENT_CREATE_TEMPLATES: IntentCreateTemplate[] = [
  { kind: "scene", label: "Video Intent" },
  { kind: "vo", label: "Audio Intent" },
];

// Compatibility helpers used by legacy modules/imports.
export function normalizeAIGenConfig(input: Partial<IntentContract> | undefined): IntentContract {
  const kind = input?.blockKind ?? "scene";
  const defaults = createDefaultIntentContract(kind);
  return {
    ...defaults,
    ...input,
    blockKind: kind,
    title: input?.title?.trim() ? input.title : defaults.title,
    prompt: input?.prompt ?? defaults.prompt,
    negativePrompt: input?.negativePrompt ?? defaults.negativePrompt,
    firstFrame: input?.firstFrame ?? defaults.firstFrame,
    endFrame: input?.endFrame ?? defaults.endFrame,
    characterRefs: Array.isArray(input?.characterRefs) ? input.characterRefs : defaults.characterRefs,
    objectRefs: Array.isArray(input?.objectRefs) ? input.objectRefs : defaults.objectRefs,
    output: {
      ...defaults.output,
      ...(input?.output ?? {}),
      durationSec: clamp(Math.round(input?.output?.durationSec ?? defaults.output.durationSec), 1, 30),
    },
    motion: {
      ...defaults.motion,
      ...(input?.motion ?? {}),
      intensity: clamp(Math.round(input?.motion?.intensity ?? defaults.motion.intensity), 0, 100),
    },
    audio: {
      ...defaults.audio,
      ...(input?.audio ?? {}),
      tempo: clamp(Math.round(input?.audio?.tempo ?? defaults.audio.tempo), 40, 220),
      intensity: clamp(Math.round(input?.audio?.intensity ?? defaults.audio.intensity), 0, 100),
    },
    matchLensAndLighting:
      typeof input?.matchLensAndLighting === "boolean" ? input.matchLensAndLighting : defaults.matchLensAndLighting,
  };
}

export function trimPresetList<T>(presets: T[]): T[] {
  return presets.slice(0, AI_PRESET_LIMIT);
}
