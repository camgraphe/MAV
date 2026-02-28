import type { IntentBankRef, IntentClipRef, IntentContract, IntentFrameRef, IntentReferenceBank } from "./types";
import { clampSceneBlockDurationSec } from "./scene-engine-limits";

const KLING_TEXT_TO_VIDEO_ENDPOINT = "fal-ai/kling-video/v3/pro/text-to-video";
const KLING_IMAGE_TO_VIDEO_ENDPOINT = "fal-ai/kling-video/v3/pro/image-to-video";

type SceneFalAsset = {
  id: string;
  kind: "video" | "audio" | "image";
  url: string;
  name?: string;
};

type BuildSceneFalRequestContext = {
  assets: SceneFalAsset[];
  referenceBank: IntentReferenceBank;
};

export type SceneFalMode = "text-to-video" | "image-to-video";

export type SceneFalRequest = {
  mode: SceneFalMode;
  endpoint: string;
  input: Record<string, unknown>;
  warnings: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDurationSec(input: number): number {
  return clampSceneBlockDurationSec(input);
}

function normalizeAspectRatio(input: IntentContract["output"]["aspectRatio"]): "16:9" | "9:16" | "1:1" {
  if (input === "9:16" || input === "1:1") return input;
  return "16:9";
}

function normalizeVoiceIds(voiceIds: string[]): string[] {
  return voiceIds
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 2);
}

function resolveAssetUrl(assetsById: Map<string, SceneFalAsset>, assetId: string | null): string | null {
  if (!assetId) return null;
  const asset = assetsById.get(assetId);
  return asset?.url ?? null;
}

function resolveFrameUrl(frame: IntentFrameRef | null, assetsById: Map<string, SceneFalAsset>): {
  url: string | null;
  usedThumbnailFallback: boolean;
} {
  if (!frame) return { url: null, usedThumbnailFallback: false };
  const assetUrl = resolveAssetUrl(assetsById, frame.assetId);
  if (assetUrl) {
    return { url: assetUrl, usedThumbnailFallback: false };
  }
  if (frame.thumbnailUrl) {
    return { url: frame.thumbnailUrl, usedThumbnailFallback: true };
  }
  return { url: null, usedThumbnailFallback: false };
}

function resolvePrimaryReference(refs: IntentClipRef[], bank: IntentBankRef[]): IntentBankRef | null {
  if (refs.length === 0) return null;
  const primaryId = refs[0]?.bankRefId;
  if (!primaryId) return null;
  return bank.find((entry) => entry.id === primaryId) ?? null;
}

function resolveBankRefUrl(ref: IntentBankRef | null, assetsById: Map<string, SceneFalAsset>): {
  url: string | null;
  usedThumbnailFallback: boolean;
} {
  if (!ref) return { url: null, usedThumbnailFallback: false };
  const assetUrl = resolveAssetUrl(assetsById, ref.assetId);
  if (assetUrl) {
    return { url: assetUrl, usedThumbnailFallback: false };
  }
  if (ref.thumbnailUrl) {
    return { url: ref.thumbnailUrl, usedThumbnailFallback: true };
  }
  return { url: null, usedThumbnailFallback: false };
}

