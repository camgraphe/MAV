export type AIGenRightSidebarTab = "ai-generation" | "inspector";

export type IntentBlockKind = "hook" | "scene" | "outro" | "vo" | "music" | "sfx";

export type IntentRenderStatus = "draft" | "queued" | "generating" | "ready" | "failed";

export type IntentRefStrength = "low" | "medium" | "high";

export type IntentAnglePreset =
  | "wide"
  | "close-up"
  | "ots-left"
  | "ots-right"
  | "low-angle"
  | "high-angle"
  | "profile-left"
  | "profile-right";

export type IntentFrameRef = {
  assetId: string | null;
  assetLabel: string;
  timeMs: number;
  thumbnailUrl: string | null;
  source: "source-monitor" | "timeline-program";
};

export type IntentBankRef = {
  id: string;
  label: string;
  thumbnailUrl: string | null;
  source: "source-monitor" | "timeline-program";
  assetId: string | null;
  timeMs: number;
  createdAt: string;
};

export type IntentReferenceBank = {
  characters: IntentBankRef[];
  objects: IntentBankRef[];
};

export type IntentClipRef = {
  bankRefId: string;
  strength: IntentRefStrength;
  locked: boolean;
};

export type IntentAudioIntent = {
  text: string;
  mood: string;
  tempo: number;
  intensity: number;
};

export type IntentSceneFalConfig = {
  cfgScale: number;
  generateAudio: boolean;
  voiceIds: string[];
};

export type IntentSceneMultiPromptShot = {
  prompt: string;
  durationSec: number;
};

export type IntentSceneShotType = "customize" | "intelligent";

export type IntentSceneMultiPromptConfig = {
  enabled: boolean;
  shots: IntentSceneMultiPromptShot[];
  shotType: IntentSceneShotType;
};

export type IntentSceneComposerConfig = {
  styleFrame: IntentFrameRef | null;
  fal: IntentSceneFalConfig;
  multiPrompt: IntentSceneMultiPromptConfig;
};

export type IntentOutputConfig = {
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9" | "21:9";
  durationSec: number;
  fps: 24 | 25 | 30 | 60;
};

export type IntentMotionConfig = {
  movement: "auto" | "pan" | "tilt" | "dolly" | "orbit" | "static";
  intensity: number;
};

export type IntentContract = {
  blockKind: IntentBlockKind;
  title: string;
  prompt: string;
  negativePrompt: string;
  firstFrame: IntentFrameRef | null;
  endFrame: IntentFrameRef | null;
  characterRefs: IntentClipRef[];
  objectRefs: IntentClipRef[];
  output: IntentOutputConfig;
  motion: IntentMotionConfig;
  anglePreset: IntentAnglePreset | null;
  matchLensAndLighting: boolean;
  audio: IntentAudioIntent;
  sceneComposer: IntentSceneComposerConfig;
};

export type IntentRenderVersion = {
  id: string;
  createdAt: string;
  status: Exclude<IntentRenderStatus, "draft">;
  contractSnapshot: IntentContract;
  outputAssetId: string | null;
  thumbnailUrl: string | null;
  error: string | null;
};

export type IntentRenderState = {
  status: IntentRenderStatus;
  progressPct: number;
  queuedAt: string | null;
  activeVersionId: string | null;
  versions: IntentRenderVersion[];
  error: string | null;
  hasDraftChanges: boolean;
};

export type AIGenerationState = {
  selectedClipId: string | null;
  referenceBank: IntentReferenceBank;
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

export type IntentCreateTemplate = {
  kind: IntentBlockKind;
  label: string;
};

// Compatibility aliases for existing modules while the editor migrates to intent-first naming.
export type AIGenConfig = IntentContract;

export type AIGenPreset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: IntentContract;
};

export type MentionCandidate = {
  id: string;
  label: string;
  token: string;
  kind: "character" | "prop" | "environment" | "style" | "reference" | "asset";
  tags: string[];
};
