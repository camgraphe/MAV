import { createDefaultAIGenConfig, normalizeAIGenConfig } from "./defaults";
import type {
  AIGenConfig,
  AIGenMovementMode,
  AIGenReferenceKind,
  EngineId,
  EngineMode,
} from "./types";

export type EngineCapabilities = {
  supportedModes: EngineMode[];
  supportsNegativePrompt: boolean;
  supportsAdherence: boolean;
  supportsFixedSeed: boolean;
  supportsFps: boolean;
  supportsUpscale: boolean;
  supportsBestOf: boolean;
  supportsExportPreset: boolean;
  supportedMovementModes: AIGenMovementMode[];
  supportsSpeedRampCustom: boolean;
  supportsStabilization: boolean;
  supportsLoopable: boolean;
  supportsDirectorPanel: boolean;
  supportsFrameLocking: boolean;
  supportsInterpolationStyle: boolean;
  maxReferences: number;
  supportedReferenceKinds: AIGenReferenceKind[];
  supportsLensControls: boolean;
  supportsCameraPreset: boolean;
};

export const ENGINE_MODELS: Record<EngineId, string[]> = {
  veo: ["veo-2", "veo-1.5"],
  sora: ["sora-1", "sora-turbo"],
  kling: ["kling-1.6", "kling-2.0"],
  luma: ["dream-machine", "ray-2"],
  runway: ["gen-3", "gen-4"],
};

const MOVEMENT_FULL: AIGenMovementMode[] = ["auto", "pan", "tilt", "dolly", "truck", "orbit", "handheld", "static"];

const DEFAULT_CAPABILITIES: EngineCapabilities = {
  supportedModes: ["video"],
  supportsNegativePrompt: true,
  supportsAdherence: true,
  supportsFixedSeed: true,
  supportsFps: true,
  supportsUpscale: true,
  supportsBestOf: true,
  supportsExportPreset: true,
  supportedMovementModes: MOVEMENT_FULL,
  supportsSpeedRampCustom: true,
  supportsStabilization: true,
  supportsLoopable: true,
  supportsDirectorPanel: true,
  supportsFrameLocking: true,
  supportsInterpolationStyle: true,
  maxReferences: 6,
  supportedReferenceKinds: ["image", "video", "frame"],
  supportsLensControls: true,
  supportsCameraPreset: true,
};

export const ENGINE_CAPABILITIES: Record<EngineId, EngineCapabilities> = {
  veo: {
    ...DEFAULT_CAPABILITIES,
    supportedModes: ["image", "video"],
    maxReferences: 8,
  },
  sora: {
    ...DEFAULT_CAPABILITIES,
    supportedModes: ["video"],
    supportsUpscale: false,
    maxReferences: 4,
  },
  kling: {
    ...DEFAULT_CAPABILITIES,
    supportedModes: ["image", "video"],
    supportsLoopable: false,
    maxReferences: 5,
  },
  luma: {
    ...DEFAULT_CAPABILITIES,
    supportedModes: ["video"],
    supportsFixedSeed: false,
    supportsSpeedRampCustom: false,
    supportedMovementModes: ["auto", "dolly", "handheld", "static"],
    supportsFrameLocking: false,
    supportsInterpolationStyle: false,
    supportedReferenceKinds: ["image", "frame"],
    maxReferences: 3,
  },
  runway: {
    ...DEFAULT_CAPABILITIES,
    supportedModes: ["image", "video"],
    supportsBestOf: false,
    supportsLensControls: false,
    supportsCameraPreset: false,
    maxReferences: 4,
  },
};

export function resolveEngineCapabilities(engineId: EngineId): EngineCapabilities {
  return ENGINE_CAPABILITIES[engineId] ?? DEFAULT_CAPABILITIES;
}

export function ensureModelForEngine(engineId: EngineId, modelId: string): string {
  const models = ENGINE_MODELS[engineId] ?? [];
  if (models.length === 0) return modelId || "default";
  return models.includes(modelId) ? modelId : models[0];
}

function deepCloneConfig(config: AIGenConfig): AIGenConfig {
  return normalizeAIGenConfig(JSON.parse(JSON.stringify(config)) as AIGenConfig);
}

