export type SilenceCutTrack = {
  id: string;
  kind: "video" | "overlay" | "audio";
  locked: boolean;
  clips: Array<{
    id: string;
    label: string;
    assetId: string;
    startMs: number;
    durationMs: number;
    inMs: number;
    outMs: number;
  }>;
};

export type SilenceCutAsset = {
  id: string;
  kind: "video" | "audio" | "image";
  durationMs?: number;
  waveform?: number[];
};

export type SilenceCutPluginInput = {
  projectId: string;
  tracks: SilenceCutTrack[];
  assets: SilenceCutAsset[];
  params: {
    threshold: number;
    minSilenceMs: number;
    minKeepMs: number;
  };
};

export type SilenceCutClipPatch = {
  trackId: string;
  clipId: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  trimStartMs: number;
  trimEndMs: number;
  removedMs: number;
};

export type SilenceCutSuggestion = {
  trackId: string;
  clipId: string;
  clipLabel: string;
  removedMs: number;
  trimStartMs: number;
  trimEndMs: number;
  confidence: number;
};

export type SilenceCutPluginOutput = {
  pluginId: "silence-cut-v1";
  runId: string;
  hash: string;
  startedAt: string;
  finishedAt: string;
  summary: string;
  suggestions: SilenceCutSuggestion[];
  clipPatches: SilenceCutClipPatch[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableInput(input: SilenceCutPluginInput): SilenceCutPluginInput {
  const tracks = [...input.tracks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((track) => ({
      ...track,
      clips: [...track.clips].sort((a, b) => a.id.localeCompare(b.id)),
    }));
  const assets = [...input.assets].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...input,
    tracks,
    assets,
  };
}

function computeTrim(
  waveform: number[],
  assetDurationMs: number,
  clipInMs: number,
  clipDurationMs: number,
  minSilenceMs: number,
  threshold: number,
  minKeepMs: number,
): { trimStartMs: number; trimEndMs: number; removedMs: number; confidence: number } | null {
  if (waveform.length < 8 || assetDurationMs <= 0 || clipDurationMs <= minKeepMs) return null;
  const totalBins = waveform.length;
  const clipStartIndex = clamp(Math.floor((clipInMs / assetDurationMs) * totalBins), 0, totalBins - 1);
  const clipEndIndex = clamp(
    Math.ceil(((clipInMs + clipDurationMs) / assetDurationMs) * totalBins),
    clipStartIndex + 1,
    totalBins,
  );
  const segment = waveform.slice(clipStartIndex, clipEndIndex);
  if (segment.length < 2) return null;
  const binMs = clipDurationMs / segment.length;

  let leadBins = 0;
  while (leadBins < segment.length && segment[leadBins] < threshold) {
    leadBins += 1;
  }

  let tailBins = 0;
  while (tailBins < segment.length - leadBins && segment[segment.length - 1 - tailBins] < threshold) {
    tailBins += 1;
  }

  let trimStartMs = leadBins * binMs >= minSilenceMs ? Math.round(leadBins * binMs) : 0;
  let trimEndMs = tailBins * binMs >= minSilenceMs ? Math.round(tailBins * binMs) : 0;
  const maxTrim = Math.max(0, clipDurationMs - minKeepMs);
  if (maxTrim <= 0 || trimStartMs + trimEndMs <= 0) return null;

  if (trimStartMs + trimEndMs > maxTrim) {
    const factor = maxTrim / (trimStartMs + trimEndMs);
    trimStartMs = Math.floor(trimStartMs * factor);
    trimEndMs = Math.floor(trimEndMs * factor);
  }

  const removedMs = trimStartMs + trimEndMs;
  if (removedMs <= 0) return null;

  const lowEnergyBins = segment.filter((value) => value < threshold).length;
  const confidence = clamp(lowEnergyBins / Math.max(1, segment.length), 0.1, 1);
  return { trimStartMs, trimEndMs, removedMs, confidence };
}

export async function runSilenceCutPlugin(input: SilenceCutPluginInput): Promise<SilenceCutPluginOutput> {
  const startedAt = new Date().toISOString();
  const normalized = stableInput(input);
  const hash = hashString(JSON.stringify(normalized));
  const runId = `silence-${hash.slice(0, 8)}`;
  const assetMap = new Map(normalized.assets.map((asset) => [asset.id, asset]));
  const suggestions: SilenceCutSuggestion[] = [];
  const clipPatches: SilenceCutClipPatch[] = [];
  const threshold = clamp(normalized.params.threshold, 0.02, 0.9);
  const minSilenceMs = Math.max(80, Math.round(normalized.params.minSilenceMs));
  const minKeepMs = Math.max(200, Math.round(normalized.params.minKeepMs));

  for (const track of normalized.tracks) {
    if (track.kind !== "video" || track.locked) continue;
    for (const clip of track.clips) {
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.kind !== "video") continue;
      const waveform = asset.waveform ?? [];
      const assetDurationMs = Math.max(asset.durationMs ?? 0, clip.outMs, clip.inMs + clip.durationMs);
      const trim = computeTrim(
        waveform,
        assetDurationMs,
        clip.inMs,
        clip.durationMs,
        minSilenceMs,
        threshold,
        minKeepMs,
      );
      if (!trim) continue;

      const nextStartMs = clip.startMs + trim.trimStartMs;
      const nextInMs = clip.inMs + trim.trimStartMs;
      const nextDurationMs = clip.durationMs - trim.removedMs;
      const nextOutMs = nextInMs + nextDurationMs;

      if (nextDurationMs < minKeepMs) continue;

      suggestions.push({
        trackId: track.id,
        clipId: clip.id,
        clipLabel: clip.label,
        removedMs: trim.removedMs,
        trimStartMs: trim.trimStartMs,
        trimEndMs: trim.trimEndMs,
        confidence: trim.confidence,
      });

      clipPatches.push({
        trackId: track.id,
        clipId: clip.id,
        startMs: nextStartMs,
        inMs: nextInMs,
        durationMs: nextDurationMs,
        outMs: nextOutMs,
        trimStartMs: trim.trimStartMs,
        trimEndMs: trim.trimEndMs,
        removedMs: trim.removedMs,
      });
    }
  }

  // Keep asynchronous shape for real job parity without introducing non-determinism.
  await new Promise((resolve) => setTimeout(resolve, 220));

  const finishedAt = new Date().toISOString();
  const totalRemovedMs = clipPatches.reduce((sum, patch) => sum + patch.removedMs, 0);
  const summary =
    clipPatches.length > 0
      ? `Detected ${clipPatches.length} silence trims (removed ${totalRemovedMs}ms).`
      : "No silence trims detected.";

  return {
    pluginId: "silence-cut-v1",
    runId,
    hash,
    startedAt,
    finishedAt,
    summary,
    suggestions,
    clipPatches,
  };
}
