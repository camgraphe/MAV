export type EngineMode = "image" | "video";

export type EngineId = "veo" | "sora" | "kling" | "luma" | "runway";

export type AIGenSeedMode = "random" | "fixed";

export type AIGenShotMode = "single" | "multi";

export type AIGenMovementMode =
  | "auto"
  | "pan"
  | "tilt"
  | "dolly"
  | "truck"
  | "orbit"
  | "handheld"
  | "static";

export type AIGenSpeedRampPreset = "none" | "linear" | "ease-in" | "ease-out" | "ease-in-out" | "custom";

export type AIGenEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export type AIGenFramesMode = "none" | "start-only" | "end-only" | "start-end";

export type AIGenFrameLocking = "none" | "soft" | "hard";

export type AIGenInterpolationStyle = "default" | "morph" | "blend" | "direct";

export type AIGenReferenceRole = "style" | "character" | "environment" | "other";

export type AIGenReferenceKind = "image" | "video" | "frame";

export type AIGenReferenceSource = "upload" | "timeline" | "source-monitor" | "last-frame" | "timecode";

export type AIGenMentionKind = "character" | "prop" | "environment" | "style" | "reference" | "asset";

export type AIGenCameraIntent = "handheld" | "cinematic" | "locked" | "documentary";

export type AIGenCameraPreset = "neutral" | "cinematic" | "action" | "documentary";

export type AIGenRightSidebarTab = "ai-generation" | "inspector";

export type AIGenCurvePoint = {
  x: number;
  y: number;
};

export type AIGenFrameRef = {
  assetId: string | null;
  assetLabel: string;
  timeMs: number;
  thumbnailUrl: string | null;
  source: "source-monitor" | "timeline-program";
};

export type AIGenMention = {
  id: string;
  label: string;
  kind: AIGenMentionKind;
  token: string;
  tags: string[];
};

export type AIGenPromptConfig = {
  text: string;
  negativeText: string;
  adherence: number;
  seedMode: AIGenSeedMode;
  seed: number | null;
  variationCount: number;
  mentions: AIGenMention[];
};

export type AIGenEngineConfig = {
  mode: EngineMode;
  engineId: EngineId;
  modelId: string;
};

export type AIGenOutputConfig = {
  shotMode: AIGenShotMode;
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9" | "21:9";
  resolution: "720p" | "1080p" | "1440p" | "4k";
  durationSec: number;
  batchCount: number;
  fps: 24 | 25 | 30 | 60;
  upscale: boolean;
  bestOf: number;
  exportPreset: "none" | "tiktok" | "shorts" | "youtube" | "ads";
};

export type AIGenMotionConfig = {
  movementMode: AIGenMovementMode;
  intensity: number;
  speedRampPreset: AIGenSpeedRampPreset;
  customCurve: AIGenCurvePoint[];
  segmentEasings: AIGenEasing[];
  stabilization: boolean;
  loopable: boolean;
};

export type AIGenDirectorConfig = {
  lockIdentity: boolean;
  genre: "none" | "action" | "drama" | "comedy" | "sci-fi" | "horror";
  mood: "neutral" | "warm" | "dark" | "dreamy" | "tense";
  sceneFlow: number;
  cameraIntent: AIGenCameraIntent;
  actionLevel: number;
  chaosLevel: number;
  emotionLevel: number;
  continuity: boolean;
};

export type AIGenFramesConfig = {
  mode: AIGenFramesMode;
  startFrame: AIGenFrameRef | null;
  endFrame: AIGenFrameRef | null;
  frameLocking: AIGenFrameLocking;
  interpolationStyle: AIGenInterpolationStyle;
};

export type AIGenReference = {
  id: string;
  role: AIGenReferenceRole;
  kind: AIGenReferenceKind;
  source: AIGenReferenceSource;
  weight: number;
  locked: boolean;
  url: string;
  label: string;
  timeMs?: number;
};

export type AIGenReferencesConfig = {
  items: AIGenReference[];
};

export type AIGenAdvancedConfig = {
  lensPreset: "none" | "premium-modern-prime" | "classic-anamorphic" | "vintage-spherical";
  focalLengthMm: number;
  aperture: "f/1.4" | "f/2" | "f/2.8" | "f/4" | "f/8" | "f/11";
  cameraPreset: AIGenCameraPreset;
};

export type AIGenConfig = {
  prompt: AIGenPromptConfig;
  engine: AIGenEngineConfig;
  output: AIGenOutputConfig;
  motion: AIGenMotionConfig;
  director: AIGenDirectorConfig;
  frames: AIGenFramesConfig;
  references: AIGenReferencesConfig;
  advanced: AIGenAdvancedConfig;
};

export type AIGenerationRequestRecord = {
  id: string;
  createdAt: string;
  status: "queued";
  configSnapshot: AIGenConfig;
  effectiveConfig: AIGenConfig;
  gatedOffFields: string[];
  engineId: EngineId;
  modelId: string;
  mode: EngineMode;
  batchCount: number;
};

export type PromptVersionRecord = {
  id: string;
  createdAt: string;
  prompt: string;
  negativePrompt: string;
  engineId: EngineId;
  modelId: string;
  seedMode: AIGenSeedMode;
  seed: number | null;
};

export type AIGenerationState = {
  current: AIGenConfig;
  history: AIGenerationRequestRecord[];
  promptVersions: PromptVersionRecord[];
};

export type AIGenPreset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: AIGenConfig;
};

export type MentionCandidate = {
  id: string;
  label: string;
  token: string;
  kind: AIGenMentionKind;
  tags: string[];
};

export type MentionAssetSource = {
  id: string;
  kind: "video" | "audio" | "image";
  name?: string;
};

export type AIGenerationSourceContext = {
  sourceAssetId: string | null;
  sourceAssetLabel: string;
  sourcePlayheadMs: number;
  sourceThumbnailUrl: string | null;
  timelineAssetId: string | null;
  timelineAssetLabel: string;
  timelinePlayheadMs: number;
  timelineThumbnailUrl: string | null;
};

export type LegacySilenceCutState = {
  status: "idle" | "running" | "completed" | "failed";
  summary: string | null;
  suggestionCount: number;
  canApply: boolean;
};