export function buildSceneFalRequest(contract: IntentContract, context: BuildSceneFalRequestContext): SceneFalRequest {
  const warnings: string[] = [];
  const assetsById = new Map(context.assets.map((asset) => [asset.id, asset]));

  const mode: SceneFalMode = contract.firstFrame ? "image-to-video" : "text-to-video";
  const endpoint = mode === "image-to-video" ? KLING_IMAGE_TO_VIDEO_ENDPOINT : KLING_TEXT_TO_VIDEO_ENDPOINT;

  const duration = normalizeDurationSec(contract.output.durationSec);
  const aspectRatio = normalizeAspectRatio(contract.output.aspectRatio);
  const cfgScale = clamp(contract.sceneComposer.fal.cfgScale, 0, 1);
  const voiceIds = normalizeVoiceIds(contract.sceneComposer.fal.voiceIds);
  const multiPromptEnabled = contract.sceneComposer.multiPrompt.enabled;
  const sanitizedShots = contract.sceneComposer.multiPrompt.shots
    .map((shot) => ({
      prompt: shot.prompt.trim(),
      duration: String(normalizeDurationSec(shot.durationSec)),
    }))
    .filter((shot) => shot.prompt.length > 0);

  const basePrompt = contract.prompt.trim();
  if (!basePrompt && !multiPromptEnabled) {
    warnings.push("Prompt is empty. A fallback prompt was used.");
  }

  const styleLabel = contract.sceneComposer.styleFrame?.assetLabel?.trim() ?? "";

  const primaryCharacter = resolvePrimaryReference(contract.characterRefs, context.referenceBank.characters);
  const primaryObject = resolvePrimaryReference(contract.objectRefs, context.referenceBank.objects);

  const characterUrl = resolveBankRefUrl(primaryCharacter, assetsById);
  const objectUrl = resolveBankRefUrl(primaryObject, assetsById);

  if (characterUrl.usedThumbnailFallback) {
    warnings.push("Character reference uses thumbnail fallback URL.");
  }
  if (objectUrl.usedThumbnailFallback) {
    warnings.push("Object reference uses thumbnail fallback URL.");
  }

  const promptHints: string[] = [];
  if (styleLabel) {
    promptHints.push(`Style/look reference: ${styleLabel}.`);
  }

  const elements: Array<Record<string, unknown>> = [];

  if (mode === "image-to-video") {
    if (primaryCharacter && characterUrl.url) {
      elements.push({ type: "character", label: primaryCharacter.label, image_url: characterUrl.url });
    } else if (primaryCharacter) {
      warnings.push("Character reference could not be resolved to an URL; added as text hint.");
      promptHints.push(`Character reference: ${primaryCharacter.label}.`);
    }

    if (primaryObject && objectUrl.url) {
      elements.push({ type: "object", label: primaryObject.label, image_url: objectUrl.url });
    } else if (primaryObject) {
      warnings.push("Object reference could not be resolved to an URL; added as text hint.");
      promptHints.push(`Object reference: ${primaryObject.label}.`);
    }
  } else {
    if (primaryCharacter) {
      promptHints.push(`Character reference: ${primaryCharacter.label}.`);
    }
    if (primaryObject) {
      promptHints.push(`Object reference: ${primaryObject.label}.`);
    }
  }

  const finalPrompt = [basePrompt || "Cinematic scene with clear subject and movement.", ...promptHints].join("\n");

  const input: Record<string, unknown> = {
    duration: String(duration),
    aspect_ratio: aspectRatio,
    cfg_scale: cfgScale,
    generate_audio: Boolean(contract.sceneComposer.fal.generateAudio),
  };

  if (multiPromptEnabled) {
    if (sanitizedShots.length === 0) {
      warnings.push("Multi-prompt is enabled but no shot prompt is set; falling back to single prompt.");
      input.prompt = finalPrompt;
    } else {
      input.multi_prompt = sanitizedShots.map((shot) => ({
        prompt: shot.prompt,
        duration: shot.duration,
      }));
      input.shot_type = mode === "image-to-video" ? "customize" : contract.sceneComposer.multiPrompt.shotType;
    }
  } else {
    input.prompt = finalPrompt;
  }

  if (voiceIds.length > 0) {
    input.voice_ids = voiceIds;
  }

  const negativePrompt = contract.negativePrompt.trim();
  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  if (mode === "image-to-video") {
    const startImage = resolveFrameUrl(contract.firstFrame, assetsById);
    if (startImage.usedThumbnailFallback) {
      warnings.push("Start image uses thumbnail fallback URL.");
    }
    if (!startImage.url) {
      warnings.push("Start image could not be resolved to an URL.");
    } else {
      input.start_image_url = startImage.url;
    }
    const endImage = resolveFrameUrl(contract.endFrame, assetsById);
    if (endImage.usedThumbnailFallback) {
      warnings.push("End image uses thumbnail fallback URL.");
    }
    if (endImage.url) {
      input.end_image_url = endImage.url;
    }
    if (elements.length > 0) {
      input.elements = elements;
    }
  }

  if (contract.sceneComposer.fal.voiceIds.length > 2) {
    warnings.push("Only two voice IDs are supported; extra values were ignored.");
  }

  return {
    mode,
    endpoint,
    input,
    warnings,
  };
}
