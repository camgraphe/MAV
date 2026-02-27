import type {
  AIGenConfig,
  AIGenCurvePoint,
  AIGenFrameLocking,
  AIGenFrameRef,
  AIGenInterpolationStyle,
  AIGenPreset,
  AIGenerationRequestRecord,
  AIGenerationState,
  PromptVersionRecord,
} from "./types";

export const AI_GENERATION_HISTORY_LIMIT = 100;
export const AI_PROMPT_HISTORY_LIMIT = 150;
export const AI_PRESET_LIMIT = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeCurve(curve: AIGenCurvePoint[] | undefined): AIGenCurvePoint[] {
  if (!Array.isArray(curve) || curve.length === 0) return createDefaultCurve();
  const sorted = [...curve]
    .map((point, index) => ({
      x: Number.isFinite(point.x) ? point.x : index / Math.max(1, curve.length - 1),
      y: Number.isFinite(point.y) ? point.y : 0.5,
    }))
    .sort((a, b) => a.x - b.x)
    .slice(0, 5);

  while (sorted.length < 5) {
    const position = sorted.length / 4;
    sorted.push({ x: position, y: position });
  }

  return sorted.map((point, index) => ({
    x: index === 0 ? 0 : index === sorted.length - 1 ? 1 : clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
  }));
}

export function createDefaultCurve(): AIGenCurvePoint[] {
  return [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.3 },
    { x: 0.5, y: 0.55 },
    { x: 0.75, y: 0.82 },
    { x: 1, y: 1 },
  ];
}

export function createDefaultAIGenConfig(): AIGenConfig {
  return {
    prompt: {
      text: "",
      negativeText: "",
      adherence: 70,
      seedMode: "random",
      seed: null,
      variationCount: 4,
      mentions: [],
    },
    engine: {
      mode: "video",
      engineId: "veo",
      modelId: "veo-2",
    },
    output: {
      shotMode: "single",
      aspectRatio: "16:9",
      resolution: "1080p",
      durationSec: 5,
      batchCount: 10,
      fps: 30,
      upscale: false,
      bestOf: 1,
      exportPreset: "none",
    },
    motion: {
      movementMode: "auto",
      intensity: 50,
      speedRampPreset: "custom",
      customCurve: createDefaultCurve(),
      segmentEasings: ["ease-in-out", "linear", "ease-in-out", "ease-out"],
      stabilization: false,
      loopable: false,
    },
    director: {
      lockIdentity: false,
      genre: "none",
      mood: "neutral",
      sceneFlow: 50,
      cameraIntent: "cinematic",
      actionLevel: 50,
      chaosLevel: 30,
      emotionLevel: 50,
      continuity: false,
    },
    frames: {
      mode: "none",
      startFrame: null,
      endFrame: null,
      frameLocking: "none",
      interpolationStyle: "default",
    },
    references: {
      items: [],
    },
    advanced: {
      lensPreset: "none",
      focalLengthMm: 50,
      aperture: "f/2.8",
      cameraPreset: "neutral",
    },
  };
}

function normalizeFrameRef(frame: AIGenFrameRef | null | undefined): AIGenFrameRef | null {
  if (!frame) return null;
  return {
    assetId: frame.assetId ?? null,
    assetLabel: frame.assetLabel || "Unknown asset",
    timeMs: Math.max(0, Math.round(frame.timeMs || 0)),
    thumbnailUrl: frame.thumbnailUrl ?? null,
    source: frame.source === "timeline-program" ? "timeline-program" : "source-monitor",
  };
}

function normalizeFrameLocking(value: AIGenFrameLocking | undefined): AIGenFrameLocking {
  if (value === "soft" || value === "hard") return value;
  return "none";
}

function normalizeInterpolationStyle(value: AIGenInterpolationStyle | undefined): AIGenInterpolationStyle {
  if (value === "morph" || value === "blend" || value === "direct") return value;
  return "default";
}