export function buildEffectiveConfig(config: AIGenConfig): { effectiveConfig: AIGenConfig; gatedOffFields: string[] } {
  const defaults = createDefaultAIGenConfig();
  const next = deepCloneConfig(config);
  const capabilities = resolveEngineCapabilities(next.engine.engineId);
  const gatedOffFields: string[] = [];

  if (!capabilities.supportedModes.includes(next.engine.mode)) {
    gatedOffFields.push("engine.mode");
    next.engine.mode = capabilities.supportedModes[0] ?? "video";
  }

  if (!capabilities.supportsNegativePrompt && next.prompt.negativeText.trim().length > 0) {
    gatedOffFields.push("prompt.negativeText");
    next.prompt.negativeText = "";
  }

  if (!capabilities.supportsAdherence && next.prompt.adherence !== defaults.prompt.adherence) {
    gatedOffFields.push("prompt.adherence");
    next.prompt.adherence = defaults.prompt.adherence;
  }

  if (!capabilities.supportsFixedSeed && next.prompt.seedMode === "fixed") {
    gatedOffFields.push("prompt.seedMode");
    gatedOffFields.push("prompt.seed");
    next.prompt.seedMode = "random";
    next.prompt.seed = null;
  }

  if (!capabilities.supportsFps && next.output.fps !== defaults.output.fps) {
    gatedOffFields.push("output.fps");
    next.output.fps = defaults.output.fps;
  }

  if (!capabilities.supportsUpscale && next.output.upscale) {
    gatedOffFields.push("output.upscale");
    next.output.upscale = false;
  }

  if (!capabilities.supportsBestOf && next.output.bestOf !== defaults.output.bestOf) {
    gatedOffFields.push("output.bestOf");
    next.output.bestOf = defaults.output.bestOf;
  }

  if (!capabilities.supportsExportPreset && next.output.exportPreset !== "none") {
    gatedOffFields.push("output.exportPreset");
    next.output.exportPreset = "none";
  }

  if (!capabilities.supportedMovementModes.includes(next.motion.movementMode)) {
    gatedOffFields.push("motion.movementMode");
    next.motion.movementMode = capabilities.supportedMovementModes[0] ?? "auto";
  }

  if (!capabilities.supportsSpeedRampCustom && next.motion.speedRampPreset === "custom") {
    gatedOffFields.push("motion.speedRampPreset");
    next.motion.speedRampPreset = "linear";
  }

  if (!capabilities.supportsStabilization && next.motion.stabilization) {
    gatedOffFields.push("motion.stabilization");
    next.motion.stabilization = false;
  }

  if (!capabilities.supportsLoopable && next.motion.loopable) {
    gatedOffFields.push("motion.loopable");
    next.motion.loopable = false;
  }

  if (!capabilities.supportsDirectorPanel) {
    const serializedCurrent = JSON.stringify(next.director);
    const serializedDefault = JSON.stringify(defaults.director);
    if (serializedCurrent !== serializedDefault) {
      gatedOffFields.push("director");
      next.director = defaults.director;
    }
  }

  if (!capabilities.supportsFrameLocking && next.frames.frameLocking !== "none") {
    gatedOffFields.push("frames.frameLocking");
    next.frames.frameLocking = "none";
  }

  if (!capabilities.supportsInterpolationStyle && next.frames.interpolationStyle !== "default") {
    gatedOffFields.push("frames.interpolationStyle");
    next.frames.interpolationStyle = "default";
  }

  if (!capabilities.supportsLensControls) {
    if (next.advanced.lensPreset !== defaults.advanced.lensPreset) {
      gatedOffFields.push("advanced.lensPreset");
      next.advanced.lensPreset = defaults.advanced.lensPreset;
    }
    if (next.advanced.focalLengthMm !== defaults.advanced.focalLengthMm) {
      gatedOffFields.push("advanced.focalLengthMm");
      next.advanced.focalLengthMm = defaults.advanced.focalLengthMm;
    }
    if (next.advanced.aperture !== defaults.advanced.aperture) {
      gatedOffFields.push("advanced.aperture");
      next.advanced.aperture = defaults.advanced.aperture;
    }
  }

  if (!capabilities.supportsCameraPreset && next.advanced.cameraPreset !== defaults.advanced.cameraPreset) {
    gatedOffFields.push("advanced.cameraPreset");
    next.advanced.cameraPreset = defaults.advanced.cameraPreset;
  }

  const filteredReferences = next.references.items
    .filter((item) => capabilities.supportedReferenceKinds.includes(item.kind))
    .slice(0, capabilities.maxReferences);
  if (filteredReferences.length !== next.references.items.length) {
    gatedOffFields.push("references.items");
    next.references.items = filteredReferences;
  }

  return { effectiveConfig: next, gatedOffFields: [...new Set(gatedOffFields)] };
}

export function getCapabilityState(engineId: EngineId, enabled: boolean, disabledReason: string) {
  return {
    disabled: !enabled,
    title: enabled ? "" : `${engineId}: ${disabledReason}`,
  };
}
