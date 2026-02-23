const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 90;
const DEFAULT_POINTS = 96;
const SEEK_TIMEOUT_MS = 3000;
const METADATA_TIMEOUT_MS = 5000;

export type RealMediaAnalysis = {
  thumbnails: string[];
  waveform: number[];
  codecGuess: string | null;
  durationMs?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
};

type AnalyzeOptions = {
  durationMs?: number;
  thumbnailsPerSecond?: number;
  maxThumbnails?: number;
  waveformPoints?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function guessCodecFromMimeType(mimeType: string): string | null {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("av01")) return "AV1";
  if (normalized.includes("vp9") || normalized.includes("vp09")) return "VP9";
  if (normalized.includes("hevc") || normalized.includes("hvc1") || normalized.includes("hev1")) return "HEVC";
  if (normalized.includes("avc1") || normalized.includes("h264") || normalized.includes("mp4")) return "H.264";
  return null;
}

function createProbeVideo(url: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  return video;
}

function cleanupProbeVideo(video: HTMLVideoElement, url: string) {
  video.pause();
  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(url);
}

function waitForMetadata(video: HTMLVideoElement, timeoutMs = METADATA_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("metadata timeout"));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onError);
    };

    const onLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("metadata error"));
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("error", onError);
  });
}

function seekVideo(video: HTMLVideoElement, targetSeconds: number, timeoutMs = SEEK_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = Number.isFinite(video.duration) ? video.duration : targetSeconds;
    const clampedTarget = clamp(targetSeconds, 0, Math.max(0, duration - 0.001));
    if (Math.abs(video.currentTime - clampedTarget) < 0.0005) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("seek timeout"));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("seek error"));
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = clampedTarget;
  });
}

async function captureVideoThumbnails(
  file: File,
  requestedDurationMs: number,
  thumbnailsPerSecond: number,
  maxThumbnails: number,
): Promise<{ thumbnails: string[]; durationMs?: number; width?: number; height?: number }> {
  const url = URL.createObjectURL(file);
  const video = createProbeVideo(url);
  try {
    await waitForMetadata(video);
    const durationMs = Math.max(0, Math.round(video.duration * 1000));
    const effectiveDurationMs = requestedDurationMs > 0 ? requestedDurationMs : durationMs;
    const durationSeconds = Math.max(0.2, effectiveDurationMs / 1000);
    const count = clamp(Math.round(durationSeconds * thumbnailsPerSecond), 4, maxThumbnails);
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) {
      return { thumbnails: [], durationMs, width: video.videoWidth, height: video.videoHeight };
    }

    const thumbnails: string[] = [];
    const timelineDuration = Math.max(0.04, video.duration);
    const maxSeekTime = Math.max(0, timelineDuration - 0.04);
    for (let i = 0; i < count; i += 1) {
      const progress = count <= 1 ? 0 : i / (count - 1);
      const seekTime = maxSeekTime * progress;
      try {
        await seekVideo(video, seekTime);
      } catch {
        continue;
      }
      context.clearRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      context.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      thumbnails.push(canvas.toDataURL("image/jpeg", 0.76));
    }

    return {
      thumbnails,
      durationMs,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
    };
  } finally {
    cleanupProbeVideo(video, url);
  }
}

async function captureWaveform(
  file: File,
  points: number,
): Promise<{ waveform: number[]; hasAudio?: boolean }> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return { waveform: [], hasAudio: undefined };
  }

  const audioContext = new AudioContextCtor();
  try {
    const buffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    const channelCount = Math.max(1, audioBuffer.numberOfChannels);
    const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
    const sampleCount = audioBuffer.length;
    const hasAudio = channelCount > 0 && sampleCount > 0;
    const bucketSize = Math.max(1, Math.floor(sampleCount / points));
    const waveform: number[] = [];

    for (let bucket = 0; bucket < points; bucket += 1) {
      const start = bucket * bucketSize;
      const end = Math.min(sampleCount, start + bucketSize);
      if (start >= end) {
        waveform.push(0.06);
        continue;
      }

      const stride = Math.max(1, Math.floor((end - start) / 180));
      let peak = 0;
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += stride) {
        let mixed = 0;
        for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
          mixed += Math.abs(channels[channelIndex]?.[sampleIndex] ?? 0);
        }
        mixed /= channels.length;
        if (mixed > peak) {
          peak = mixed;
        }
      }

      waveform.push(clamp(Math.sqrt(peak), 0.06, 1));
    }

    return { waveform, hasAudio };
  } catch {
    return { waveform: [], hasAudio: undefined };
  } finally {
    try {
      await audioContext.close();
    } catch {
      // no-op
    }
  }
}

export async function analyzeMediaFile(file: File, options: AnalyzeOptions = {}): Promise<RealMediaAnalysis> {
  const thumbnailsPerSecond = clamp(Math.round(options.thumbnailsPerSecond ?? 1), 1, 2);
  const maxThumbnails = clamp(Math.round(options.maxThumbnails ?? 12), 4, 18);
  const waveformPoints = clamp(Math.round(options.waveformPoints ?? DEFAULT_POINTS), 24, 160);
  const requestedDurationMs = Math.max(0, Math.round(options.durationMs ?? 0));

  const [thumbResult, waveResult] = await Promise.all([
    captureVideoThumbnails(file, requestedDurationMs, thumbnailsPerSecond, maxThumbnails).catch(() => ({
      thumbnails: [] as string[],
      durationMs: undefined,
      width: undefined,
      height: undefined,
    })),
    captureWaveform(file, waveformPoints).catch(() => ({ waveform: [] as number[], hasAudio: undefined })),
  ]);

  return {
    thumbnails: thumbResult.thumbnails,
    waveform: waveResult.waveform,
    codecGuess: guessCodecFromMimeType(file.type),
    durationMs: thumbResult.durationMs,
    width: thumbResult.width,
    height: thumbResult.height,
    hasAudio: waveResult.hasAudio,
  };
}