export function normalizeAIGenConfig(input: Partial<AIGenConfig> | undefined): AIGenConfig {
  const defaults = createDefaultAIGenConfig();
  if (!input) return defaults;
  const prompt = input.prompt ?? defaults.prompt;
  const engine = input.engine ?? defaults.engine;
  const output = input.output ?? defaults.output;
  const motion = input.motion ?? defaults.motion;
  const director = input.director ?? defaults.director;
  const frames = input.frames ?? defaults.frames;
  const references = input.references ?? defaults.references;
  const advanced = input.advanced ?? defaults.advanced;

  const fps = output.fps === 24 || output.fps === 25 || output.fps === 30 || output.fps === 60
    ? output.fps
    : defaults.output.fps;

  const bestOf = Math.max(1, Math.min(10, Math.round(output.bestOf || defaults.output.bestOf)));

  return {
    prompt: {
      text: prompt.text ?? "",
      negativeText: prompt.negativeText ?? "",
      adherence: clamp(Math.round(prompt.adherence ?? defaults.prompt.adherence), 0, 100),
      seedMode: prompt.seedMode === "fixed" ? "fixed" : "random",
      seed:
        typeof prompt.seed === "number" && Number.isFinite(prompt.seed)
          ? Math.max(0, Math.round(prompt.seed))
          : null,
      variationCount: clamp(Math.round(prompt.variationCount ?? defaults.prompt.variationCount), 1, 16),
      mentions: Array.isArray(prompt.mentions)
        ? prompt.mentions
            .filter((mention) => mention && typeof mention.id === "string")
            .map((mention) => ({
              id: mention.id,
              label: mention.label || mention.id,
              kind: mention.kind,
              token: mention.token || mention.id,
              tags: Array.isArray(mention.tags) ? mention.tags.filter((tag) => typeof tag === "string") : [],
            }))
        : [],
    },
    engine: {
      mode: engine.mode === "image" ? "image" : "video",
      engineId: engine.engineId ?? defaults.engine.engineId,
      modelId: engine.modelId || defaults.engine.modelId,
    },
    output: {
      shotMode: output.shotMode === "multi" ? "multi" : "single",
      aspectRatio: output.aspectRatio ?? defaults.output.aspectRatio,
      resolution: output.resolution ?? defaults.output.resolution,
      durationSec: clamp(Math.round(output.durationSec ?? defaults.output.durationSec), 1, 30),
      batchCount: clamp(Math.round(output.batchCount ?? defaults.output.batchCount), 1, 32),
      fps,
      upscale: Boolean(output.upscale),
      bestOf,
      exportPreset: output.exportPreset ?? defaults.output.exportPreset,
    },
    motion: {
      movementMode: motion.movementMode ?? defaults.motion.movementMode,
      intensity: clamp(Math.round(motion.intensity ?? defaults.motion.intensity), 0, 100),
      speedRampPreset: motion.speedRampPreset ?? defaults.motion.speedRampPreset,
      customCurve: normalizeCurve(motion.customCurve),
      segmentEasings:
        Array.isArray(motion.segmentEasings) && motion.segmentEasings.length >= 4
          ? motion.segmentEasings.slice(0, 4)
          : defaults.motion.segmentEasings,
      stabilization: Boolean(motion.stabilization),
      loopable: Boolean(motion.loopable),
    },
    director: {
      lockIdentity: Boolean(director.lockIdentity),
      genre: director.genre ?? defaults.director.genre,
      mood: director.mood ?? defaults.director.mood,
      sceneFlow: clamp(Math.round(director.sceneFlow ?? defaults.director.sceneFlow), 0, 100),
      cameraIntent: director.cameraIntent ?? defaults.director.cameraIntent,
      actionLevel: clamp(Math.round(director.actionLevel ?? defaults.director.actionLevel), 0, 100),
      chaosLevel: clamp(Math.round(director.chaosLevel ?? defaults.director.chaosLevel), 0, 100),
      emotionLevel: clamp(Math.round(director.emotionLevel ?? defaults.director.emotionLevel), 0, 100),
      continuity: Boolean(director.continuity),
    },
    frames: {
      mode: frames.mode ?? defaults.frames.mode,
      startFrame: normalizeFrameRef(frames.startFrame),
      endFrame: normalizeFrameRef(frames.endFrame),
      frameLocking: normalizeFrameLocking(frames.frameLocking),
      interpolationStyle: normalizeInterpolationStyle(frames.interpolationStyle),
    },
    references: {
      items: Array.isArray(references.items)
        ? references.items
            .filter((item) => Boolean(item) && typeof item.id === "string" && typeof item.url === "string")
            .map((item) => ({
              ...item,
              weight: clamp(Math.round(item.weight ?? 50), 0, 100),
              locked: Boolean(item.locked),
            }))
        : [],
    },
    advanced: {
      lensPreset: advanced.lensPreset ?? defaults.advanced.lensPreset,
      focalLengthMm: clamp(Math.round(advanced.focalLengthMm ?? defaults.advanced.focalLengthMm), 10, 200),
      aperture: advanced.aperture ?? defaults.advanced.aperture,
      cameraPreset: advanced.cameraPreset ?? defaults.advanced.cameraPreset,
    },
  };
}

function trimHistory(history: AIGenerationRequestRecord[]): AIGenerationRequestRecord[] {
  return history.slice(-AI_GENERATION_HISTORY_LIMIT);
}

function trimPromptHistory(history: PromptVersionRecord[]): PromptVersionRecord[] {
  return history.slice(-AI_PROMPT_HISTORY_LIMIT);
}

export function createDefaultAIGenerationState(): AIGenerationState {
  return {
    current: createDefaultAIGenConfig(),
    history: [],
    promptVersions: [],
  };
}

export function normalizeAIGenerationState(input: AIGenerationState | undefined): AIGenerationState {
  if (!input) return createDefaultAIGenerationState();

  const history = Array.isArray(input.history)
    ? trimHistory(
        input.history
          .filter((entry) => entry && typeof entry.id === "string")
          .map((entry) => ({
            ...entry,
            status: "queued" as const,
            configSnapshot: normalizeAIGenConfig(entry.configSnapshot),
            effectiveConfig: normalizeAIGenConfig(entry.effectiveConfig),
            gatedOffFields: Array.isArray(entry.gatedOffFields)
              ? entry.gatedOffFields.filter((field) => typeof field === "string")
              : [],
          })),
      )
    : [];

  const promptVersions = Array.isArray(input.promptVersions)
    ? trimPromptHistory(
        input.promptVersions
          .filter((entry) => entry && typeof entry.id === "string")
          .map((entry) => ({
            ...entry,
            seed:
              typeof entry.seed === "number" && Number.isFinite(entry.seed)
                ? Math.max(0, Math.round(entry.seed))
                : null,
          })),
      )
    : [];

  return {
    current: normalizeAIGenConfig(input.current),
    history,
    promptVersions,
  };
}

export function trimPresetList(presets: AIGenPreset[]): AIGenPreset[] {
  return presets.slice(0, AI_PRESET_LIMIT);
}
