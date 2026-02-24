import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import projectSchema from "../contracts/project.schema.v1.json";
import type {
  DecodeWorkerInMessage,
  DecodeWorkerOutMessage,
} from "./preview/protocol";
import { EditorShell } from "./components/EditorShell/EditorShell";
import { TopToolbar } from "./components/EditorShell/TopToolbar";
import { AboutModal } from "./components/EditorShell/AboutModal";
import { ProjectSettingsModal } from "./components/EditorShell/ProjectSettingsModal";
import { TimelinePanel } from "./components/Timeline/TimelinePanel";
import { PreviewPanel } from "./components/Preview/PreviewPanel";
import { InspectorPanel } from "./components/Inspector/InspectorPanel";
import { MediaBinPanel } from "./components/MediaBin/MediaBinPanel";
import { LibraryPanel } from "./components/MediaBin/LibraryPanel";
import { DiagnosticsPanel } from "./components/Diagnostics/DiagnosticsPanel";
import { ExportModal } from "./components/Export/ExportModal";
import { analyzeMediaFile, captureQuickVideoThumbnail } from "./preview/media-analysis";
import {
  runSilenceCutPlugin,
  type SilenceCutPluginInput,
  type SilenceCutPluginOutput,
} from "./ai/silenceCutPlugin";

type TrackKind = "video" | "overlay" | "audio";

type OverlayTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

type ClipFitMode = "pixel-100" | "adapt";

type ClipVisual = {
  x: number;
  y: number;
  scalePct: number;
  rotationDeg: number;
  opacityPct: number;
  fitMode: ClipFitMode;
};

type ClipMediaRole = "video" | "audio" | "overlay";

type Clip = {
  id: string;
  label: string;
  assetId: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  mediaRole?: ClipMediaRole;
  linkGroupId?: string;
  linkLocked?: boolean;
  visual?: ClipVisual;
  transform?: OverlayTransform;
};

type Track = {
  id: string;
  kind: TrackKind;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
};

type ProjectState = {
  schemaVersion: "mav.project.v0" | "mav.project.v1";
  meta: {
    projectId: string;
    createdAt: string;
    updatedAt: string;
    fps: number;
    width: number;
    height: number;
  };
  assets: Asset[];
  timeline: {
    durationMs: number;
    tracks: Track[];
  };
};

type Asset = {
  id: string;
  kind: "video" | "audio" | "image";
  url: string;
  durationMs?: number;
  name?: string;
  codec?: string;
  width?: number;
  height?: number;
  heroThumbnail?: string;
  thumbnails?: string[];
  waveform?: number[];
  hasAudio?: boolean;
};

type Selection = {
  trackId: string;
  clipId: string;
};

type InteractionMode = "move" | "resize-start" | "resize-end";

type DragState = {
  pointerId: number;
  mode: InteractionMode;
  trackId: string;
  clipId: string;
  clipRole: ClipMediaRole;
  startClientX: number;
  startClientY: number;
  latestClientX: number;
  latestClientY: number;
  original: Clip;
  linkedClips: ClipWithRef[];
  snapTargetsMs: number[];
  thresholdMs: number;
};

type InteractionPreview = {
  trackId: string;
  clipId: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  snapGuideMs: number | null;
  createTrackKind?: "video" | "audio";
  createTrackEdge?: "above" | "below";
};

type ProgramClipContext = {
  trackId: string;
  clipId: string;
  role: ClipMediaRole;
  assetId: string;
  assetKind: "video" | "image";
  assetUrl: string;
  trackOrder: number;
  visual: ClipVisual;
  sourceWidth: number | null;
  sourceHeight: number | null;
  clipStartMs: number;
  clipEndMs: number;
  inMs: number;
  outMs: number;
  localMs: number;
};

type CollisionMode = "no-overlap" | "push" | "allow-overlap";
type RippleMode = "none" | "ripple-delete";

type SeekReason = "preview" | "qa";

type SeekResultMessage = Extract<DecodeWorkerOutMessage, { type: "seekResult" }>;
type DecoderErrorMessage = Extract<DecodeWorkerOutMessage, { type: "decoderError" }>;

type PendingSeek = {
  resolve: (result: SeekResultMessage) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

type QAMetric = {
  runAt: string;
  profile: string;
  totalScenarios: number;
  time_to_first_frame_ms: number;
  seek_success_pct: number;
  decode_errors: number;
  stale_results: number;
  drift_within_1frame_pct: number;
  avg_drift_ms: number;
  max_drift_ms: number;
};

type DecodeQaRunOptions = {
  profile?: string;
  scenarioCount?: number;
  seed?: number;
};

type DecodeQaScenarioResult = {
  scenarioId: number;
  requestId: number;
  targetUs: number;
  timestampUs: number | null;
  status: "ok" | "error" | "stale";
  fromCache: boolean;
  decodeMs: number;
  skippedToIdrSamples: number;
  keyframeStartUs: number | null;
  message?: string;
  driftUs: number | null;
  driftFrames: number | null;
};

type DecodeQaRunResult = {
  metric: QAMetric | null;
  scenarios: DecodeQaScenarioResult[];
  diagnostics: {
    decoderErrors: DecoderErrorMessage[];
    decoderErrorBuckets: Array<{ key: string; count: number }>;
    seekErrors: Array<{
      requestId: number;
      targetUs: number;
      message: string;
      skippedToIdrSamples: number;
    }>;
    seekErrorBuckets: Array<{ key: string; count: number }>;
    requestStats: {
      evaluatedScenarios: number;
      totalSeekRequests: number;
    };
    lastSeekResult: SeekResultMessage | null;
    idrSkipStats: {
      totalSkips: number;
      maxSkips: number;
      seekWithSkips: number;
    };
    source: {
      decoderMode: "none" | "webcodecs" | "fallback";
      isFmp4Source: boolean;
      codec: string | null;
      codedWidth: number | null;
      codedHeight: number | null;
      descriptionLength: number | null;
      timestampAuditIssueCount: number | null;
      fps: number | null;
    };
  };
};

type DecodeQaApi = {
  run: (options?: DecodeQaRunOptions) => Promise<DecodeQaRunResult>;
  getLastRun: () => DecodeQaRunResult | null;
  getLastMetric: () => QAMetric | null;
  exportLastMetric: () => boolean;
  getState: () => {
    decoderMode: "none" | "webcodecs" | "fallback";
    isFmp4Source: boolean;
    qaRunning: boolean;
    qaProfile: string;
    qaScenarioCount: number;
  };
};

type ExportJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";
type ExportPreset = "720p" | "1080p";
type ExportFps = 24 | 30 | 60;
type ExportFormat = "mp4";

type ExportOptions = {
  preset: ExportPreset;
  fps: ExportFps;
  format: ExportFormat;
};

type ExportJobState = {
  jobId: string;
  status: ExportJobStatus;
  progress: number;
  attempts?: number;
  renderOptions?: ExportOptions;
  sourceAssetCount?: number;
  createdAt?: string;
  updatedAt?: string;
  outputUrl?: string;
  error?: string;
};

type AiJobStatus = "idle" | "running" | "completed" | "failed";

type AnalysisWorkerInMessage = {
  type: "analyze";
  assetId: string;
  buffer: ArrayBuffer;
  durationMs: number;
  thumbnailsPerSecond?: number;
};

type AnalysisWorkerOutMessage = {
  type: "analysis";
  assetId: string;
  waveform: number[];
  heroThumbnail?: string;
  thumbnails: string[];
  codecGuess: string | null;
};

type AssetAnalysisCacheValue = {
  waveform: number[];
  heroThumbnail?: string;
  thumbnails: string[];
  codecGuess: string | null;
  durationMs?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
};

type EditorLayout = {
  leftPx: number;
  rightPx: number;
  bottomPx: number;
  sourceSplitPct: number;
};

type StoredEditorLayoutV1 = {
  v: 1;
  leftPx: number;
  rightPx: number;
  bottomPx: number;
  sourceSplitPct: number;
};

type SourceRangeState = {
  inMs: number | null;
  outMs: number | null;
  lastPlayheadMs: number;
};

declare global {
  interface Window {
    __MAV_DECODE_QA__?: DecodeQaApi;
  }
}

const STORAGE_KEY = "mav.poc.editor.state.v2";
const ANALYSIS_CACHE_KEY = "mav.poc.editor.analysis-cache.v1";
const EXPORT_SESSION_KEY = "mav.poc.editor.export-session.v1";
const EDITOR_LAYOUT_STORAGE_KEY = "mav.editor.layout.v1";
const SOURCE_RANGE_STORAGE_KEY = "mav.source.ranges.v1";
const MIN_CLIP_DURATION_MS = 100;
const DEFAULT_QA_SCENARIOS = 50;
const HISTORY_LIMIT = 80;
const PLAYBACK_TICK_LIMIT_MS = 50;
const ANALYSIS_CACHE_LIMIT = 24;
const EXPORT_HISTORY_LIMIT = 8;
const DESKTOP_LAYOUT_BREAKPOINT = 1100;
const LEFT_PANEL_MIN_PX = 220;
const LEFT_PANEL_MAX_PX = 760;
const RIGHT_PANEL_MIN_PX = 260;
const RIGHT_PANEL_MAX_PX = 760;
const TIMELINE_MIN_PX = 180;
const SOURCE_SPLIT_MIN_PCT = 28;
const SOURCE_SPLIT_MAX_PCT = 55;

function toUs(ms: number): number {
  return Math.round(ms * 1000);
}

function fromUs(us: number): number {
  return us / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampSourcePoint(value: number | null, durationMs: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp(Math.round(value), 0, Math.max(0, Math.round(durationMs)));
}

function normalizeSourceRangePoints(
  inMs: number | null,
  outMs: number | null,
  durationMs: number,
): { inMs: number | null; outMs: number | null } {
  let nextIn = clampSourcePoint(inMs, durationMs);
  let nextOut = clampSourcePoint(outMs, durationMs);
  if (nextIn != null && nextOut != null && nextIn > nextOut) {
    const swap = nextIn;
    nextIn = nextOut;
    nextOut = swap;
  }
  return { inMs: nextIn, outMs: nextOut };
}

function resolveSourceWindow(range: SourceRangeState | undefined, durationMs: number): {
  inMs: number;
  outMs: number;
  durationMs: number;
  points: { inMs: number | null; outMs: number | null };
} {
  const safeDuration = Math.max(1, Math.round(durationMs));
  const points = normalizeSourceRangePoints(range?.inMs ?? null, range?.outMs ?? null, safeDuration);
  let startMs = 0;
  let endMs = safeDuration;
  if (points.inMs != null && points.outMs != null) {
    startMs = points.inMs;
    endMs = points.outMs;
  } else if (points.inMs != null) {
    startMs = points.inMs;
  } else if (points.outMs != null) {
    endMs = points.outMs;
  }

  if (endMs < startMs) {
    const swap = startMs;
    startMs = endMs;
    endMs = swap;
  }

  if (endMs <= startMs) {
    if (safeDuration >= MIN_CLIP_DURATION_MS) {
      startMs = clamp(startMs, 0, Math.max(0, safeDuration - MIN_CLIP_DURATION_MS));
      endMs = clamp(startMs + MIN_CLIP_DURATION_MS, 0, safeDuration);
    } else {
      startMs = 0;
      endMs = safeDuration;
    }
  }

  return {
    inMs: startMs,
    outMs: endMs,
    durationMs: Math.max(1, endMs - startMs),
    points,
  };
}

function cloneClipWithWindow(clip: Clip, startMs: number, endMs: number): Clip | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const durationMs = Math.round(endMs - startMs);
  if (durationMs < MIN_CLIP_DURATION_MS) return null;
  const offsetInMs = Math.round(startMs - clip.startMs);
  const inMs = Math.round(clip.inMs + offsetInMs);
  return sanitizeClip({
    ...clip,
    startMs: Math.round(startMs),
    durationMs,
    inMs,
    outMs: inMs + durationMs,
  });
}

function applyInsertGap(track: Track, insertAtMs: number, gapMs: number): Track {
  if (gapMs <= 0) return track;
  const insertAt = Math.max(0, Math.round(insertAtMs));
  const gap = Math.max(0, Math.round(gapMs));
  const nextClips: Clip[] = [];

  for (const source of sortClips(track.clips)) {
    const clip = sanitizeClip(source);
    const clipStart = clip.startMs;
    const clipEnd = clip.startMs + clip.durationMs;
    if (clipEnd <= insertAt) {
      nextClips.push(clip);
      continue;
    }
    if (clipStart >= insertAt) {
      nextClips.push(
        sanitizeClip({
          ...clip,
          startMs: clip.startMs + gap,
        }),
      );
      continue;
    }

    const left = cloneClipWithWindow(clip, clipStart, insertAt);
    const right = cloneClipWithWindow(clip, insertAt, clipEnd);
    if (left) nextClips.push(left);
    if (right) {
      nextClips.push(
        sanitizeClip({
          ...right,
          id: `clip-${crypto.randomUUID().slice(0, 8)}`,
          startMs: right.startMs + gap,
        }),
      );
    }
  }

  return { ...track, clips: sortClips(nextClips) };
}

function applyOverwriteWindow(track: Track, startMs: number, endMs: number): Track {
  if (endMs <= startMs) return track;
  const trimStart = Math.max(0, Math.round(startMs));
  const trimEnd = Math.max(trimStart, Math.round(endMs));
  const nextClips: Clip[] = [];

  for (const source of sortClips(track.clips)) {
    const clip = sanitizeClip(source);
    const clipStart = clip.startMs;
    const clipEnd = clip.startMs + clip.durationMs;

    if (clipEnd <= trimStart || clipStart >= trimEnd) {
      nextClips.push(clip);
      continue;
    }

    const left = cloneClipWithWindow(clip, clipStart, trimStart);
    const right = cloneClipWithWindow(clip, trimEnd, clipEnd);
    if (left) nextClips.push(left);
    if (right) {
      nextClips.push(
        sanitizeClip({
          ...right,
          id: `clip-${crypto.randomUUID().slice(0, 8)}`,
        }),
      );
    }
  }

  return { ...track, clips: sortClips(nextClips) };
}

function timelineBottomMaxPx(viewportHeight: number): number {
  return Math.max(TIMELINE_MIN_PX, Math.floor(viewportHeight * 0.62));
}

function createDefaultEditorLayout(viewportHeight: number): EditorLayout {
  return {
    leftPx: 280,
    rightPx: 320,
    bottomPx: clamp(Math.round(viewportHeight * 0.34), TIMELINE_MIN_PX, timelineBottomMaxPx(viewportHeight)),
    sourceSplitPct: 38,
  };
}

function normalizeEditorLayout(layout: EditorLayout, viewportHeight: number): EditorLayout {
  return {
    leftPx: clamp(layout.leftPx, LEFT_PANEL_MIN_PX, LEFT_PANEL_MAX_PX),
    rightPx: clamp(layout.rightPx, RIGHT_PANEL_MIN_PX, RIGHT_PANEL_MAX_PX),
    bottomPx: clamp(layout.bottomPx, TIMELINE_MIN_PX, timelineBottomMaxPx(viewportHeight)),
    sourceSplitPct: clamp(layout.sourceSplitPct, SOURCE_SPLIT_MIN_PCT, SOURCE_SPLIT_MAX_PCT),
  };
}

function readStoredEditorLayout(viewportHeight: number): EditorLayout {
  const fallback = createDefaultEditorLayout(viewportHeight);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredEditorLayoutV1> & { v?: number };
    if (parsed.v !== 1) return fallback;
    return normalizeEditorLayout(
      {
        leftPx: parsed.leftPx ?? fallback.leftPx,
        rightPx: parsed.rightPx ?? fallback.rightPx,
        bottomPx: parsed.bottomPx ?? fallback.bottomPx,
        sourceSplitPct: parsed.sourceSplitPct ?? fallback.sourceSplitPct,
      },
      viewportHeight,
    );
  } catch {
    return fallback;
  }
}

function persistEditorLayout(layout: EditorLayout) {
  try {
    const payload: StoredEditorLayoutV1 = {
      v: 1,
      leftPx: layout.leftPx,
      rightPx: layout.rightPx,
      bottomPx: layout.bottomPx,
      sourceSplitPct: layout.sourceSplitPct,
    };
    window.localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors; layout remains functional in memory.
  }
}

function quantize(value: number, step: number): number {
  if (step <= 1) return value;
  return Math.round(value / step) * step;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const input = target as HTMLInputElement;
    const type = (input.type || "text").toLowerCase();
    if (type === "range") return false;
    return true;
  }
  return target.isContentEditable;
}

function assetAnalysisCacheKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function getTrackSection(kind: TrackKind): "visual" | "audio" {
  return kind === "audio" ? "audio" : "visual";
}

function trackKindPriority(kind: TrackKind): number {
  if (kind === "overlay") return 0;
  if (kind === "video") return 1;
  return 2;
}

function orderTracksStrict(tracks: Track[]): Track[] {
  return tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => {
      const kindDiff = trackKindPriority(a.track.kind) - trackKindPriority(b.track.kind);
      if (kindDiff !== 0) return kindDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.track);
}

function nextTrackId(tracks: Track[], kind: TrackKind): string {
  const prefix = kind === "video" ? "video" : kind === "overlay" ? "overlay" : "audio";
  let index = tracks.filter((track) => track.kind === kind).length + 1;
  let nextId = `${prefix}-${index}`;
  while (tracks.some((track) => track.id === nextId)) {
    index += 1;
    nextId = `${prefix}-${index}`;
  }
  return nextId;
}

function findOrCreateUnlockedTrack(
  tracks: Track[],
  kind: TrackKind,
): { tracks: Track[]; trackIndex: number } | null {
  const existingIndex = tracks.findIndex((track) => track.kind === kind && !track.locked);
  if (existingIndex >= 0) return { tracks, trackIndex: existingIndex };

  const newTrack: Track = {
    id: nextTrackId(tracks, kind),
    kind,
    muted: false,
    locked: false,
    visible: true,
    clips: [],
  };

  const next = [...tracks];
  if (kind === "audio") {
    next.push(newTrack);
    return { tracks: next, trackIndex: next.length - 1 };
  }

  const firstAudioIndex = next.findIndex((track) => track.kind === "audio");
  const insertIndex = firstAudioIndex >= 0 ? firstAudioIndex : next.length;
  next.splice(insertIndex, 0, newTrack);
  return { tracks: next, trackIndex: insertIndex };
}

function insertTrackForOutOfBoundsDrag(
  tracks: Track[],
  kind: "video" | "audio",
  edge: "above" | "below",
): { tracks: Track[]; trackId: string } {
  const next = [...tracks];
  const trackId = nextTrackId(next, kind);
  const newTrack: Track = {
    id: trackId,
    kind,
    muted: false,
    locked: false,
    visible: true,
    clips: [],
  };

  if (kind === "audio") {
    if (edge === "above") {
      const firstAudioIndex = next.findIndex((track) => track.kind === "audio");
      const insertIndex = firstAudioIndex >= 0 ? firstAudioIndex : next.length;
      next.splice(insertIndex, 0, newTrack);
    } else {
      next.push(newTrack);
    }
    return { tracks: next, trackId };
  }

  const firstVideoIndex = next.findIndex((track) => track.kind === "video");
  const firstAudioIndex = next.findIndex((track) => track.kind === "audio");
  const lastVideoIndex = (() => {
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (next[index].kind === "video") return index;
    }
    return -1;
  })();

  if (edge === "above") {
    const insertIndex = firstVideoIndex >= 0 ? firstVideoIndex : (firstAudioIndex >= 0 ? firstAudioIndex : next.length);
    next.splice(insertIndex, 0, newTrack);
  } else if (lastVideoIndex >= 0) {
    next.splice(lastVideoIndex + 1, 0, newTrack);
  } else {
    const insertIndex = firstAudioIndex >= 0 ? firstAudioIndex : next.length;
    next.splice(insertIndex, 0, newTrack);
  }

  return { tracks: next, trackId };
}

function toMediaRole(kind: TrackKind): ClipMediaRole {
  if (kind === "audio") return "audio";
  if (kind === "overlay") return "overlay";
  return "video";
}

function effectiveClipRole(trackKind: TrackKind, clip: Clip): ClipMediaRole {
  return clip.mediaRole ?? toMediaRole(trackKind);
}

function isRoleCompatibleWithTrack(role: ClipMediaRole, trackKind: TrackKind): boolean {
  if (role === "audio") return trackKind === "audio";
  if (role === "overlay") return trackKind === "overlay";
  return trackKind === "video";
}

function defaultClipVisual(): ClipVisual {
  return {
    x: 0,
    y: 0,
    scalePct: 100,
    rotationDeg: 0,
    opacityPct: 100,
    fitMode: "pixel-100",
  };
}

function normalizeClipVisual(trackKind: TrackKind, clip: Clip): ClipVisual | undefined {
  const role = effectiveClipRole(trackKind, clip);
  if (role === "audio") return undefined;

  const defaults = defaultClipVisual();
  if (clip.visual) {
    return {
      x: Math.round(clip.visual.x),
      y: Math.round(clip.visual.y),
      scalePct: clamp(Math.round(clip.visual.scalePct), 1, 2000),
      rotationDeg: Math.round(clip.visual.rotationDeg),
      opacityPct: clamp(Math.round(clip.visual.opacityPct), 0, 100),
      fitMode: clip.visual.fitMode === "adapt" ? "adapt" : "pixel-100",
    };
  }

  if (clip.transform) {
    return {
      x: Math.round(clip.transform.x),
      y: Math.round(clip.transform.y),
      scalePct: clamp(Math.round(clip.transform.scale * 100), 1, 2000),
      rotationDeg: Math.round(clip.transform.rotation),
      opacityPct: defaults.opacityPct,
      fitMode: defaults.fitMode,
    };
  }

  return defaults;
}

function createInitialProject(): ProjectState {
  const now = new Date().toISOString();
  return {
    schemaVersion: "mav.project.v1",
    meta: {
      projectId: "poc-project",
      createdAt: now,
      updatedAt: now,
      fps: 30,
      width: 1920,
      height: 1080,
    },
    assets: [],
    timeline: {
      durationMs: 6000,
      tracks: [
        {
          id: "overlay-1",
          kind: "overlay",
          muted: false,
          locked: false,
          visible: true,
          clips: [],
        },
        {
          id: "video-1",
          kind: "video",
          muted: false,
          locked: false,
          visible: true,
          clips: [],
        },
        {
          id: "audio-1",
          kind: "audio",
          muted: false,
          locked: false,
          visible: true,
          clips: [],
        },
      ],
    },
  };
}

function normalizeProject(project: ProjectState): ProjectState {
  const tracks = orderTracksStrict(
    [...project.timeline.tracks]
    .map((track) => ({
      ...track,
      kind: (track.kind === "video" || track.kind === "overlay" || track.kind === "audio" ? track.kind : "video"),
      muted: Boolean((track as { muted?: unknown }).muted),
      locked: Boolean((track as { locked?: unknown }).locked),
      visible: (track as { visible?: unknown }).visible !== false,
      clips: [...track.clips]
        .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
        .map((clip) => ({
          ...clip,
          startMs: Math.round(clip.startMs),
          durationMs: Math.round(clip.durationMs),
          inMs: Math.round(clip.inMs),
          outMs: Math.round(clip.outMs),
          mediaRole: clip.mediaRole ?? toMediaRole(track.kind),
          linkGroupId: clip.linkGroupId,
          linkLocked: clip.linkGroupId ? clip.linkLocked !== false : false,
          visual: normalizeClipVisual(track.kind, clip),
        })),
    }))
  );

  const assets: Asset[] = project.assets.map((asset) => ({
    ...asset,
    hasAudio:
      typeof asset.hasAudio === "boolean"
        ? asset.hasAudio
        : undefined,
  }));

  const durationMs = Math.max(
    1000,
    ...tracks.flatMap((track) =>
      track.clips.map((clip) => clip.startMs + clip.durationMs),
    ),
  );

  return {
    ...project,
    schemaVersion: "mav.project.v1",
    meta: {
      ...project.meta,
      updatedAt: new Date().toISOString(),
    },
    assets,
    timeline: {
      durationMs,
      tracks,
    },
  };
}

function findClip(project: ProjectState, selection: Selection | null) {
  if (!selection) return null;
  const trackIndex = project.timeline.tracks.findIndex((t) => t.id === selection.trackId);
  if (trackIndex < 0) return null;
  const clipIndex = project.timeline.tracks[trackIndex].clips.findIndex((c) => c.id === selection.clipId);
  if (clipIndex < 0) return null;
  return { trackIndex, clipIndex };
}

function resolveVisualAsset(project: ProjectState, assetId: string): (Asset & { kind: "video" | "image" }) | null {
  return (
    project.assets.find(
      (entry): entry is Asset & { kind: "video" | "image" } =>
        entry.id === assetId && (entry.kind === "video" || entry.kind === "image"),
    ) ?? null
  );
}

function findProgramStackAtMs(project: ProjectState, playheadMs: number): ProgramClipContext[] {
  const visualTracks = project.timeline.tracks
    .map((track, trackOrder) => ({ track, trackOrder }))
    .filter(({ track }) => (track.kind === "video" || track.kind === "overlay") && track.visible);

  const stack: ProgramClipContext[] = [];
  for (const { track, trackOrder } of visualTracks) {
    for (const clip of track.clips) {
      const clipStartMs = clip.startMs;
      const clipEndMs = clip.startMs + clip.durationMs;
      if (playheadMs < clipStartMs || playheadMs >= clipEndMs) continue;

      const role = effectiveClipRole(track.kind, clip);
      if (role === "audio") continue;
      const asset = resolveVisualAsset(project, clip.assetId);
      if (!asset?.url) continue;
      const localMs = clamp(Math.round(clip.inMs + (playheadMs - clipStartMs)), clip.inMs, clip.outMs);
      stack.push({
        trackId: track.id,
        clipId: clip.id,
        role,
        assetId: clip.assetId,
        assetKind: asset.kind,
        assetUrl: asset.url,
        trackOrder,
        visual: clip.visual ?? defaultClipVisual(),
        sourceWidth: asset.width ?? null,
        sourceHeight: asset.height ?? null,
        clipStartMs,
        clipEndMs,
        inMs: clip.inMs,
        outMs: clip.outMs,
        localMs,
      });
      break;
    }
  }

  return stack.sort((a, b) => {
    const roleDiff = a.role === b.role ? 0 : a.role === "video" ? -1 : 1;
    if (roleDiff !== 0) return roleDiff;
    const trackDiff = b.trackOrder - a.trackOrder;
    if (trackDiff !== 0) return trackDiff;
    const startDiff = a.clipStartMs - b.clipStartMs;
    if (startDiff !== 0) return startDiff;
    return a.clipId.localeCompare(b.clipId);
  });
}

function findProgramClipAtMs(project: ProjectState, playheadMs: number): ProgramClipContext | null {
  const stack = findProgramStackAtMs(project, playheadMs);
  const primaryVideo = stack.find((clip) => clip.role === "video");
  return primaryVideo ?? stack[0] ?? null;
}

function findNextProgramClipOnTrack(project: ProjectState, current: ProgramClipContext | null): ProgramClipContext | null {
  if (!current) return null;
  const track = project.timeline.tracks.find((entry) => entry.id === current.trackId);
  if (!track || !track.visible) return null;

  const nextClip = [...track.clips]
    .filter((clip) => clip.startMs >= current.clipEndMs)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))[0];
  if (!nextClip) return null;

  const role = effectiveClipRole(track.kind, nextClip);
  if (role !== "video") return null;
  const asset = resolveVisualAsset(project, nextClip.assetId);
  if (!asset || asset.kind !== "video") return null;
  if (!asset?.url) return null;
  const trackOrder = project.timeline.tracks.findIndex((entry) => entry.id === track.id);
  return {
    trackId: track.id,
    clipId: nextClip.id,
    role,
    assetId: nextClip.assetId,
    assetKind: asset.kind,
    assetUrl: asset.url,
    trackOrder: trackOrder < 0 ? 0 : trackOrder,
    visual: nextClip.visual ?? defaultClipVisual(),
    sourceWidth: asset.width ?? null,
    sourceHeight: asset.height ?? null,
    clipStartMs: nextClip.startMs,
    clipEndMs: nextClip.startMs + nextClip.durationMs,
    inMs: nextClip.inMs,
    outMs: nextClip.outMs,
    localMs: nextClip.inMs,
  };
}

function collectSnapTargets(project: ProjectState, excludeClipId: string, playheadMs: number): number[] {
  const edges = [playheadMs];
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      edges.push(clip.startMs, clip.startMs + clip.durationMs);
    }
  }
  return edges;
}

function isTrackLocked(project: ProjectState, trackId: string): boolean {
  return Boolean(project.timeline.tracks.find((track) => track.id === trackId)?.locked);
}

function nearestSnap(valueMs: number, targets: number[], thresholdMs: number) {
  let best: { value: number; distance: number } | null = null;
  for (const target of targets) {
    const distance = Math.abs(target - valueMs);
    if (distance > thresholdMs) continue;
    if (!best || distance < best.distance) {
      best = { value: target, distance };
    }
  }
  return best;
}

function drawVideoFrameOnCanvas(canvas: HTMLCanvasElement, source: CanvasImageSource) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function clearPreviewCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawVisualLayerOnCanvas(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  visual: ClipVisual,
  projectWidth: number,
  projectHeight: number,
  sourceWidth?: number | null,
  sourceHeight?: number | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const pw = Math.max(1, Math.round(projectWidth));
  const ph = Math.max(1, Math.round(projectHeight));
  const sw = Math.max(1, Math.round(sourceWidth ?? pw));
  const sh = Math.max(1, Math.round(sourceHeight ?? ph));

  // Map project-space coordinates to preview canvas while preserving project aspect ratio.
  const projectToCanvasScale = Math.min(canvas.width / pw, canvas.height / ph);
  const viewportWidth = pw * projectToCanvasScale;
  const viewportHeight = ph * projectToCanvasScale;
  const viewportLeft = (canvas.width - viewportWidth) / 2;
  const viewportTop = (canvas.height - viewportHeight) / 2;

  const baseScaleProject = visual.fitMode === "adapt" ? Math.min(pw / sw, ph / sh) : 1;
  const finalScaleProject = baseScaleProject * (Math.max(1, visual.scalePct) / 100);
  const drawWidthProject = sw * finalScaleProject;
  const drawHeightProject = sh * finalScaleProject;

  const centerXProject = pw / 2 + visual.x;
  const centerYProject = ph / 2 + visual.y;
  const centerX = viewportLeft + centerXProject * projectToCanvasScale;
  const centerY = viewportTop + centerYProject * projectToCanvasScale;
  const drawWidth = drawWidthProject * projectToCanvasScale;
  const drawHeight = drawHeightProject * projectToCanvasScale;

  ctx.save();
  ctx.globalAlpha = clamp(visual.opacityPct / 100, 0, 1);
  ctx.translate(centerX, centerY);
  ctx.rotate((visual.rotationDeg * Math.PI) / 180);
  ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function sortClips(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

function sanitizeClip(clip: Clip): Clip {
  const durationMs = Math.max(1, Math.round(clip.durationMs));
  const startMs = Math.max(0, Math.round(clip.startMs));
  const inMs = Math.round(clip.inMs);
  return {
    ...clip,
    startMs,
    durationMs,
    inMs,
    outMs: inMs + durationMs,
  };
}

function applyNoOverlap(track: Track, clipId: string, nextClip: Clip): Track {
  const others = sortClips(track.clips.filter((clip) => clip.id !== clipId));
  const normalized = sanitizeClip(nextClip);

  const before = others.filter((clip) => clip.startMs < normalized.startMs);
  const prevEnd = before.reduce((acc, clip) => Math.max(acc, clip.startMs + clip.durationMs), 0);
  const after = others.filter((clip) => clip.startMs >= normalized.startMs);
  const nextStart = after.length > 0 ? after[0].startMs : Number.POSITIVE_INFINITY;

  let startMs = Math.max(prevEnd, normalized.startMs);
  let durationMs = Math.max(MIN_CLIP_DURATION_MS, normalized.durationMs);

  if (Number.isFinite(nextStart)) {
    const maxStart = Math.max(prevEnd, nextStart - durationMs);
    startMs = Math.min(startMs, maxStart);
    const available = Math.max(1, nextStart - startMs);
    durationMs = Math.min(durationMs, available);
  }

  const clip = {
    ...normalized,
    startMs,
    durationMs,
    outMs: normalized.inMs + durationMs,
  };

  return {
    ...track,
    clips: sortClips([...others, clip]),
  };
}

function applyPush(track: Track, clipId: string, nextClip: Clip): Track {
  const others = sortClips(track.clips.filter((clip) => clip.id !== clipId)).map((clip) => ({ ...clip }));
  const clip = sanitizeClip(nextClip);

  let startMs = clip.startMs;
  for (const other of others) {
    if (other.startMs >= startMs) break;
    const otherEnd = other.startMs + other.durationMs;
    if (otherEnd > startMs) {
      startMs = otherEnd;
    }
  }

  const placed = {
    ...clip,
    startMs,
    outMs: clip.inMs + clip.durationMs,
  };

  let cursor = placed.startMs + placed.durationMs;
  for (const other of others) {
    if (other.startMs < placed.startMs) continue;
    if (other.startMs < cursor) {
      other.startMs = cursor;
      other.outMs = other.inMs + other.durationMs;
    }
    cursor = other.startMs + other.durationMs;
  }

  return {
    ...track,
    clips: sortClips([...others, placed]).map(sanitizeClip),
  };
}

function applyCollisionPolicy(
  track: Track,
  clipId: string,
  nextClip: Clip,
  mode: CollisionMode,
): Track {
  if (mode === "allow-overlap") {
    const clips = track.clips.map((clip) => (clip.id === clipId ? sanitizeClip(nextClip) : clip));
    return { ...track, clips: sortClips(clips) };
  }

  if (mode === "push") {
    return applyPush(track, clipId, nextClip);
  }

  return applyNoOverlap(track, clipId, nextClip);
}

function constrainClipForTargetTrack(track: Track, nextClip: Clip, mode: CollisionMode): Clip {
  const sanitized = sanitizeClip(nextClip);
  if (mode === "allow-overlap") return sanitized;
  const constrainedTrack = mode === "push" ? applyPush(track, sanitized.id, sanitized) : applyNoOverlap(track, sanitized.id, sanitized);
  return constrainedTrack.clips.find((clip) => clip.id === sanitized.id) ?? sanitized;
}

type ClipRef = {
  trackId: string;
  clipId: string;
};

type ProgramSlot = "a" | "b";

type ClipWithRef = ClipRef & {
  clip: Clip;
};

function clipRefToKey(ref: ClipRef): string {
  return `${ref.trackId}:${ref.clipId}`;
}

function findClipByRef(project: ProjectState, ref: ClipRef): ClipWithRef | null {
  const track = project.timeline.tracks.find((entry) => entry.id === ref.trackId);
  if (!track) return null;
  const clip = track.clips.find((entry) => entry.id === ref.clipId);
  if (!clip) return null;
  return { ...ref, clip };
}

function collectLinkedClipRefs(project: ProjectState, ref: ClipRef): ClipRef[] {
  const target = findClipByRef(project, ref);
  if (!target) return [];
  if (!target.clip.linkGroupId || target.clip.linkLocked === false) return [ref];

  const linked: ClipRef[] = [];
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.linkGroupId !== target.clip.linkGroupId) continue;
      if (clip.linkLocked === false) continue;
      linked.push({ trackId: track.id, clipId: clip.id });
    }
  }
  return linked.length > 0 ? linked : [ref];
}

function uniqClipRefs(refs: ClipRef[]): ClipRef[] {
  const seen = new Set<string>();
  const unique: ClipRef[] = [];
  for (const ref of refs) {
    const key = clipRefToKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ref);
  }
  return unique;
}

function expandClipRefsWithLinks(project: ProjectState, refs: ClipRef[]): ClipRef[] {
  const expanded: ClipRef[] = [];
  for (const ref of refs) {
    expanded.push(...collectLinkedClipRefs(project, ref));
  }
  return uniqClipRefs(expanded);
}

function applyClipUpdatesAtomically(
  project: ProjectState,
  updates: Array<{
    trackId: string;
    clipId: string;
    nextClip: Clip;
  }>,
  mode: CollisionMode,
): Track[] | null {
  const tracks = project.timeline.tracks.map((track) => ({
    ...track,
    clips: [...track.clips],
  }));
  const trackIndexById = new Map(tracks.map((track, index) => [track.id, index]));

  for (const update of updates) {
    const trackIndex = trackIndexById.get(update.trackId);
    if (trackIndex == null) return null;
    const track = tracks[trackIndex];
    if (!track || track.locked) return null;
    if (!track.clips.some((clip) => clip.id === update.clipId)) return null;

    const constrained = applyCollisionPolicy(track, update.clipId, update.nextClip, mode);
    if (!constrained.clips.some((clip) => clip.id === update.clipId)) return null;
    tracks[trackIndex] = constrained;
  }

  return tracks;
}

function moveClipBetweenTracks(
  tracks: Track[],
  fromTrackId: string,
  toTrackId: string,
  nextClip: Clip,
  mode: CollisionMode,
): Track[] | null {
  if (fromTrackId === toTrackId) return tracks;
  const nextTracks = tracks.map((track) => ({
    ...track,
    clips: [...track.clips],
  }));
  const fromIndex = nextTracks.findIndex((track) => track.id === fromTrackId);
  const toIndex = nextTracks.findIndex((track) => track.id === toTrackId);
  if (fromIndex < 0 || toIndex < 0) return null;

  const fromTrack = nextTracks[fromIndex];
  const toTrack = nextTracks[toIndex];
  if (!fromTrack || !toTrack || fromTrack.locked || toTrack.locked) return null;
  if (!fromTrack.clips.some((clip) => clip.id === nextClip.id)) return null;

  const removedSource = fromTrack.clips.filter((clip) => clip.id !== nextClip.id);
  let nextTarget: Track;
  if (mode === "allow-overlap") {
    nextTarget = { ...toTrack, clips: sortClips([...toTrack.clips, sanitizeClip(nextClip)]) };
  } else if (mode === "push") {
    nextTarget = applyPush(toTrack, nextClip.id, nextClip);
  } else {
    nextTarget = applyNoOverlap(toTrack, nextClip.id, nextClip);
  }
  if (!nextTarget.clips.some((clip) => clip.id === nextClip.id)) return null;

  nextTracks[fromIndex] = { ...fromTrack, clips: sortClips(removedSource) };
  nextTracks[toIndex] = nextTarget;
  return nextTracks;
}

function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildQATargets(durationUs: number, count: number, seed: number): number[] {
  const frameUs = Math.round(1_000_000 / 30);
  const safeEnd = Math.max(0, durationUs - frameUs);
  const random = createSeededRandom(seed);
  const targets: number[] = [
    0,
    frameUs,
    Math.round(durationUs * 0.1),
    Math.round(durationUs * 0.25),
    Math.round(durationUs * 0.5),
    Math.round(durationUs * 0.75),
    Math.round(durationUs * 0.9),
    safeEnd,
  ].map((value) => clamp(value, 0, safeEnd));

  while (targets.length < count) {
    const randomUs = Math.round(random() * safeEnd);
    targets.push(randomUs);
  }

  return targets.slice(0, count);
}

export default function App() {
  const [project, setProject] = useState<ProjectState>(createInitialProject);
  const [playheadMs, setPlayheadMs] = useState(1200);
  const [libraryTab, setLibraryTab] = useState<"media" | "audio" | "text" | "stickers" | "effects" | "ai">("media");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedClipKeys, setSelectedClipKeys] = useState<string[]>([]);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(80);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [altSnapDisabled, setAltSnapDisabled] = useState(false);
  const [snapMs, setSnapMs] = useState(100);
  const [collisionMode, setCollisionMode] = useState<CollisionMode>("no-overlap");
  const [rippleMode, setRippleMode] = useState<RippleMode>("none");
  const [timelineTool, setTimelineTool] = useState<"select" | "split">("select");
  const [mainTrackMagnet, setMainTrackMagnet] = useState(true);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [log, setLog] = useState("Ready.");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [markInMs, setMarkInMs] = useState<number | null>(null);
  const [markOutMs, setMarkOutMs] = useState<number | null>(null);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [editorLayout, setEditorLayout] = useState<EditorLayout>(() =>
    readStoredEditorLayout(typeof window === "undefined" ? 900 : window.innerHeight),
  );
  const [isDesktopResizable, setIsDesktopResizable] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth > DESKTOP_LAYOUT_BREAKPOINT,
  );
  const [previewMonitorMode, setPreviewMonitorMode] = useState<"program" | "source">("program");

  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [videoDurationMs, setVideoDurationMs] = useState<number>(0);
  const [sourcePlayheadMs, setSourcePlayheadMs] = useState<number>(0);
  const [sourceDurationMs, setSourceDurationMs] = useState<number>(0);
  const [sourceRangesByAsset, setSourceRangesByAsset] = useState<Record<string, SourceRangeState>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(SOURCE_RANGE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Partial<SourceRangeState>>;
      const normalized: Record<string, SourceRangeState> = {};
      for (const [assetId, value] of Object.entries(parsed)) {
        normalized[assetId] = {
          inMs: typeof value?.inMs === "number" && Number.isFinite(value.inMs) ? Math.round(value.inMs) : null,
          outMs: typeof value?.outMs === "number" && Number.isFinite(value.outMs) ? Math.round(value.outMs) : null,
          lastPlayheadMs:
            typeof value?.lastPlayheadMs === "number" && Number.isFinite(value.lastPlayheadMs)
              ? Math.max(0, Math.round(value.lastPlayheadMs))
              : 0,
        };
      }
      return normalized;
    } catch {
      return {};
    }
  });
  const [sourceIsPlaying, setSourceIsPlaying] = useState(false);
  const [isFmp4Source, setIsFmp4Source] = useState(false);
  const [decoderMode, setDecoderMode] = useState<"none" | "webcodecs" | "fallback">("none");
  const [decoderFps, setDecoderFps] = useState(30);
  const [decoderDurationUs, setDecoderDurationUs] = useState(0);
  const [decoderLogs, setDecoderLogs] = useState<string[]>([]);
  const [snapGuideMs, setSnapGuideMs] = useState<number | null>(null);
  const [timestampAuditSamples, setTimestampAuditSamples] = useState(12);
  const [qaProfile, setQaProfile] = useState("baseline-short-gop");
  const [qaScenarioCount, setQaScenarioCount] = useState(DEFAULT_QA_SCENARIOS);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaMetric, setQaMetric] = useState<QAMetric | null>(null);
  const [qaHistory, setQaHistory] = useState<QAMetric[]>([]);
  const [lastRunResult, setLastRunResult] = useState<DecodeQaRunResult | null>(null);
  const [sourceDetails, setSourceDetails] = useState<{
    codec: string | null;
    codedWidth: number | null;
    codedHeight: number | null;
    descriptionLength: number | null;
    timestampAuditIssueCount: number | null;
  }>({
    codec: null,
    codedWidth: null,
    codedHeight: null,
    descriptionLength: null,
    timestampAuditIssueCount: null,
  });

  const [interactionPreview, setInteractionPreview] = useState<InteractionPreview | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJobState | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportJobState[]>([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>("1080p");
  const [exportFps, setExportFps] = useState<ExportFps>(30);
  const [exportValidationMessage, setExportValidationMessage] = useState<string | null>(null);
  const [aiJobStatus, setAiJobStatus] = useState<AiJobStatus>("idle");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLastOutput, setAiLastOutput] = useState<SilenceCutPluginOutput | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const interactionPreviewRef = useRef<InteractionPreview | null>(null);
  const playbackRef = useRef<{ rafId: number | null; lastTs: number | null }>({
    rafId: null,
    lastTs: null,
  });
  const historyRef = useRef<{ undo: ProjectState[]; redo: ProjectState[] }>({ undo: [], redo: [] });
  const analysisWorkerRef = useRef<Worker | null>(null);
  const assetThumbBusyRef = useRef<Set<string>>(new Set());
  const analysisCacheRef = useRef<Map<string, AssetAnalysisCacheValue>>(new Map());
  const assetAnalysisKeyRef = useRef<Map<string, string>>(new Map());
  const exportPollTimerRef = useRef<number | null>(null);
  const aiRunTokenRef = useRef(0);

  const decodeWorkerRef = useRef<Worker | null>(null);
  const loadedDecoderAssetIdRef = useRef<string | null>(null);
  const decodeRequestIdRef = useRef(0);
  const latestHandledRequestIdRef = useRef(0);
  const pendingSeekRef = useRef<Map<number, PendingSeek>>(new Map());
  const requestReasonRef = useRef<Map<number, SeekReason>>(new Map());
  const decoderErrorsRef = useRef<DecoderErrorMessage[]>([]);
  const lastSeekResultRef = useRef<SeekResultMessage | null>(null);
  const previewSeekThrottleRef = useRef<{ timeoutId: number | null; targetUs: number }>({
    timeoutId: null,
    targetUs: 0,
  });

  const programCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const programVideoARef = useRef<HTMLVideoElement | null>(null);
  const programVideoBRef = useRef<HTMLVideoElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const assetFilesRef = useRef<Map<string, File>>(new Map());
  const previewAssetIdRef = useRef<string | null>(null);
  const programAssetIdRef = useRef<string | null>(null);
  const activeProgramSlotRef = useRef<ProgramSlot>("a");
  const programSlotClipIdRef = useRef<Record<ProgramSlot, string | null>>({ a: null, b: null });
  const projectRef = useRef<ProjectState>(project);
  const playheadMsRef = useRef(playheadMs);
  const editorLayoutRef = useRef<EditorLayout>(editorLayout);
  const programClipContextRef = useRef<ProgramClipContext | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const imageLoadingRef = useRef<Set<string>>(new Set());
  const auxiliaryLayerVideosRef = useRef<HTMLVideoElement[]>([]);

  const webCodecsAvailable = useMemo(
    () => typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined",
    [],
  );
  const devMode = useMemo(() => {
    const searchDev = new URLSearchParams(window.location.search).get("dev") === "1";
    const lsDev = window.localStorage.getItem("mavDev") === "1";
    return searchDev && lsDev;
  }, []);
  const renderWorkerBaseUrl = useMemo(
    () => (import.meta.env.VITE_RENDER_WORKER_URL as string | undefined) ?? "http://localhost:8790",
    [],
  );
  const snapActive = snapEnabled && !altSnapDisabled;

  const playheadUs = useMemo(() => toUs(playheadMs), [playheadMs]);
  const playbackDurationMs = useMemo(
    () =>
      Math.max(
        project.timeline.durationMs,
        videoDurationMs,
        decoderDurationUs > 0 ? Math.round(decoderDurationUs / 1000) : 0,
      ),
    [project.timeline.durationMs, videoDurationMs, decoderDurationUs],
  );
  const activeSourceAssetDurationMs = useMemo(() => {
    if (!activeAssetId) return 0;
    const asset = project.assets.find((entry) => entry.id === activeAssetId && entry.kind === "video");
    const value = asset?.durationMs;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value);
  }, [activeAssetId, project.assets]);
  const sourceMonitorDurationMs = useMemo(
    () => {
      if (Number.isFinite(sourceDurationMs) && sourceDurationMs > 0) {
        return Math.round(sourceDurationMs);
      }
      if (activeSourceAssetDurationMs > 0) {
        return activeSourceAssetDurationMs;
      }
      return 1000;
    },
    [activeSourceAssetDurationMs, sourceDurationMs],
  );
  const activeSourceRangeState = useMemo<SourceRangeState | undefined>(
    () => (activeAssetId ? sourceRangesByAsset[activeAssetId] : undefined),
    [activeAssetId, sourceRangesByAsset],
  );
  const resolvedActiveSourceRange = useMemo(
    () => resolveSourceWindow(activeSourceRangeState, sourceMonitorDurationMs),
    [activeSourceRangeState, sourceMonitorDurationMs],
  );
  const clipKey = (trackId: string, clipId: string) => `${trackId}:${clipId}`;
  const parseClipKey = (key: string): ClipRef | null => {
    const [trackId, clipId] = key.split(":");
    if (!trackId || !clipId) return null;
    return { trackId, clipId };
  };
  const selectedClipSet = useMemo(() => new Set(selectedClipKeys), [selectedClipKeys]);
  const selectedClipCount = selectedClipKeys.length;

  const selectedClip = useMemo(() => {
    const pos = findClip(project, selection);
    if (!pos) return null;
    return project.timeline.tracks[pos.trackIndex].clips[pos.clipIndex];
  }, [project, selection]);
  const selectedTrack = useMemo(() => {
    if (!selection) return null;
    return project.timeline.tracks.find((track) => track.id === selection.trackId) ?? null;
  }, [project.timeline.tracks, selection]);

  const programClipContext = useMemo(
    () => findProgramClipAtMs(project, playheadMs),
    [project, playheadMs],
  );
  const programAssetId = programClipContext?.assetId ?? null;
  const programClipId = programClipContext?.clipId ?? null;
  const programClipStartMs = programClipContext?.clipStartMs ?? 0;
  const programClipEndMs = programClipContext?.clipEndMs ?? 0;
  const programClipInMs = programClipContext?.inMs ?? 0;
  const programTrackMuted = useMemo(() => {
    if (!programClipContext) return false;
    const track = project.timeline.tracks.find((item) => item.id === programClipContext.trackId);
    return Boolean(track?.muted);
  }, [programClipContext, project.timeline.tracks]);
  const programLocalPlayheadUs = useMemo(
    () => (programClipContext ? toUs(programClipContext.localMs) : playheadUs),
    [playheadUs, programClipContext],
  );
  const programAssetKind = programClipContext?.assetKind ?? null;
  const programVisualSignature = programClipContext
    ? `${programClipContext.clipId}:${programClipContext.visual.x}:${programClipContext.visual.y}:${programClipContext.visual.scalePct}:${programClipContext.visual.rotationDeg}:${programClipContext.visual.opacityPct}:${programClipContext.visual.fitMode}`
    : "none";
  const programStackVisualSignature = useMemo(() => {
    const stack = findProgramStackAtMs(project, playheadMs);
    return stack
      .map(
        (layer) =>
          `${layer.trackId}:${layer.clipId}:${layer.visual.x}:${layer.visual.y}:${layer.visual.scalePct}:${layer.visual.rotationDeg}:${layer.visual.opacityPct}:${layer.visual.fitMode}`,
      )
      .join("|");
  }, [project, playheadMs]);
  const selectedClipRole = useMemo(() => {
    if (!selectedClip || !selectedTrack) return null;
    return effectiveClipRole(selectedTrack.kind, selectedClip);
  }, [selectedClip, selectedTrack]);
  const hasPreviewOnlyVisualAdjustments = useMemo(
    () =>
      project.timeline.tracks.some((track) =>
        track.clips.some((clip) => {
          const role = effectiveClipRole(track.kind, clip);
          if (role === "audio") return false;
          const visual = clip.visual ?? defaultClipVisual();
          return !(
            visual.x === 0 &&
            visual.y === 0 &&
            visual.scalePct === 100 &&
            visual.rotationDeg === 0 &&
            visual.opacityPct === 100 &&
            visual.fitMode === "pixel-100"
          );
        }),
      ),
    [project.timeline.tracks],
  );

  const clipExists = (trackId: string, clipId: string) =>
    project.timeline.tracks.some((track) => track.id === trackId && track.clips.some((clip) => clip.id === clipId));

  const resolveRefsFromKeys = (state: ProjectState, keys: string[], includeLinks = true): ClipRef[] => {
    const refs = keys
      .map((key) => parseClipKey(key))
      .filter((ref): ref is ClipRef => ref != null)
      .filter((ref) => Boolean(findClipByRef(state, ref)));
    if (!includeLinks) return uniqClipRefs(refs);
    return expandClipRefsWithLinks(state, refs);
  };

  const hasLockedRefs = (state: ProjectState, refs: ClipRef[]): boolean =>
    refs.some((ref) => isTrackLocked(state, ref.trackId));

  const resizeEditorLayout = (patch: Partial<EditorLayout>) => {
    const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
    setEditorLayout((prev) => {
      const next = normalizeEditorLayout({ ...prev, ...patch }, viewportHeight);
      editorLayoutRef.current = next;
      return next;
    });
  };

  const commitEditorLayout = () => {
    persistEditorLayout(editorLayoutRef.current);
  };

  const resetEditorLayout = () => {
    const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
    const next = createDefaultEditorLayout(viewportHeight);
    setEditorLayout(next);
    editorLayoutRef.current = next;
    persistEditorLayout(next);
    setLog("Layout reset.");
  };

  const setProjectWithNormalize = (
    updater: (prev: ProjectState) => ProjectState,
    options?: { recordHistory?: boolean },
  ) => {
    const recordHistory = options?.recordHistory ?? true;
    setProject((prev) => {
      const next = normalizeProject(updater(prev));
      if (recordHistory && JSON.stringify(prev) !== JSON.stringify(next)) {
        historyRef.current.undo.push(prev);
        if (historyRef.current.undo.length > HISTORY_LIMIT) {
          historyRef.current.undo.splice(0, historyRef.current.undo.length - HISTORY_LIMIT);
        }
        historyRef.current.redo = [];
      }
      return next;
    });
  };

  const setProjectName = (value: string) => {
    const nextName = value.trim() || "untitled-project";
    setProjectWithNormalize((prev) => ({
      ...prev,
      meta: {
        ...prev.meta,
        projectId: nextName,
      },
    }), { recordHistory: false });
  };

  const persistAnalysisCache = () => {
    const entries = [...analysisCacheRef.current.entries()];
    const trimmed = entries.slice(Math.max(0, entries.length - ANALYSIS_CACHE_LIMIT));
    try {
      localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage write errors; cache remains in memory.
    }
  };

  const applyAnalysisToAsset = (assetId: string, analysis: AssetAnalysisCacheValue) => {
    setProject((prev) => ({
      ...prev,
      assets: prev.assets.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              waveform: analysis.waveform,
              heroThumbnail: analysis.heroThumbnail ?? asset.heroThumbnail,
              thumbnails: analysis.thumbnails,
              codec: asset.codec ?? analysis.codecGuess ?? undefined,
              durationMs: Math.max(asset.durationMs ?? 0, analysis.durationMs ?? 0) || asset.durationMs,
              width: analysis.width ?? asset.width,
              height: analysis.height ?? asset.height,
              hasAudio: typeof analysis.hasAudio === "boolean" ? analysis.hasAudio : asset.hasAudio,
            }
          : asset,
      ),
    }));
  };

  const requestAssetAnalysis = (assetId: string, file: File, durationMs: number) => {
    const cacheKey = assetAnalysisCacheKey(file);
    assetAnalysisKeyRef.current.set(assetId, cacheKey);
    const cached = analysisCacheRef.current.get(cacheKey);
    if (cached) {
      applyAnalysisToAsset(assetId, cached);
      if (!cached.heroThumbnail) {
        void captureQuickVideoThumbnail(file, 1.5, {
          width: 320,
          height: 180,
          quality: 0.9,
        }).then((heroThumbnail) => {
          if (!heroThumbnail) return;
          const latest = analysisCacheRef.current.get(cacheKey);
          if (!latest) return;
          const next = { ...latest, heroThumbnail };
          analysisCacheRef.current.set(cacheKey, next);
          persistAnalysisCache();
          applyAnalysisToAsset(assetId, next);
        }).catch(() => {
          // ignore hero thumbnail generation errors
        });
      }
      return;
    }

    if (assetThumbBusyRef.current.has(assetId)) return;
    assetThumbBusyRef.current.add(assetId);
    const worker = analysisWorkerRef.current;

    const queueFallbackWorker = () => {
      if (!worker) {
        assetThumbBusyRef.current.delete(assetId);
        return;
      }
      void file.arrayBuffer().then((buffer) => {
        worker.postMessage(
          {
            type: "analyze",
            assetId,
            buffer,
            durationMs,
            thumbnailsPerSecond: 2,
          } satisfies AnalysisWorkerInMessage,
          [buffer],
        );
      }).catch(() => {
        assetThumbBusyRef.current.delete(assetId);
      });
    };

    void analyzeMediaFile(file, {
      durationMs,
      thumbnailsPerSecond: 2,
      maxThumbnails: 12,
      waveformPoints: 96,
    })
      .then(async (analysis) => {
        const next: AssetAnalysisCacheValue = {
          waveform: analysis.waveform,
          heroThumbnail: analysis.heroThumbnail,
          thumbnails: analysis.thumbnails,
          codecGuess: analysis.codecGuess,
          durationMs: analysis.durationMs,
          width: analysis.width,
          height: analysis.height,
          hasAudio: analysis.hasAudio,
        };
        const nextCacheKey = assetAnalysisKeyRef.current.get(assetId);
        if (nextCacheKey !== cacheKey) {
          assetThumbBusyRef.current.delete(assetId);
          return;
        }
        if (next.thumbnails.length === 0) {
          const quickThumb = await captureQuickVideoThumbnail(file).catch(() => null);
          if (quickThumb) {
            next.thumbnails = [quickThumb];
          } else {
          queueFallbackWorker();
          return;
          }
        }
        if (!next.heroThumbnail) {
          next.heroThumbnail = await captureQuickVideoThumbnail(file, 1.5, {
            width: 320,
            height: 180,
            quality: 0.9,
          }).catch(() => null) ?? undefined;
        }

        analysisCacheRef.current.set(cacheKey, next);
        if (analysisCacheRef.current.size > ANALYSIS_CACHE_LIMIT) {
          const oldest = analysisCacheRef.current.keys().next().value;
          if (typeof oldest === "string") {
            analysisCacheRef.current.delete(oldest);
          }
        }
        persistAnalysisCache();
        applyAnalysisToAsset(assetId, next);
        assetThumbBusyRef.current.delete(assetId);
      })
      .catch(() => {
        queueFallbackWorker();
      });
  };

  const getClipRenderState = (trackId: string, clip: Clip): Clip => {
    void trackId;
    return clip;
  };

  const resolveTimelineTrackAtPointer = (clientX: number, clientY: number): Track | null => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!(element instanceof HTMLElement)) return null;
    const lane = element.closest<HTMLElement>("[data-timeline-track-id]");
    if (!lane) return null;
    const trackId = lane.dataset.timelineTrackId;
    if (!trackId) return null;
    return project.timeline.tracks.find((track) => track.id === trackId) ?? null;
  };

  const resolveTimelineDropTargetAtPointer = (
    clientX: number,
    clientY: number,
  ): { track: Track | null; outOfBounds: "above" | "below" | null } => {
    const track = resolveTimelineTrackAtPointer(clientX, clientY);
    if (track) {
      return { track, outOfBounds: null };
    }

    const laneCanvas = document.querySelector<HTMLElement>(".timelineCanvas.timelineLanes");
    if (!laneCanvas) return { track: null, outOfBounds: null };
    const rect = laneCanvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) return { track: null, outOfBounds: null };
    if (clientY < rect.top) return { track: null, outOfBounds: "above" };
    if (clientY > rect.bottom) return { track: null, outOfBounds: "below" };
    return { track: null, outOfBounds: null };
  };

  const applyInteractionPreview = () => {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaPx = drag.latestClientX - drag.startClientX;
    const deltaMs = (deltaPx / pixelsPerSecond) * 1000;

    const original = drag.original;
    const minDuration = MIN_CLIP_DURATION_MS;

    let startMs = original.startMs;
    let durationMs = original.durationMs;
    let inMs = original.inMs;
    let outMs = original.outMs;
    let guide: number | null = null;

    const thresholdMs = drag.thresholdMs;

    if (drag.mode === "move") {
      let candidateStart = original.startMs + deltaMs;
      const candidateEnd = candidateStart + original.durationMs;
      if (snapActive) {
        const startSnap = nearestSnap(candidateStart, drag.snapTargetsMs, thresholdMs);
        const endSnap = nearestSnap(candidateEnd, drag.snapTargetsMs, thresholdMs);

        if (startSnap && (!endSnap || startSnap.distance <= endSnap.distance)) {
          candidateStart = startSnap.value;
          guide = startSnap.value;
        } else if (endSnap) {
          candidateStart = endSnap.value - original.durationMs;
          guide = endSnap.value;
        }
      }

      if (snapActive) {
        candidateStart = quantize(candidateStart, snapMs);
      }

      startMs = Math.max(0, candidateStart);
    }

    if (drag.mode === "resize-start") {
      const maxStart = original.startMs + original.durationMs - minDuration;
      let candidateStart = clamp(original.startMs + deltaMs, 0, maxStart);
      if (snapActive) {
        const snap = nearestSnap(candidateStart, drag.snapTargetsMs, thresholdMs);
        if (snap) {
          candidateStart = snap.value;
          guide = snap.value;
        }
        candidateStart = quantize(candidateStart, snapMs);
      }

      candidateStart = clamp(candidateStart, 0, maxStart);
      const shifted = candidateStart - original.startMs;
      startMs = candidateStart;
      durationMs = original.durationMs - shifted;
      inMs = original.inMs + shifted;
      outMs = inMs + durationMs;
    }

    if (drag.mode === "resize-end") {
      let candidateEnd = original.startMs + original.durationMs + deltaMs;
      const minEnd = original.startMs + MIN_CLIP_DURATION_MS;
      if (snapActive) {
        const snap = nearestSnap(candidateEnd, drag.snapTargetsMs, thresholdMs);
        if (snap) {
          candidateEnd = snap.value;
          guide = snap.value;
        }
        candidateEnd = quantize(candidateEnd, snapMs);
      }

      candidateEnd = Math.max(minEnd, candidateEnd);
      durationMs = candidateEnd - original.startMs;
      startMs = original.startMs;
      inMs = original.inMs;
      outMs = inMs + durationMs;
    }

    let previewTrackId = drag.trackId;
    let createTrackKind: "video" | "audio" | undefined;
    let createTrackEdge: "above" | "below" | undefined;
    if (drag.mode === "move") {
      const dropTarget = resolveTimelineDropTargetAtPointer(drag.latestClientX, drag.latestClientY);
      const hoveredTrack = dropTarget.track;
      if (
        hoveredTrack &&
        hoveredTrack.id !== drag.trackId &&
        !hoveredTrack.locked &&
        isRoleCompatibleWithTrack(drag.clipRole, hoveredTrack.kind)
      ) {
        previewTrackId = hoveredTrack.id;
      } else if (!hoveredTrack && dropTarget.outOfBounds) {
        createTrackKind = drag.clipRole === "audio" ? "audio" : "video";
        createTrackEdge = dropTarget.outOfBounds;
      }
    }

    const candidateClip = {
      ...original,
      startMs,
      durationMs,
      inMs,
      outMs,
    };

    const track = project.timeline.tracks.find((item) => item.id === previewTrackId);
    if (track) {
      const constrained =
        previewTrackId === drag.trackId
          ? applyCollisionPolicy(track, drag.clipId, candidateClip, collisionMode).clips.find((clip) => clip.id === drag.clipId)
          : constrainClipForTargetTrack(track, candidateClip, collisionMode);
      if (constrained) {
        startMs = constrained.startMs;
        durationMs = constrained.durationMs;
        inMs = constrained.inMs;
        outMs = constrained.outMs;
      }
    }

    const nextPreview: InteractionPreview = {
      trackId: previewTrackId,
      clipId: drag.clipId,
      startMs,
      durationMs,
      inMs,
      outMs,
      snapGuideMs: guide,
      createTrackKind,
      createTrackEdge,
    };

    interactionPreviewRef.current = nextPreview;
    setInteractionPreview(nextPreview);

    setSnapGuideMs(guide);
  };

  const flushDragPreview = () => {
    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current);
    }
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      applyInteractionPreview();
    });
  };

  const onWindowPointerMove = (event: PointerEvent) => {
    if (!dragRef.current) return;
    if (event.pointerId !== dragRef.current.pointerId) return;
    dragRef.current.latestClientX = event.clientX;
    dragRef.current.latestClientY = event.clientY;
    flushDragPreview();
  };

  const cleanupPointerListeners = () => {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("pointercancel", onWindowPointerUp);
  };

  const onWindowPointerUp = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;

    drag.latestClientX = event.clientX;
    drag.latestClientY = event.clientY;
    applyInteractionPreview();
    const preview = interactionPreviewRef.current;

    if (preview && isTrackLocked(project, preview.trackId)) {
      setLog("Track is locked.");
    } else if (preview) {
      const hasLockedLinked = drag.linkedClips.some((entry) => isTrackLocked(project, entry.trackId));
      if (hasLockedLinked) {
        setLog("Linked clip group includes locked tracks.");
      } else {
        const requestedStartDelta = preview.startMs - drag.original.startMs;
        const requestedDurationDelta = preview.durationMs - drag.original.durationMs;
        const requestedInDelta = preview.inMs - drag.original.inMs;

        let startDelta = requestedStartDelta;
        let durationDelta = requestedDurationDelta;
        let inDelta = requestedInDelta;

        if (drag.mode === "move") {
          const minStart = drag.linkedClips.reduce((min, entry) => Math.min(min, entry.clip.startMs), Number.POSITIVE_INFINITY);
          startDelta = Math.max(-minStart, requestedStartDelta);
          durationDelta = 0;
          inDelta = 0;
        } else if (drag.mode === "resize-start") {
          const minDelta = drag.linkedClips.reduce((max, entry) => Math.max(max, -entry.clip.startMs), Number.NEGATIVE_INFINITY);
          const maxDelta = drag.linkedClips.reduce(
            (min, entry) => Math.min(min, entry.clip.durationMs - MIN_CLIP_DURATION_MS),
            Number.POSITIVE_INFINITY,
          );
          startDelta = clamp(requestedStartDelta, minDelta, maxDelta);
          durationDelta = -startDelta;
          inDelta = startDelta;
        } else if (drag.mode === "resize-end") {
          const minDurationDelta = drag.linkedClips.reduce(
            (max, entry) => Math.max(max, MIN_CLIP_DURATION_MS - entry.clip.durationMs),
            Number.NEGATIVE_INFINITY,
          );
          durationDelta = Math.max(minDurationDelta, requestedDurationDelta);
          startDelta = 0;
          inDelta = 0;
        }

        const updates = drag.linkedClips.map((entry) => {
          const original = entry.clip;
          const nextStartMs = Math.max(0, Math.round(original.startMs + startDelta));
          const nextDurationMs = Math.max(MIN_CLIP_DURATION_MS, Math.round(original.durationMs + durationDelta));
          const nextInMs = Math.max(0, Math.round(original.inMs + inDelta));
          return {
            trackId: entry.trackId,
            clipId: entry.clipId,
            nextClip: {
              ...original,
              startMs: nextStartMs,
              durationMs: nextDurationMs,
              inMs: nextInMs,
              outMs: nextInMs + nextDurationMs,
            },
          };
        });

        let destinationTrackId = drag.mode === "move" ? preview.trackId : drag.trackId;
        const createTrackIntent =
          drag.mode === "move" && preview.createTrackKind && preview.createTrackEdge
            ? { kind: preview.createTrackKind, edge: preview.createTrackEdge }
            : null;
        const moveAcrossTrack = drag.mode === "move" && (destinationTrackId !== drag.trackId || createTrackIntent != null);
        let committedDestinationTrackId = destinationTrackId;
        let createdTrackId: string | null = null;
        let moveCommitted = false;
        setProjectWithNormalize((prev) => {
          let tracks = applyClipUpdatesAtomically(prev, updates, collisionMode);
          if (!tracks) return prev;

          if (moveAcrossTrack) {
            if (createTrackIntent) {
              const inserted = insertTrackForOutOfBoundsDrag(tracks, createTrackIntent.kind, createTrackIntent.edge);
              tracks = inserted.tracks;
              destinationTrackId = inserted.trackId;
              committedDestinationTrackId = inserted.trackId;
              createdTrackId = inserted.trackId;
            }

            const targetTrack = tracks.find((track) => track.id === destinationTrackId);
            if (!targetTrack || targetTrack.locked) return prev;
            if (!isRoleCompatibleWithTrack(drag.clipRole, targetTrack.kind)) return prev;
            const movedUpdate = updates.find((item) => item.trackId === drag.trackId && item.clipId === drag.clipId);
            if (!movedUpdate) return prev;
            const moved = moveClipBetweenTracks(tracks, drag.trackId, destinationTrackId, movedUpdate.nextClip, collisionMode);
            if (!moved) return prev;
            tracks = moved;
            moveCommitted = true;
          } else {
            moveCommitted = true;
          }

          return { ...prev, timeline: { ...prev.timeline, tracks } };
        });
        if (moveAcrossTrack && moveCommitted) {
          setSelection({ trackId: committedDestinationTrackId, clipId: drag.clipId });
          setSelectedClipKeys((prevKeys) =>
            prevKeys.map((key) =>
              key === clipKey(drag.trackId, drag.clipId) ? clipKey(committedDestinationTrackId, drag.clipId) : key,
            ),
          );
        }
        const scopeLabel = drag.linkedClips.length > 1 ? "linked group" : drag.clipId;
        if (createdTrackId) {
          setLog(`Created ${createTrackIntent?.kind ?? "video"} track and moved ${scopeLabel}.`);
        } else {
          setLog(`Committed ${drag.mode} for ${scopeLabel} (${collisionMode}).`);
        }
      }
    }

    dragRef.current = null;
    interactionPreviewRef.current = null;
    setInteractionPreview(null);
    setSnapGuideMs(null);
    cleanupPointerListeners();
  };

  const onClipPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    trackId: string,
    clip: Clip,
  ) => {
    if (event.button !== 0) return;
    if (isTrackLocked(project, trackId)) {
      setLog("Track is locked.");
      return;
    }

    if (timelineTool === "split") {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0;
      const atMs = clip.startMs + ratio * clip.durationMs;
      setPlayheadMs(Math.round(atMs));
      splitClipAt(trackId, clip.id, atMs);
      setLog(`Split ${clip.label} at ${Math.round(atMs)}ms.`);
      return;
    }

    const key = clipKey(trackId, clip.id);

    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      setSelectedClipKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        const ordered = [...next];
        const primary = ordered.at(-1);
        if (primary) {
          const [primaryTrackId, primaryClipId] = primary.split(":");
          setSelection({ trackId: primaryTrackId, clipId: primaryClipId });
        } else {
          setSelection(null);
        }
        return ordered;
      });
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const edge = Math.max(16, Math.min(24, rect.width * 0.2));

    let mode: InteractionMode = "move";
    if (localX <= edge) mode = "resize-start";
    if (localX >= rect.width - edge) mode = "resize-end";

    event.currentTarget.setPointerCapture(event.pointerId);

    const thresholdMs = (8 / pixelsPerSecond) * 1000;
    const sourceTrack = project.timeline.tracks.find((item) => item.id === trackId);
    const clipRole = sourceTrack ? effectiveClipRole(sourceTrack.kind, clip) : clip.mediaRole ?? "video";
    const linkedRefs = expandClipRefsWithLinks(project, [{ trackId, clipId: clip.id }]);
    const linkedClips: ClipWithRef[] = linkedRefs
      .map((ref) => findClipByRef(project, ref))
      .filter((entry): entry is ClipWithRef => entry != null);
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      trackId,
      clipId: clip.id,
      clipRole,
      startClientX: event.clientX,
      startClientY: event.clientY,
      latestClientX: event.clientX,
      latestClientY: event.clientY,
      original: clip,
      linkedClips,
      snapTargetsMs: collectSnapTargets(project, clip.id, playheadMs),
      thresholdMs,
    };

    setSelection({ trackId, clipId: clip.id });
    setSelectedClipKeys([key]);
    const nextPreview: InteractionPreview = {
      trackId,
      clipId: clip.id,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      inMs: clip.inMs,
      outMs: clip.outMs,
      snapGuideMs: null,
    };
    interactionPreviewRef.current = nextPreview;
    setInteractionPreview(nextPreview);

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
  };

  useEffect(() => {
    interactionPreviewRef.current = interactionPreview;
  }, [interactionPreview]);

  const updateSelectedClip = (updater: (clip: Clip) => Clip) => {
    if (!selection) return;
    if (selectedTrack?.locked) {
      setLog("Selected track is locked.");
      return;
    }
    setProjectWithNormalize((prev) => {
      const pos = findClip(prev, selection);
      if (!pos) return prev;
      const tracks = [...prev.timeline.tracks];
      const track = { ...tracks[pos.trackIndex] };
      if (track.locked) return prev;
      const clip = track.clips[pos.clipIndex];
      const updated = updater(clip);
      tracks[pos.trackIndex] = applyCollisionPolicy(track, clip.id, updated, collisionMode);
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const nudgeSelected = (deltaMs: number) => {
    if (selectedClipSet.size === 0) return;
    const refs = resolveRefsFromKeys(project, selectedClipKeys, true);
    if (refs.length === 0) return;
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }

    setProjectWithNormalize((prev) => {
      const targetRefs = resolveRefsFromKeys(prev, selectedClipKeys, true);
      if (targetRefs.length === 0) return prev;
      if (hasLockedRefs(prev, targetRefs)) return prev;

      const originals = targetRefs
        .map((ref) => findClipByRef(prev, ref))
        .filter((entry): entry is ClipWithRef => entry != null);
      if (originals.length === 0) return prev;

      const minStart = originals.reduce((min, entry) => Math.min(min, entry.clip.startMs), Number.POSITIVE_INFINITY);
      const rawDelta = snapActive ? quantize(deltaMs, snapMs) : deltaMs;
      const clampedDelta = Math.max(-minStart, rawDelta);
      const updates = originals.map((entry) => ({
        trackId: entry.trackId,
        clipId: entry.clipId,
        nextClip: sanitizeClip({
          ...entry.clip,
          startMs: Math.max(0, entry.clip.startMs + clampedDelta),
        }),
      }));

      const tracks = applyClipUpdatesAtomically(prev, updates, collisionMode);
      if (!tracks) return prev;
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const moveSelected = (deltaMs: number) => {
    if (!selection) return;
    const refs = expandClipRefsWithLinks(project, [selection]);
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }
    setProjectWithNormalize((prev) => {
      const originals = refs
        .map((ref) => findClipByRef(prev, ref))
        .filter((entry): entry is ClipWithRef => entry != null);
      if (originals.length === 0) return prev;
      const minStart = originals.reduce((min, entry) => Math.min(min, entry.clip.startMs), Number.POSITIVE_INFINITY);
      const requestedDelta = snapActive ? quantize(deltaMs, snapMs) : deltaMs;
      const safeDelta = Math.max(-minStart, requestedDelta);
      const updates = originals.map((entry) => ({
        trackId: entry.trackId,
        clipId: entry.clipId,
        nextClip: sanitizeClip({
          ...entry.clip,
          startMs: Math.max(0, entry.clip.startMs + safeDelta),
        }),
      }));
      const tracks = applyClipUpdatesAtomically(prev, updates, collisionMode);
      if (!tracks) return prev;
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const trimSelectedStart = (deltaMs: number) => {
    if (!selection) return;
    const refs = expandClipRefsWithLinks(project, [selection]);
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }
    setProjectWithNormalize((prev) => {
      const originals = refs
        .map((ref) => findClipByRef(prev, ref))
        .filter((entry): entry is ClipWithRef => entry != null);
      if (originals.length === 0) return prev;

      const requested = deltaMs;
      const minDelta = originals.reduce((max, entry) => Math.max(max, -entry.clip.startMs), Number.NEGATIVE_INFINITY);
      const maxDelta = originals.reduce(
        (min, entry) => Math.min(min, entry.clip.durationMs - MIN_CLIP_DURATION_MS),
        Number.POSITIVE_INFINITY,
      );
      const snapped = snapActive ? quantize(requested, snapMs) : requested;
      const safeDelta = clamp(snapped, minDelta, maxDelta);
      const updates = originals.map((entry) => {
        const startMs = Math.max(0, entry.clip.startMs + safeDelta);
        const durationMs = Math.max(MIN_CLIP_DURATION_MS, entry.clip.durationMs - safeDelta);
        const inMs = Math.max(0, entry.clip.inMs + safeDelta);
        return {
          trackId: entry.trackId,
          clipId: entry.clipId,
          nextClip: sanitizeClip({
            ...entry.clip,
            startMs,
            durationMs,
            inMs,
            outMs: inMs + durationMs,
          }),
        };
      });

      const tracks = applyClipUpdatesAtomically(prev, updates, collisionMode);
      if (!tracks) return prev;
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const trimSelectedEnd = (deltaMs: number) => {
    if (!selection) return;
    const refs = expandClipRefsWithLinks(project, [selection]);
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }
    setProjectWithNormalize((prev) => {
      const originals = refs
        .map((ref) => findClipByRef(prev, ref))
        .filter((entry): entry is ClipWithRef => entry != null);
      if (originals.length === 0) return prev;

      const requested = deltaMs;
      const minDelta = originals.reduce(
        (max, entry) => Math.max(max, MIN_CLIP_DURATION_MS - entry.clip.durationMs),
        Number.NEGATIVE_INFINITY,
      );
      const snapped = snapActive ? quantize(requested, snapMs) : requested;
      const safeDelta = Math.max(minDelta, snapped);
      const updates = originals.map((entry) => {
        const durationMs = Math.max(MIN_CLIP_DURATION_MS, entry.clip.durationMs + safeDelta);
        return {
          trackId: entry.trackId,
          clipId: entry.clipId,
          nextClip: sanitizeClip({
            ...entry.clip,
            durationMs,
            outMs: entry.clip.inMs + durationMs,
          }),
        };
      });

      const tracks = applyClipUpdatesAtomically(prev, updates, collisionMode);
      if (!tracks) return prev;
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const removeSelected = () => {
    if (selectedClipSet.size === 0) return;
    const refs = resolveRefsFromKeys(project, selectedClipKeys, true);
    if (refs.length === 0) return;
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }

    setProjectWithNormalize((prev) => {
      const targetRefs = resolveRefsFromKeys(prev, selectedClipKeys, true);
      if (targetRefs.length === 0) return prev;
      const removableKeys = new Set(targetRefs.map((ref) => clipRefToKey(ref)));
      const tracks = prev.timeline.tracks.map((track) => {
        if (track.locked) return track;
        const removed = track.clips
          .filter((clip) => removableKeys.has(clipKey(track.id, clip.id)))
          .sort((a, b) => a.startMs - b.startMs);
        if (removed.length === 0) return track;

        const baseClips = track.clips.filter((clip) => !removableKeys.has(clipKey(track.id, clip.id)));
        if (rippleMode !== "ripple-delete") {
          return { ...track, clips: sortClips(baseClips) };
        }

        const shifted = baseClips.map((clip) => {
          const delta = removed.reduce((acc, removedClip) => {
            const removedEnd = removedClip.startMs + removedClip.durationMs;
            if (removedEnd <= clip.startMs) return acc + removedClip.durationMs;
            return acc;
          }, 0);
          if (delta <= 0) return clip;
          return sanitizeClip({ ...clip, startMs: Math.max(0, clip.startMs - delta) });
        });
        return { ...track, clips: sortClips(shifted) };
      });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });

    setSelectedClipKeys((prev) => {
      const targetRefs = resolveRefsFromKeys(project, prev, true);
      const removableKeys = new Set(targetRefs.map((ref) => clipRefToKey(ref)));
      const next = prev.filter((key) => !removableKeys.has(key));
      const primary = next.at(-1);
      if (primary) {
        const [trackId, clipId] = primary.split(":");
        setSelection({ trackId, clipId });
      } else {
        setSelection(null);
      }
      return next;
    });
  };

  const splitClipAt = (trackId: string, clipId: string, targetMs: number) => {
    const seedRef: ClipRef = { trackId, clipId };
    const refs = expandClipRefsWithLinks(project, [seedRef]);
    if (refs.length === 0) return;
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }

    const splitAtBase = snapActive ? quantize(targetMs, snapMs) : targetMs;
    const canSplitAll = refs.every((ref) => {
      const entry = findClipByRef(project, ref);
      if (!entry) return false;
      return (
        splitAtBase > entry.clip.startMs + MIN_CLIP_DURATION_MS &&
        splitAtBase < entry.clip.startMs + entry.clip.durationMs - MIN_CLIP_DURATION_MS
      );
    });
    if (!canSplitAll) {
      setLog("Split point is too close to an edge for one linked clip.");
      return;
    }
    const seedClip = findClipByRef(project, seedRef)?.clip;
    const splitLinkedGroup = Boolean(seedClip?.linkGroupId && seedClip.linkLocked !== false && refs.length > 1);
    const leftGroupId = splitLinkedGroup ? `link-${crypto.randomUUID().slice(0, 8)}` : undefined;
    const rightGroupId = splitLinkedGroup ? `link-${crypto.randomUUID().slice(0, 8)}` : undefined;

    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.map((track) => ({
        ...track,
        clips: [...track.clips],
      }));
      let primaryRight: ClipRef | null = null;

      for (const ref of refs) {
        const trackIndex = tracks.findIndex((track) => track.id === ref.trackId);
        if (trackIndex < 0) return prev;
        const track = tracks[trackIndex];
        if (!track || track.locked) return prev;
        const clipIndex = track.clips.findIndex((clip) => clip.id === ref.clipId);
        if (clipIndex < 0) return prev;
        const clip = track.clips[clipIndex];

        const splitAt = splitAtBase;
        const leftDuration = splitAt - clip.startMs;
        const rightDuration = clip.durationMs - leftDuration;
        if (leftDuration < MIN_CLIP_DURATION_MS || rightDuration < MIN_CLIP_DURATION_MS) {
          return prev;
        }

        const left: Clip = {
          ...clip,
          id: `${clip.id}-a-${crypto.randomUUID().slice(0, 4)}`,
          label: `${clip.label}-A`,
          durationMs: leftDuration,
          outMs: clip.inMs + leftDuration,
          linkGroupId: leftGroupId ?? clip.linkGroupId,
          linkLocked: leftGroupId ? true : clip.linkLocked,
        };

        const right: Clip = {
          ...clip,
          id: `${clip.id}-b-${crypto.randomUUID().slice(0, 4)}`,
          label: `${clip.label}-B`,
          startMs: splitAt,
          inMs: clip.inMs + leftDuration,
          durationMs: rightDuration,
          outMs: clip.inMs + leftDuration + rightDuration,
          linkGroupId: rightGroupId ?? clip.linkGroupId,
          linkLocked: rightGroupId ? true : clip.linkLocked,
        };

        track.clips.splice(clipIndex, 1, left, right);
        tracks[trackIndex] = { ...track, clips: sortClips(track.clips) };
        if (ref.trackId === seedRef.trackId && ref.clipId === seedRef.clipId) {
          primaryRight = { trackId: ref.trackId, clipId: right.id };
        }
      }

      if (primaryRight) {
        setSelection(primaryRight);
        setSelectedClipKeys([clipKey(primaryRight.trackId, primaryRight.clipId)]);
      }
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const splitSelected = () => {
    if (!selection) return;
    splitClipAt(selection.trackId, selection.clipId, playheadMs);
  };

  const deleteClipById = (trackId: string, clipId: string) => {
    const refs = expandClipRefsWithLinks(project, [{ trackId, clipId }]);
    if (refs.length === 0) return;
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }
    setProjectWithNormalize((prev) => {
      const targetRefs = expandClipRefsWithLinks(prev, [{ trackId, clipId }]);
      const removeSet = new Set(targetRefs.map((ref) => clipRefToKey(ref)));
      const tracks = prev.timeline.tracks.map((track) => {
        if (track.locked) return track;
        return {
          ...track,
          clips: track.clips.filter((clip) => !removeSet.has(clipKey(track.id, clip.id))),
        };
      });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
    const removeSet = new Set(refs.map((ref) => clipRefToKey(ref)));
    if (selection && removeSet.has(clipKey(selection.trackId, selection.clipId))) {
      setSelection(null);
    }
    setSelectedClipKeys((prev) => prev.filter((key) => !removeSet.has(key)));
  };

  const duplicateClip = (trackId: string, clipId: string) => {
    const refs = expandClipRefsWithLinks(project, [{ trackId, clipId }]);
    if (refs.length === 0) return;
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }

    setProjectWithNormalize((prev) => {
      const linkedRefs = expandClipRefsWithLinks(prev, [{ trackId, clipId }]);
      if (linkedRefs.length === 0) return prev;
      if (hasLockedRefs(prev, linkedRefs)) return prev;

      const originals = linkedRefs
        .map((ref) => findClipByRef(prev, ref))
        .filter((entry): entry is ClipWithRef => entry != null);
      if (originals.length === 0) return prev;

      const primary = originals.find((entry) => entry.trackId === trackId && entry.clipId === clipId);
      if (!primary) return prev;
      const shiftMs = primary.clip.durationMs;
      const nextLinkGroupId = primary.clip.linkGroupId ? `link-${crypto.randomUUID().slice(0, 8)}` : undefined;
      const duplicateBySourceKey = new Map<string, Clip>();

      const tracks = prev.timeline.tracks.map((item) => {
        const additions = originals
          .filter((entry) => entry.trackId === item.id)
          .map((entry) => {
            const duplicateId = `${entry.clip.id}-copy-${crypto.randomUUID().slice(0, 4)}`;
            const duplicated = sanitizeClip({
              ...entry.clip,
              id: duplicateId,
              label: `${entry.clip.label} Copy`,
              startMs: entry.clip.startMs + shiftMs,
              linkGroupId: nextLinkGroupId,
              linkLocked: nextLinkGroupId ? true : entry.clip.linkLocked,
            });
            duplicateBySourceKey.set(clipRefToKey({ trackId: entry.trackId, clipId: entry.clipId }), duplicated);
            return duplicated;
          });
        if (additions.length === 0) return item;
        return { ...item, clips: sortClips([...item.clips, ...additions]) };
      });

      const primaryNewClip = duplicateBySourceKey.get(clipRefToKey({ trackId, clipId }));
      if (primaryNewClip) {
        setSelection({ trackId, clipId: primaryNewClip.id });
        setSelectedClipKeys([clipKey(trackId, primaryNewClip.id)]);
      }
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const detachLinkedGroup = (trackId: string, clipId: string) => {
    const refs = expandClipRefsWithLinks(project, [{ trackId, clipId }]);
    if (refs.length <= 1) {
      setLog("No linked audio/video group to detach.");
      return;
    }
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }

    const refSet = new Set(refs.map((ref) => clipRefToKey(ref)));
    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.map((track) => {
        if (track.locked) return track;
        const clips = track.clips.map((clip) =>
          refSet.has(clipKey(track.id, clip.id))
            ? { ...clip, linkGroupId: undefined, linkLocked: false }
            : clip,
        );
        return { ...track, clips };
      });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
    setLog("Detached linked audio/video clips.");
  };

  const relinkSelectedVideoAudio = (contextTrackId?: string, contextClipId?: string) => {
    const selectedRefs = resolveRefsFromKeys(project, selectedClipKeys, false);
    const contextRef =
      contextTrackId && contextClipId ? [{ trackId: contextTrackId, clipId: contextClipId }] : [];
    const refs = uniqClipRefs([...selectedRefs, ...contextRef]);
    if (refs.length < 2) {
      setLog("Select one video clip and one audio clip to relink.");
      return;
    }

    const clipEntries = refs
      .map((ref) => findClipByRef(project, ref))
      .filter((entry): entry is ClipWithRef => entry != null)
      .map((entry) => {
        const track = project.timeline.tracks.find((item) => item.id === entry.trackId);
        return {
          ...entry,
          role: track ? effectiveClipRole(track.kind, entry.clip) : "video",
        };
      });

    const videoEntries = clipEntries.filter((entry) => entry.role === "video");
    const audioEntries = clipEntries.filter((entry) => entry.role === "audio");
    if (videoEntries.length !== 1 || audioEntries.length !== 1) {
      setLog("Relink requires exactly one video clip and one audio clip selected.");
      return;
    }

    const linkRefs = [
      { trackId: videoEntries[0].trackId, clipId: videoEntries[0].clipId },
      { trackId: audioEntries[0].trackId, clipId: audioEntries[0].clipId },
    ];
    if (hasLockedRefs(project, linkRefs)) {
      setLog("Track is locked.");
      return;
    }

    const nextGroupId = `link-${crypto.randomUUID().slice(0, 8)}`;
    const refSet = new Set(linkRefs.map((ref) => clipRefToKey(ref)));
    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          refSet.has(clipKey(track.id, clip.id))
            ? {
                ...clip,
                linkGroupId: nextGroupId,
                linkLocked: true,
                mediaRole: toMediaRole(track.kind),
              }
            : clip,
        ),
      }));
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
    setLog("Relinked selected video/audio clips.");
  };

  const addTrack = (kind: TrackKind) => {
    setProjectWithNormalize((prev) => {
      const nextId = nextTrackId(prev.timeline.tracks, kind);
      const nextTrack: Track = { id: nextId, kind, muted: false, locked: false, visible: true, clips: [] };
      const tracks = [...prev.timeline.tracks];
      if (kind === "audio") {
        tracks.push(nextTrack);
      } else if (kind === "video") {
        const firstVideoIndex = tracks.findIndex((track) => track.kind === "video");
        const insertIndex = firstVideoIndex >= 0 ? firstVideoIndex : (() => {
          const firstAudioIndex = tracks.findIndex((track) => track.kind === "audio");
          return firstAudioIndex >= 0 ? firstAudioIndex : tracks.length;
        })();
        tracks.splice(insertIndex, 0, nextTrack);
      } else {
        const firstAudioIndex = tracks.findIndex((track) => track.kind === "audio");
        const insertIndex = firstAudioIndex >= 0 ? firstAudioIndex : tracks.length;
        tracks.splice(insertIndex, 0, nextTrack);
      }
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
    setLog(`Track added: ${kind}.`);
  };

  const addAssetToNewTrack = (assetId: string, trackKind: "video" | "audio", startMs: number) => {
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset) {
      setLog("Asset not found.");
      return;
    }
    if (trackKind === "video" && !(asset.kind === "video" || asset.kind === "image")) {
      setLog("Only visual assets can be dropped on video tracks.");
      return;
    }
    if (trackKind === "audio" && asset.kind !== "audio") {
      setLog("Only audio assets can be dropped on audio tracks.");
      return;
    }

    setProjectWithNormalize((prev) => {
      let tracks = [...prev.timeline.tracks];
      const nextId = nextTrackId(tracks, trackKind);
      const nextTrack: Track = { id: nextId, kind: trackKind, muted: false, locked: false, visible: true, clips: [] };
      if (trackKind === "audio") {
        tracks.push(nextTrack);
      } else {
        const firstVideoIndex = tracks.findIndex((track) => track.kind === "video");
        const insertIndex = firstVideoIndex >= 0 ? firstVideoIndex : (() => {
          const firstAudioIndex = tracks.findIndex((track) => track.kind === "audio");
          return firstAudioIndex >= 0 ? firstAudioIndex : tracks.length;
        })();
        tracks.splice(insertIndex, 0, nextTrack);
      }
      const trackIndex = tracks.findIndex((track) => track.id === nextId);
      if (trackIndex < 0) return prev;
      const targetTrack = { ...tracks[trackIndex], clips: [...tracks[trackIndex].clips] };
      const nextStartMs = Math.max(0, Math.round(startMs));
      const durationMs = Math.max(
        MIN_CLIP_DURATION_MS,
        Math.round(asset.durationMs ?? (asset.kind === "image" ? 3000 : videoDurationMs ?? 3000)),
      );
      const clipId = `clip-${crypto.randomUUID().slice(0, 8)}`;
      const shouldCreateLinkedAudio = asset.kind === "video" && asset.hasAudio !== false;
      const linkGroupId = shouldCreateLinkedAudio ? `link-${crypto.randomUUID().slice(0, 8)}` : undefined;
      const clip: Clip = {
        id: clipId,
        label: asset.name ?? (asset.kind === "image" ? "image" : "clip"),
        assetId: asset.id,
        startMs: nextStartMs,
        durationMs,
        inMs: 0,
        outMs: durationMs,
        mediaRole: trackKind === "audio" ? "audio" : "video",
        linkGroupId,
        linkLocked: Boolean(linkGroupId),
        visual: trackKind === "audio" ? undefined : defaultClipVisual(),
      };
      targetTrack.clips.push(clip);
      tracks[trackIndex] = targetTrack;

      if (shouldCreateLinkedAudio) {
        const resolvedAudio = findOrCreateUnlockedTrack(tracks, "audio");
        if (resolvedAudio) {
          tracks = resolvedAudio.tracks;
          const audioTrack = {
            ...tracks[resolvedAudio.trackIndex],
            clips: [...tracks[resolvedAudio.trackIndex].clips],
          };
          const audioClipId = `clip-${crypto.randomUUID().slice(0, 8)}`;
          const audioClip: Clip = {
            id: audioClipId,
            label: `${asset.name ?? "video"} audio`,
            assetId: asset.id,
            startMs: nextStartMs,
            durationMs,
            inMs: 0,
            outMs: durationMs,
            mediaRole: "audio",
            linkGroupId,
            linkLocked: true,
            visual: undefined,
          };
          audioTrack.clips.push(audioClip);
          tracks[resolvedAudio.trackIndex] = audioTrack;
        }
      }

      const timelineDuration = Math.max(prev.timeline.durationMs, clip.startMs + clip.durationMs + 1000);
      setSelection({ trackId: nextId, clipId: clipId });
      setSelectedClipKeys([clipKey(nextId, clipId)]);
      setPlayheadMs(clip.startMs);
      return { ...prev, timeline: { ...prev.timeline, durationMs: timelineDuration, tracks } };
    });
    setLog(`Created ${trackKind} track and added ${asset.name ?? assetId}.`);
  };

  const toggleTrackFlag = (trackId: string, key: "muted" | "locked" | "visible") => {
    setProjectWithNormalize((prev) => {
      const track = prev.timeline.tracks.find((item) => item.id === trackId);
      if (!track) return prev;
      const tracks = prev.timeline.tracks.map((item) =>
        item.id === trackId ? { ...item, [key]: !item[key] } : item,
      );
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const removeTrack = (trackId: string) => {
    const target = project.timeline.tracks.find((track) => track.id === trackId);
    if (!target) return;
    if (target.locked) {
      setLog("Track is locked.");
      return;
    }
    if (project.timeline.tracks.length <= 1) {
      setLog("At least one track must remain.");
      return;
    }
    if (target.clips.length > 0) {
      setLog("Remove or move clips before deleting this track.");
      return;
    }

    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.filter((track) => track.id !== trackId);
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });

    if (selection?.trackId === trackId) {
      setSelection(null);
    }
    setSelectedClipKeys((prev) => prev.filter((key) => !key.startsWith(`${trackId}:`)));
    setLog(`Track removed: ${trackId}.`);
  };

  const addOverlayClip = () => {
    const unlockedOverlay = project.timeline.tracks.find((track) => track.kind === "overlay" && !track.locked);
    if (!unlockedOverlay) {
      setLog("No unlocked overlay track available.");
      return;
    }
    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.map((track) => {
        if (track.kind !== "overlay" || track.locked) return track;
        const id = `overlay-${crypto.randomUUID().slice(0, 8)}`;
        const next: Clip = {
          id,
          label: "sticker",
          assetId: id,
          startMs: playheadMs,
          durationMs: 1200,
          inMs: 0,
          outMs: 1200,
          mediaRole: "overlay",
          linkLocked: false,
          visual: defaultClipVisual(),
        };
        setSelection({ trackId: track.id, clipId: id });
        setSelectedClipKeys([clipKey(track.id, id)]);
        return { ...track, clips: [...track.clips, next] };
      });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const runSilenceCutAiPlugin = async () => {
    const hasVideo = project.assets.some((asset) => asset.kind === "video");
    if (!hasVideo) {
      setLog("Silence cut requires at least one video asset.");
      return;
    }
    const normalized = normalizeProject(project);
    const input: SilenceCutPluginInput = {
      projectId: normalized.meta.projectId,
      tracks: normalized.timeline.tracks.map((track) => ({
        id: track.id,
        kind: track.kind,
        locked: track.locked,
        clips: track.clips.map((clip) => ({
          id: clip.id,
          label: clip.label,
          assetId: clip.assetId,
          startMs: clip.startMs,
          durationMs: clip.durationMs,
          inMs: clip.inMs,
          outMs: clip.outMs,
        })),
      })),
      assets: normalized.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        durationMs: asset.durationMs,
        waveform: asset.waveform,
      })),
      params: {
        threshold: 0.12,
        minSilenceMs: 240,
        minKeepMs: 450,
      },
    };

    const runToken = aiRunTokenRef.current + 1;
    aiRunTokenRef.current = runToken;
    setAiJobStatus("running");
    setAiSummary("Analyzing clip edges for silence...");
    setAiLastOutput(null);
    setLog("AI plugin started: silence-cut-v1");

    try {
      const output = await runSilenceCutPlugin(input);
      if (aiRunTokenRef.current !== runToken) return;
      setAiJobStatus("completed");
      setAiSummary(output.summary);
      setAiLastOutput(output);
      setLog(`AI plugin completed: ${output.summary}`);
    } catch (error) {
      if (aiRunTokenRef.current !== runToken) return;
      const message = error instanceof Error ? error.message : String(error);
      setAiJobStatus("failed");
      setAiSummary(`Plugin failed: ${message}`);
      setAiLastOutput(null);
      setLog(`AI plugin failed: ${message}`);
    }
  };

  const applySilenceCutResult = () => {
    const output = aiLastOutput;
    if (!output) {
      setLog("No AI result to apply.");
      return;
    }
    if (output.clipPatches.length === 0) {
      setLog("No silence trims to apply.");
      return;
    }

    const applicablePatches = output.clipPatches.filter((patch) => !isTrackLocked(project, patch.trackId));
    if (applicablePatches.length === 0) {
      setLog("All suggested clips are on locked tracks.");
      return;
    }
    const patchMap = new Map(applicablePatches.map((patch) => [`${patch.trackId}:${patch.clipId}`, patch]));
    const firstApplied = applicablePatches[0]
      ? { trackId: applicablePatches[0].trackId, clipId: applicablePatches[0].clipId }
      : null;
    const appliedCount = applicablePatches.length;

    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.map((track) => {
        if (track.locked) return track;
        let changed = false;
        const clips = track.clips.map((clip) => {
          const patch = patchMap.get(`${track.id}:${clip.id}`);
          if (!patch) return clip;
          changed = true;
          return sanitizeClip({
            ...clip,
            startMs: patch.startMs,
            durationMs: patch.durationMs,
            inMs: patch.inMs,
            outMs: patch.outMs,
          });
        });
        return changed ? { ...track, clips: sortClips(clips) } : track;
      });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });

    if (firstApplied) {
      setSelection(firstApplied);
      setSelectedClipKeys([clipKey(firstApplied.trackId, firstApplied.clipId)]);
    }
    setAiSummary(`Applied silence cut to ${appliedCount} clip(s).`);
    setLog(`Applied AI result: silence-cut-v1 (${appliedCount} clip(s)).`);
  };

  const updateSelectedTiming = (patch: Partial<Pick<Clip, "startMs" | "durationMs" | "inMs" | "outMs">>) => {
    if (!selection) return;
    const refs = expandClipRefsWithLinks(project, [selection]);
    if (hasLockedRefs(project, refs)) {
      setLog("Linked clip group includes locked tracks.");
      return;
    }

    setProjectWithNormalize((prev) => {
      const originals = refs
        .map((ref) => findClipByRef(prev, ref))
        .filter((entry): entry is ClipWithRef => entry != null);
      if (originals.length === 0) return prev;

      const primary = originals.find((entry) => entry.trackId === selection.trackId && entry.clipId === selection.clipId);
      if (!primary) return prev;
      const requestedStart = patch.startMs ?? primary.clip.startMs;
      const requestedDuration = Math.max(MIN_CLIP_DURATION_MS, patch.durationMs ?? primary.clip.durationMs);
      const requestedIn = patch.inMs ?? primary.clip.inMs;
      const requestedOut = patch.outMs ?? requestedIn + requestedDuration;
      const startDelta = requestedStart - primary.clip.startMs;
      const durationDelta = requestedDuration - primary.clip.durationMs;
      const inDelta = requestedIn - primary.clip.inMs;
      const outDelta = Math.max(requestedIn, requestedOut) - primary.clip.outMs;

      const updates = originals.map((entry) => {
        const nextStart = Math.max(0, entry.clip.startMs + startDelta);
        const nextDuration = Math.max(MIN_CLIP_DURATION_MS, entry.clip.durationMs + durationDelta);
        const nextIn = Math.max(0, entry.clip.inMs + inDelta);
        const nextOut = Math.max(nextIn, entry.clip.outMs + outDelta);
        return {
          trackId: entry.trackId,
          clipId: entry.clipId,
          nextClip: sanitizeClip({
            ...entry.clip,
            startMs: nextStart,
            durationMs: nextDuration,
            inMs: nextIn,
            outMs: nextOut,
          }),
        };
      });

      const tracks = applyClipUpdatesAtomically(prev, updates, collisionMode);
      if (!tracks) return prev;
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const updateSelectedVisual = (patch: Partial<ClipVisual>) => {
    updateSelectedClip((clip) => {
      const role = selectedTrack ? effectiveClipRole(selectedTrack.kind, clip) : clip.mediaRole ?? "video";
      if (role === "audio") return clip;
      const current = clip.visual ?? defaultClipVisual();
      return {
        ...clip,
        visual: {
          ...current,
          ...patch,
          scalePct: clamp(Math.round((patch.scalePct ?? current.scalePct)), 1, 2000),
          opacityPct: clamp(Math.round((patch.opacityPct ?? current.opacityPct)), 0, 100),
          fitMode: (patch.fitMode ?? current.fitMode) === "adapt" ? "adapt" : "pixel-100",
        },
      };
    });
  };

  const resetSelectedVisual = () => {
    updateSelectedClip((clip) => {
      const role = selectedTrack ? effectiveClipRole(selectedTrack.kind, clip) : clip.mediaRole ?? "video";
      if (role === "audio") return clip;
      return {
        ...clip,
        visual: defaultClipVisual(),
      };
    });
  };

  const adaptSelectedVisualToFrame = () => {
    updateSelectedClip((clip) => {
      const role = selectedTrack ? effectiveClipRole(selectedTrack.kind, clip) : clip.mediaRole ?? "video";
      if (role === "audio") return clip;
      const current = clip.visual ?? defaultClipVisual();
      return {
        ...clip,
        visual: {
          ...current,
          x: 0,
          y: 0,
          fitMode: "adapt",
        },
      };
    });
  };

  const saveProject = () => {
    const normalized = normalizeProject(project);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    setLog("Project saved to local storage.");
  };

  const loadProject = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setLog("No saved project found.");
      return;
    }

    try {
      const parsed = JSON.parse(raw) as ProjectState;
      if (parsed.schemaVersion !== "mav.project.v0" && parsed.schemaVersion !== "mav.project.v1") {
        setLog("Saved project schema is not supported.");
        return;
      }
      const normalized = normalizeProject(parsed);
      setProject(normalized);
      historyRef.current = { undo: [], redo: [] };
      setSelection(null);
      setSelectedClipKeys([]);
      setAiJobStatus("idle");
      setAiSummary(null);
      setAiLastOutput(null);
      setLog("Project loaded from local storage.");
    } catch {
      setLog("Saved project is invalid JSON.");
    }
  };

  const exportProjectJson = () => {
    const normalized = normalizeProject(project);
    const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mav-project-v1.json";
    a.click();
    URL.revokeObjectURL(url);
    setLog("Project JSON exported.");
  };

  const undo = () => {
    const previous = historyRef.current.undo.pop();
    if (!previous) {
      setLog("Nothing to undo.");
      return;
    }
    historyRef.current.redo.push(project);
    setProject(normalizeProject(previous));
    setLog("Undo applied.");
  };

  const redo = () => {
    const next = historyRef.current.redo.pop();
    if (!next) {
      setLog("Nothing to redo.");
      return;
    }
    historyRef.current.undo.push(project);
    setProject(normalizeProject(next));
    setLog("Redo applied.");
  };

  const appendDecoderLog = (line: string) => {
    setDecoderLogs((prev) => [line, ...prev].slice(0, 12));
  };

  const rejectPendingSeeks = (message: string) => {
    for (const [requestId, pending] of pendingSeekRef.current.entries()) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      pendingSeekRef.current.delete(requestId);
      requestReasonRef.current.delete(requestId);
    }
  };

  const requestWorkerSeek = (targetUs: number, reason: SeekReason, timeoutMs = 6000) => {
    const worker = decodeWorkerRef.current;
    if (!worker) {
      return Promise.reject(new Error("Decode worker not available."));
    }

    const requestId = ++decodeRequestIdRef.current;
    requestReasonRef.current.set(requestId, reason);

    return new Promise<SeekResultMessage>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingSeekRef.current.delete(requestId);
        requestReasonRef.current.delete(requestId);
        reject(new Error(`Seek timeout for request ${requestId}.`));
      }, timeoutMs);

      pendingSeekRef.current.set(requestId, { resolve, reject, timeoutId });

      worker.postMessage({
        type: "seek",
        requestId,
        targetUs,
        reason,
      } satisfies DecodeWorkerInMessage);
    });
  };

  const queuePreviewSeek = (targetUs: number) => {
    const state = previewSeekThrottleRef.current;
    state.targetUs = targetUs;

    if (state.timeoutId != null) return;
    state.timeoutId = window.setTimeout(() => {
      state.timeoutId = null;
      void requestWorkerSeek(state.targetUs, "preview").catch((error) => {
        appendDecoderLog(`SEEK ERROR: ${String(error)}`);
      });
    }, 33);
  };

  const stopPlayback = () => {
    const current = playbackRef.current;
    if (current.rafId != null) {
      cancelAnimationFrame(current.rafId);
      current.rafId = null;
    }
    current.lastTs = null;
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    setSourceIsPlaying(false);
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        setPreviewMonitorMode("program");
      }
      return next;
    });
  };

  const stepFrame = (direction: "forward" | "backward") => {
    stopPlayback();
    const frameMs = Math.max(1, Math.round(1000 / Math.max(1, decoderFps)));
    const delta = direction === "forward" ? frameMs : -frameMs;
    setPlayheadMs((prev) => clamp(prev + delta, 0, playbackDurationMs));
  };

  const toggleSourcePlayback = () => {
    if (!sourceVideoUrl) {
      setLog("Open a source asset to play in Source monitor.");
      return;
    }
    setIsPlaying(false);
    setSourceIsPlaying((prev) => !prev);
  };

  const stepSourceFrame = (direction: "forward" | "backward") => {
    setSourceIsPlaying(false);
    const frameMs = Math.max(1, Math.round(1000 / Math.max(1, decoderFps)));
    const delta = direction === "forward" ? frameMs : -frameMs;
    setSourcePlayheadMs((prev) => clamp(prev + delta, 0, sourceMonitorDurationMs));
  };

  const setMarkInAtPlayhead = () => {
    setMarkInMs(playheadMs);
    if (markOutMs != null && markOutMs < playheadMs) {
      setMarkOutMs(playheadMs);
    }
  };

  const setMarkOutAtPlayhead = () => {
    setMarkOutMs(playheadMs);
    if (markInMs != null && markInMs > playheadMs) {
      setMarkInMs(playheadMs);
    }
  };

  const clearExportPolling = () => {
    if (exportPollTimerRef.current != null) {
      window.clearInterval(exportPollTimerRef.current);
      exportPollTimerRef.current = null;
    }
  };

  const upsertExportHistory = (job: ExportJobState) => {
    setExportHistory((prev) => {
      const next = [job, ...prev.filter((entry) => entry.jobId !== job.jobId)];
      return next.slice(0, EXPORT_HISTORY_LIMIT);
    });
  };

  const persistExportSession = (job: ExportJobState | null) => {
    try {
      if (!job) {
        localStorage.removeItem(EXPORT_SESSION_KEY);
        return;
      }
      localStorage.setItem(
        EXPORT_SESSION_KEY,
        JSON.stringify({
          jobId: job.jobId,
          preset: exportPreset,
          fps: exportFps,
        }),
      );
    } catch {
      // Ignore localStorage errors; session restore is optional.
    }
  };

  const normalizeExportJobPayload = (payload: ExportJobState): ExportJobState => {
    return {
      ...payload,
      renderOptions: payload.renderOptions ?? {
        preset: exportPreset,
        fps: exportFps,
        format: "mp4",
      },
    };
  };

  const refreshExportJob = async (jobId: string) => {
    const response = await fetch(`${renderWorkerBaseUrl}/api/render/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Status check failed (${response.status}).`);
    }

    const payload = normalizeExportJobPayload((await response.json()) as ExportJobState);
    setExportJob(payload);
    upsertExportHistory(payload);
    if (payload.status === "failed") {
      setExportValidationMessage(payload.error ?? "Export failed.");
    } else {
      setExportValidationMessage(null);
    }
    if (payload.status === "completed" || payload.status === "failed" || payload.status === "canceled") {
      clearExportPolling();
      persistExportSession(null);
    } else {
      persistExportSession(payload);
    }
    return payload;
  };

  const beginExportPolling = (jobId: string) => {
    clearExportPolling();
    void refreshExportJob(jobId).catch((error) => {
      setLog(`Export poll failed: ${String(error)}`);
    });
    exportPollTimerRef.current = window.setInterval(() => {
      void refreshExportJob(jobId).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setExportValidationMessage(`Export status check failed: ${message}`);
        setLog(`Export poll failed: ${message}`);
      });
    }, 1000);
  };

  const canStartExport = () => {
    const hasAssets = project.assets.some((asset) => asset.kind === "video");
    const hasTimelineClips = project.timeline.tracks.some((track) => track.clips.length > 0);
    return hasAssets && hasTimelineClips;
  };

  const createExportJob = async () => {
    if (!canStartExport()) {
      setExportValidationMessage("Add at least one video clip to the timeline before exporting.");
      setLog("Export blocked: no timeline clip.");
      return;
    }

    setExportValidationMessage(null);
    setExportBusy(true);
    try {
      const normalized = normalizeProject(project);
      const referencedAssetIds = new Set(
        normalized.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.assetId)),
      );
      const assetUrls = normalized.assets.map((asset) =>
        asset.url.startsWith("http://") || asset.url.startsWith("https://")
          ? asset.url
          : `https://local.mav.invalid/assets/${asset.id}`,
      );
      const assetPayloads = (
        await Promise.all(
          normalized.assets.map(async (asset) => {
            if (!referencedAssetIds.has(asset.id)) return null;
            const file = assetFilesRef.current.get(asset.id);
            if (!file) return null;
            const base64Data = arrayBufferToBase64(await file.arrayBuffer());
            return {
              assetId: asset.id,
              filename: file.name,
              mimeType: file.type || undefined,
              base64Data,
            };
          }),
        )
      ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      const response = await fetch(`${renderWorkerBaseUrl}/api/render/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectJson: normalized,
          assetUrls,
          assetPayloads,
          preset: "mp4-h264-aac",
          renderOptions: {
            preset: exportPreset,
            fps: exportFps,
            format: "mp4",
          },
          idempotencyKey: `${normalized.meta.projectId}:${normalized.meta.updatedAt}:${exportPreset}:${exportFps}`,
        }),
      });
      if (!response.ok) {
        throw new Error(`Export submit failed (${response.status}).`);
      }
      const payload = normalizeExportJobPayload((await response.json()) as ExportJobState);
      setExportJob(payload);
      upsertExportHistory(payload);
      persistExportSession(payload);
      beginExportPolling(payload.jobId);
      setLog(`Export job submitted: ${payload.jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportValidationMessage(`Export submit failed: ${message}`);
      setLog(`Export submit error: ${message}`);
    } finally {
      setExportBusy(false);
    }
  };

  const cancelExportJob = async () => {
    if (!exportJob) return;
    setExportBusy(true);
    try {
      const response = await fetch(`${renderWorkerBaseUrl}/api/render/jobs/${exportJob.jobId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Cancel failed (${response.status}).`);
      }
      await refreshExportJob(exportJob.jobId);
      setLog(`Export job canceled: ${exportJob.jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportValidationMessage(`Cancel failed: ${message}`);
      setLog(`Export cancel error: ${message}`);
    } finally {
      setExportBusy(false);
    }
  };

  const retryExportJob = async () => {
    if (!exportJob) return;
    setExportValidationMessage(null);
    setExportBusy(true);
    try {
      const response = await fetch(`${renderWorkerBaseUrl}/api/render/jobs/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: exportJob.jobId }),
      });
      if (!response.ok) {
        throw new Error(`Retry failed (${response.status}).`);
      }
      const payload = await refreshExportJob(exportJob.jobId);
      persistExportSession(payload);
      beginExportPolling(exportJob.jobId);
      setLog(`Export job retried: ${exportJob.jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportValidationMessage(`Retry failed: ${message}`);
      setLog(`Export retry error: ${message}`);
    } finally {
      setExportBusy(false);
    }
  };

  const downloadExport = () => {
    if (!exportJob?.outputUrl) return;
    window.open(exportJob.outputUrl, "_blank", "noopener,noreferrer");
  };

  const exportQARunResult = (result: DecodeQaRunResult | null) => {
    if (!result || !result.metric) return false;

    const safeProfile = result.metric.profile.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const stamp = result.metric.runAt.replaceAll(":", "-").replaceAll(".", "-");
    const filename = `decode-qa-${safeProfile}-${stamp}.json`;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return true;
  };

  const runDecodeQA = async (options?: DecodeQaRunOptions): Promise<DecodeQaRunResult> => {
    const makeResult = (
      metric: QAMetric | null,
      scenarios: DecodeQaScenarioResult[],
      decoderErrors: DecoderErrorMessage[],
      seekResults: SeekResultMessage[],
      evaluatedScenarioCount: number,
      idrSkipStats: { totalSkips: number; maxSkips: number; seekWithSkips: number },
    ): DecodeQaRunResult => {
      const buckets = new Map<string, number>();
      for (const error of decoderErrors) {
        const key = `${error.name}:${error.message}`;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      const decoderErrorBuckets = [...buckets.entries()].map(([key, count]) => ({ key, count }));
      const seekErrors = seekResults
        .filter((item) => item.status === "error")
        .map((item) => ({
          requestId: item.requestId,
          targetUs: item.targetUs,
          message: item.message ?? "unknown-seek-error",
          skippedToIdrSamples: item.skippedToIdrSamples ?? 0,
        }));
      const seekBucketMap = new Map<string, number>();
      for (const error of seekErrors) {
        seekBucketMap.set(error.message, (seekBucketMap.get(error.message) ?? 0) + 1);
      }
      const seekErrorBuckets = [...seekBucketMap.entries()].map(([key, count]) => ({ key, count }));

      return {
        metric,
        scenarios,
        diagnostics: {
          decoderErrors,
          decoderErrorBuckets,
          seekErrors,
          seekErrorBuckets,
          requestStats: {
            evaluatedScenarios: evaluatedScenarioCount,
            totalSeekRequests: seekResults.length,
          },
          lastSeekResult: lastSeekResultRef.current,
          idrSkipStats,
          source: {
            decoderMode,
            isFmp4Source,
            codec: sourceDetails.codec,
            codedWidth: sourceDetails.codedWidth,
            codedHeight: sourceDetails.codedHeight,
            descriptionLength: sourceDetails.descriptionLength,
            timestampAuditIssueCount: sourceDetails.timestampAuditIssueCount,
            fps: decoderFps > 0 ? decoderFps : null,
          },
        },
      };
    };

    if (decoderMode !== "webcodecs") {
      setLog("Decode QA requires WebCodecs mode.");
      const result = makeResult(null, [], [], [], 0, {
        totalSkips: 0,
        maxSkips: 0,
        seekWithSkips: 0,
      });
      setLastRunResult(result);
      return result;
    }

    const durationUs = Math.max(1, decoderDurationUs);
    const scenarioCount = clamp(Math.round(options?.scenarioCount ?? qaScenarioCount), 10, 200);
    const profileLabel = options?.profile ?? qaProfile;
    const optionSeed = options?.seed;
    const seed =
      typeof optionSeed === "number" && Number.isFinite(optionSeed)
        ? Math.round(optionSeed)
        : hashSeed(`${profileLabel}:${durationUs}:${scenarioCount}`);
    const targets = buildQATargets(durationUs, scenarioCount, seed);
    const frameUs = Math.max(1, Math.round(1_000_000 / Math.max(1, decoderFps)));
    const results: SeekResultMessage[] = [];
    const scoredResults: SeekResultMessage[] = [];
    const decoderErrorStartIndex = decoderErrorsRef.current.length;

    setQaRunning(true);
    setQaMetric(null);
    appendDecoderLog(`QA start: profile=${profileLabel}, scenarios=${scenarioCount}, seed=${seed}`);

    try {
      const captureResult = async (targetUsValue: number) => {
        try {
          const result = await requestWorkerSeek(targetUsValue, "qa", 8000);
          results.push(result);
          return result;
        } catch (error) {
          const synthetic: SeekResultMessage = {
            type: "seekResult",
            requestId: -1,
            targetUs: targetUsValue,
            timestampUs: null,
            status: "error",
            fromCache: false,
            decodeMs: 0,
            reason: "qa",
            message: String(error),
          };
          results.push(synthetic);
          return synthetic;
        }
      };

      for (let i = 0; i < targets.length; i += 1) {
        const targetUs = targets[i];

        if (i > 0 && i % 15 === 0) {
          const burstTargets = [-2, -1, 0, 1, 2].map((step) =>
            clamp(targetUs + step * frameUs, 0, durationUs - 1),
          );
          const burstResults = await Promise.all(burstTargets.map((value) => captureResult(value)));
          const latest = burstResults[burstResults.length - 1];
          if (latest) {
            scoredResults.push(latest);
          }
          continue;
        }

        const singleResult = await captureResult(targetUs);
        scoredResults.push(singleResult);
        await new Promise((resolve) => window.setTimeout(resolve, 8));
      }

      const ok = scoredResults.filter((item) => item.status === "ok" && item.timestampUs != null);
      const errors = scoredResults.filter((item) => item.status === "error");
      const stale = scoredResults.filter((item) => item.status === "stale");
      const avgTtffMs =
        ok.length > 0 ? ok.reduce((sum, item) => sum + item.decodeMs, 0) / ok.length : 0;
      const driftsMs = ok.map((item) => Math.abs((item.timestampUs ?? 0) - item.targetUs) / 1000);
      const withinOneFrame = ok.filter(
        (item) => item.timestampUs != null && Math.abs(item.timestampUs - item.targetUs) <= frameUs,
      );

      const metric: QAMetric = {
        runAt: new Date().toISOString(),
        profile: profileLabel,
        totalScenarios: scoredResults.length,
        time_to_first_frame_ms: avgTtffMs,
        seek_success_pct: scoredResults.length > 0 ? (ok.length / scoredResults.length) * 100 : 0,
        decode_errors: errors.length,
        stale_results: stale.length,
        drift_within_1frame_pct: ok.length > 0 ? (withinOneFrame.length / ok.length) * 100 : 0,
        avg_drift_ms:
          driftsMs.length > 0 ? driftsMs.reduce((sum, item) => sum + item, 0) / driftsMs.length : 0,
        max_drift_ms: driftsMs.length > 0 ? Math.max(...driftsMs) : 0,
      };

      const scenarioResults: DecodeQaScenarioResult[] = scoredResults.map((item, index) => {
        const driftUs = item.timestampUs != null ? item.timestampUs - item.targetUs : null;
        return {
          scenarioId: index + 1,
          requestId: item.requestId,
          targetUs: item.targetUs,
          timestampUs: item.timestampUs,
          status: item.status,
          fromCache: item.fromCache,
          decodeMs: item.decodeMs,
          skippedToIdrSamples: item.skippedToIdrSamples ?? 0,
          keyframeStartUs: item.keyframeStartUs ?? null,
          message: item.message,
          driftUs,
          driftFrames: driftUs != null ? driftUs / frameUs : null,
        };
      });

      setQaMetric(metric);
      setQaHistory((prev) => [metric, ...prev].slice(0, 10));
      const runDecoderErrors = decoderErrorsRef.current.slice(decoderErrorStartIndex);
      const idrSkipValues = results.map((item) => item.skippedToIdrSamples ?? 0);
      const runResult = makeResult(
        metric,
        scenarioResults,
        runDecoderErrors,
        results,
        scoredResults.length,
        {
          totalSkips: idrSkipValues.reduce((sum, value) => sum + value, 0),
          maxSkips: idrSkipValues.length > 0 ? Math.max(...idrSkipValues) : 0,
          seekWithSkips: idrSkipValues.filter((value) => value > 0).length,
        },
      );
      setLastRunResult(runResult);
      appendDecoderLog(
        `QA done: success=${metric.seek_success_pct.toFixed(1)}%, errors=${metric.decode_errors}, stale=${metric.stale_results}`,
      );
      setLog("Decode QA run completed.");
      return runResult;
    } finally {
      setQaRunning(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw) as Array<[string, AssetAnalysisCacheValue]>;
      if (!Array.isArray(entries)) return;
      analysisCacheRef.current = new Map(entries.slice(-ANALYSIS_CACHE_LIMIT));
    } catch {
      analysisCacheRef.current = new Map();
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SOURCE_RANGE_STORAGE_KEY, JSON.stringify(sourceRangesByAsset));
    } catch {
      // Ignore local storage errors; source ranges still work in memory.
    }
  }, [sourceRangesByAsset]);

  useEffect(() => {
    const worker = new Worker(new URL("./preview/media-analysis.worker.ts", import.meta.url), {
      type: "module",
    });
    analysisWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<AnalysisWorkerOutMessage>) => {
      const message = event.data;
      if (message.type !== "analysis") return;
      assetThumbBusyRef.current.delete(message.assetId);
      const analysis: AssetAnalysisCacheValue = {
        waveform: message.waveform,
        heroThumbnail: message.heroThumbnail,
        thumbnails: message.thumbnails,
        codecGuess: message.codecGuess,
      };
      const cacheKey = assetAnalysisKeyRef.current.get(message.assetId);
      if (cacheKey) {
        analysisCacheRef.current.set(cacheKey, analysis);
        if (analysisCacheRef.current.size > ANALYSIS_CACHE_LIMIT) {
          const oldest = analysisCacheRef.current.keys().next().value;
          if (typeof oldest === "string") {
            analysisCacheRef.current.delete(oldest);
          }
        }
        persistAnalysisCache();
      }
      applyAnalysisToAsset(message.assetId, analysis);
    };

    return () => {
      worker.terminate();
      analysisWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selection) return;
    if (clipExists(selection.trackId, selection.clipId)) return;
    setSelection(null);
    setSelectedClipKeys((prev) =>
      prev.filter((key) => {
        const [trackId, clipId] = key.split(":");
        return clipExists(trackId, clipId);
      }),
    );
  }, [clipExists, selection]);

  useEffect(() => {
    programAssetIdRef.current = programAssetId;
  }, [programAssetId]);

  useEffect(() => {
    if (devMode) return;
    setDiagnosticsVisible(false);
  }, [devMode]);

  useEffect(() => {
    return () => {
      for (const video of auxiliaryLayerVideosRef.current) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      auxiliaryLayerVideosRef.current = [];
    };
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    playheadMsRef.current = playheadMs;
  }, [playheadMs]);

  useEffect(() => {
    if (sourceIsPlaying) return;
    if (!activeAssetId) return;
    const asset = project.assets.find((entry) => entry.id === activeAssetId);
    if (!asset || asset.kind !== "video") return;
    const nextMs = clamp(Math.round(sourcePlayheadMs), 0, sourceMonitorDurationMs);
    setSourceRangesByAsset((prev) => {
      const current = prev[activeAssetId] ?? { inMs: null, outMs: null, lastPlayheadMs: 0 };
      if (current.lastPlayheadMs === nextMs) return prev;
      return {
        ...prev,
        [activeAssetId]: {
          ...current,
          lastPlayheadMs: nextMs,
        },
      };
    });
  }, [activeAssetId, project.assets, sourceIsPlaying, sourceMonitorDurationMs, sourcePlayheadMs]);

  useEffect(() => {
    editorLayoutRef.current = editorLayout;
  }, [editorLayout]);

  useEffect(() => {
    const onViewportResize = () => {
      const nextDesktop = window.innerWidth > DESKTOP_LAYOUT_BREAKPOINT;
      setIsDesktopResizable((prev) => (prev === nextDesktop ? prev : nextDesktop));

      const viewportHeight = window.innerHeight || 900;
      setEditorLayout((prev) => {
        const next = normalizeEditorLayout(prev, viewportHeight);
        if (
          prev.leftPx === next.leftPx &&
          prev.rightPx === next.rightPx &&
          prev.bottomPx === next.bottomPx &&
          prev.sourceSplitPct === next.sourceSplitPct
        ) {
          return prev;
        }
        editorLayoutRef.current = next;
        return next;
      });
    };

    onViewportResize();
    window.addEventListener("resize", onViewportResize);
    return () => window.removeEventListener("resize", onViewportResize);
  }, []);

  useEffect(() => {
    programClipContextRef.current = programClipContext;
  }, [programClipContext]);

  const getProgramVideoBySlot = (slot: ProgramSlot) =>
    slot === "a" ? programVideoARef.current : programVideoBRef.current;

  const getInactiveProgramSlot = (slot: ProgramSlot): ProgramSlot => (slot === "a" ? "b" : "a");
  const getAuxiliaryLayerVideo = (index: number): HTMLVideoElement => {
    const existing = auxiliaryLayerVideosRef.current[index];
    if (existing) return existing;
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    auxiliaryLayerVideosRef.current[index] = video;
    return video;
  };

  const prepareAuxiliaryVideoLayer = (video: HTMLVideoElement, context: ProgramClipContext): boolean => {
    if (context.assetKind !== "video") return false;
    const targetSeconds = Math.max(0, context.localMs) / 1000;
    const needsSourceSwitch = video.dataset.assetUrl !== context.assetUrl || video.dataset.clipId !== context.clipId;
    if (needsSourceSwitch) {
      video.dataset.assetUrl = context.assetUrl;
      video.dataset.clipId = context.clipId;
      video.src = context.assetUrl;
      video.load();
      return false;
    }
    if (video.readyState < 2) return false;
    if (Math.abs(video.currentTime - targetSeconds) > 0.05) {
      try {
        video.currentTime = targetSeconds;
      } catch {
        return false;
      }
    }
    return video.readyState >= 2;
  };

  const drawProgramComposite = (
    baseSource: CanvasImageSource | null,
    baseContext: ProgramClipContext | null,
    atMs: number,
  ) => {
    const canvas = programCanvasRef.current;
    if (!canvas) return;

    clearPreviewCanvas(canvas);
    const stack = findProgramStackAtMs(projectRef.current, atMs);
    if (stack.length === 0) return;
    const projectWidth = Math.max(1, projectRef.current.meta.width);
    const projectHeight = Math.max(1, projectRef.current.meta.height);

    const drawImageContext = (context: ProgramClipContext) => {
      const cached = imageCacheRef.current.get(context.assetUrl);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        drawVisualLayerOnCanvas(
          canvas,
          cached,
          context.visual,
          projectWidth,
          projectHeight,
          context.sourceWidth,
          context.sourceHeight,
        );
        return;
      }
      if (imageLoadingRef.current.has(context.assetUrl)) return;
      imageLoadingRef.current.add(context.assetUrl);
      const image = new Image();
      image.onload = () => {
        imageLoadingRef.current.delete(context.assetUrl);
        imageCacheRef.current.set(context.assetUrl, image);
        const activeVideo = getProgramVideoBySlot(activeProgramSlotRef.current);
        const currentContext = programClipContextRef.current;
        if (currentContext && currentContext.assetKind === "video" && activeVideo) {
          drawProgramComposite(activeVideo, currentContext, playheadMsRef.current);
        } else {
          drawProgramComposite(null, currentContext, playheadMsRef.current);
        }
      };
      image.onerror = () => {
        imageLoadingRef.current.delete(context.assetUrl);
      };
      image.src = context.assetUrl;
    };

    const primary = baseContext ?? stack.find((item) => item.role === "video") ?? stack[0] ?? null;
    if (!primary) return;
    const primaryKey = primary.clipId;
    let auxVideoIndex = 0;

    for (const layer of stack) {
      if (layer.assetKind === "image") {
        drawImageContext(layer);
        continue;
      }

      if (layer.clipId === primaryKey && baseSource) {
        drawVisualLayerOnCanvas(
          canvas,
          baseSource,
          layer.visual,
          projectWidth,
          projectHeight,
          layer.sourceWidth,
          layer.sourceHeight,
        );
        continue;
      }

      const auxVideo = getAuxiliaryLayerVideo(auxVideoIndex);
      auxVideoIndex += 1;
      const ready = prepareAuxiliaryVideoLayer(auxVideo, layer);
      if (!ready) continue;
      drawVisualLayerOnCanvas(
        canvas,
        auxVideo,
        layer.visual,
        projectWidth,
        projectHeight,
        layer.sourceWidth,
        layer.sourceHeight,
      );
    }
  };

  const primeProgramSlot = async (
    slot: ProgramSlot,
    clipContext: ProgramClipContext,
    localMs: number,
  ): Promise<boolean> => {
    const video = getProgramVideoBySlot(slot);
    if (!video) return false;
    if (clipContext.assetKind !== "video") return false;

    const targetSeconds = Math.max(0, localMs) / 1000;
    const sameClipLoaded =
      programSlotClipIdRef.current[slot] === clipContext.clipId &&
      video.dataset.assetUrl === clipContext.assetUrl;

    if (sameClipLoaded && video.readyState >= 1) {
      try {
        video.currentTime = targetSeconds;
      } catch {
        // ignore seek errors; caller handles fallback
      }
      return true;
    }

    const ready = await new Promise<boolean>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        cleanup();
        settled = true;
        resolve(false);
      }, 1800);

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
      };

      const onLoadedMetadata = () => {
        if (settled) return;
        cleanup();
        settled = true;
        resolve(true);
      };

      const onError = () => {
        if (settled) return;
        cleanup();
        settled = true;
        resolve(false);
      };

      if (!sameClipLoaded) {
        video.dataset.assetUrl = clipContext.assetUrl;
        video.dataset.clipId = clipContext.clipId;
        video.src = clipContext.assetUrl;
        video.load();
      }

      if (video.readyState >= 1) {
        cleanup();
        settled = true;
        resolve(true);
        return;
      }

      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);
    });

    if (!ready) return false;
    try {
      video.currentTime = targetSeconds;
    } catch {
      return false;
    }
    programSlotClipIdRef.current[slot] = clipContext.clipId;
    return true;
  };

  useEffect(() => {
    const videoA = programVideoARef.current;
    const videoB = programVideoBRef.current;
    if (videoA) videoA.muted = programTrackMuted;
    if (videoB) videoB.muted = programTrackMuted;
  }, [programTrackMuted]);

  useEffect(() => {
    const playback = playbackRef.current;
    if (!isPlaying || programAssetKind === "video") {
      if (playback.rafId != null) {
        cancelAnimationFrame(playback.rafId);
        playback.rafId = null;
      }
      playback.lastTs = null;
      return;
    }

    const tick = (ts: number) => {
      if (!isPlaying) return;
      const previousTs = playback.lastTs ?? ts;
      playback.lastTs = ts;
      const deltaMs = Math.min(PLAYBACK_TICK_LIMIT_MS, Math.max(0, ts - previousTs));
      setPlayheadMs((prev) => {
        const loopStart = markInMs ?? 0;
        const loopEnd = markOutMs != null ? Math.min(playbackDurationMs, markOutMs) : playbackDurationMs;
        const next = prev + deltaMs;
        if (loopPlayback && loopEnd > loopStart && next >= loopEnd) {
          return loopStart;
        }
        if (next >= playbackDurationMs) {
          setIsPlaying(false);
          return playbackDurationMs;
        }
        return next;
      });
      playback.rafId = requestAnimationFrame(tick);
    };

    playback.rafId = requestAnimationFrame(tick);
    return () => {
      if (playback.rafId != null) {
        cancelAnimationFrame(playback.rafId);
        playback.rafId = null;
      }
      playback.lastTs = null;
    };
  }, [isPlaying, loopPlayback, markInMs, markOutMs, playbackDurationMs, programAssetKind]);

  useEffect(() => {
    if (!isPlaying || !programClipContext || programClipContext.assetKind !== "video" || !programClipId) return;

    const throttle = previewSeekThrottleRef.current;
    if (throttle.timeoutId != null) {
      window.clearTimeout(throttle.timeoutId);
      throttle.timeoutId = null;
    }

    const loopStartMs = clamp(markInMs ?? 0, 0, playbackDurationMs);
    const loopEndMs = clamp(markOutMs ?? playbackDurationMs, 0, playbackDurationMs);
    const loopEnabled = loopPlayback && loopEndMs > loopStartMs;
    const clipStartMs = programClipStartMs;
    const clipEndMs = programClipEndMs;
    const clipInMs = programClipInMs;

    let cancelled = false;
    let rafId: number | null = null;
    let activeSlot = activeProgramSlotRef.current;
    let activeContext: ProgramClipContext = programClipContext;
    let switching = false;

    const maybePreloadNext = (currentMs: number) => {
      const remainingMs = activeContext.clipEndMs - currentMs;
      if (remainingMs > 400) return;
      const next = findNextProgramClipOnTrack(projectRef.current, activeContext);
      if (!next || next.assetKind !== "video") return;
      const preloadSlot = getInactiveProgramSlot(activeSlot);
      const preloadVideo = getProgramVideoBySlot(preloadSlot);
      if (!preloadVideo) return;
      if (programSlotClipIdRef.current[preloadSlot] === next.clipId && preloadVideo.readyState >= 1) return;
      void primeProgramSlot(preloadSlot, next, next.inMs);
    };

    const switchToNextClip = async (overflowMs: number): Promise<boolean> => {
      const next = findNextProgramClipOnTrack(projectRef.current, activeContext);
      if (!next || next.assetKind !== "video") return false;
      const nextLocalMs = clamp(next.inMs + overflowMs, next.inMs, next.outMs);
      const targetSlot = getInactiveProgramSlot(activeSlot);
      const loaded = await primeProgramSlot(targetSlot, next, nextLocalMs);
      if (!loaded) {
        setLog(`Preview handoff fallback failed for clip ${next.clipId}.`);
        return false;
      }

      const previousVideo = getProgramVideoBySlot(activeSlot);
      if (previousVideo) {
        previousVideo.pause();
      }
      activeSlot = targetSlot;
      activeContext = next;
      programClipContextRef.current = next;
      activeProgramSlotRef.current = targetSlot;

      const nextVideo = getProgramVideoBySlot(targetSlot);
      if (!nextVideo) return false;
      nextVideo.muted = programTrackMuted;
      try {
        await nextVideo.play();
      } catch (error) {
        setLog(`Preview playback error: ${String(error)}`);
        return false;
      }
      return true;
    };

    const drawAndSync = () => {
      if (cancelled) return;
      const activeVideo = getProgramVideoBySlot(activeSlot);
      if (!activeVideo) {
        rafId = requestAnimationFrame(drawAndSync);
        return;
      }
      const localMs = Math.round(activeVideo.currentTime * 1000);
      const currentMs = activeContext.clipStartMs + (localMs - activeContext.inMs);

      if (loopEnabled && currentMs >= loopEndMs) {
        const loopLocalMs = clipInMs + (loopStartMs - clipStartMs);
        activeVideo.currentTime = Math.max(0, loopLocalMs) / 1000;
        setPlayheadMs(loopStartMs);
        rafId = requestAnimationFrame(drawAndSync);
        return;
      }

      if (currentMs >= activeContext.clipEndMs - 1) {
        if (switching) return;
        switching = true;
        const overflowMs = Math.max(0, currentMs - activeContext.clipEndMs);
        void switchToNextClip(overflowMs).then((switched) => {
          switching = false;
          if (!switched) {
            setPlayheadMs(activeContext.clipEndMs);
            setIsPlaying(false);
            return;
          }
          rafId = requestAnimationFrame(drawAndSync);
        });
        return;
      }

      if (!loopEnabled && currentMs >= playbackDurationMs) {
        setPlayheadMs(playbackDurationMs);
        setIsPlaying(false);
        return;
      }

      const clampedMs = clamp(currentMs, 0, playbackDurationMs);
      setPlayheadMs(clampedMs);
      drawProgramComposite(activeVideo, activeContext, clampedMs);
      maybePreloadNext(clampedMs);
      rafId = requestAnimationFrame(drawAndSync);
    };

    const initialPlayheadMs = playheadMs;

    void (async () => {
      try {
        const initialLocalMs = clipInMs + (clamp(initialPlayheadMs, clipStartMs, clipEndMs) - clipStartMs);
        const loaded = await primeProgramSlot(activeSlot, activeContext, initialLocalMs);
        if (!loaded) {
          setLog(`Preview playback error: unable to load clip ${activeContext.clipId}`);
          setIsPlaying(false);
          return;
        }
        const video = getProgramVideoBySlot(activeSlot);
        if (!video) {
          setIsPlaying(false);
          return;
        }
        video.muted = programTrackMuted;
        await video.play();
        rafId = requestAnimationFrame(drawAndSync);
      } catch (error) {
        setLog(`Preview playback error: ${String(error)}`);
        setIsPlaying(false);
      }
    })();

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      const activeVideo = getProgramVideoBySlot(activeSlot);
      if (activeVideo) activeVideo.pause();
    };
  }, [
    isPlaying,
    loopPlayback,
    markInMs,
    markOutMs,
    playbackDurationMs,
    programClipId,
    programClipEndMs,
    programClipInMs,
    programClipStartMs,
    programAssetKind,
    programTrackMuted,
    setLog,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setAltSnapDisabled(true);
      }

      if (event.code === "Space") {
        const target = event.target;
        if (target instanceof HTMLElement) {
          const tag = target.tagName.toLowerCase();
          if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
            return;
          }
        }
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        togglePlayback();
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        stopPlayback();
        return;
      }

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setPreviewMonitorMode("program");
        setIsPlaying(true);
        return;
      }

      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        stepFrame("backward");
        return;
      }

      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        if (previewMonitorMode === "source") {
          setSourceInAtPlayhead();
        } else {
          setMarkInAtPlayhead();
        }
        return;
      }

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (previewMonitorMode === "source") {
          setSourceOutAtPlayhead();
        } else {
          setMarkOutAtPlayhead();
        }
        return;
      }

      if (event.key === "," && previewMonitorMode === "source") {
        event.preventDefault();
        insertFromSourceMonitor("insert");
        return;
      }

      if (event.key === "." && previewMonitorMode === "source") {
        event.preventDefault();
        insertFromSourceMonitor("overwrite");
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        splitSelected();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setPixelsPerSecond((prev) => Math.min(260, prev + 12));
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setPixelsPerSecond((prev) => Math.max(20, prev - 12));
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const step = event.shiftKey ? -200 : -Math.round(1000 / Math.max(1, decoderFps));
        nudgeSelected(step);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const step = event.shiftKey ? 200 : Math.round(1000 / Math.max(1, decoderFps));
        nudgeSelected(step);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setAltSnapDisabled(false);
      }
    };
    const onWindowBlur = () => {
      setAltSnapDisabled(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    decoderFps,
    insertFromSourceMonitor,
    nudgeSelected,
    previewMonitorMode,
    redo,
    removeSelected,
    setMarkInAtPlayhead,
    setMarkOutAtPlayhead,
    setSourceInAtPlayhead,
    setSourceOutAtPlayhead,
    splitSelected,
    stepFrame,
    stopPlayback,
    togglePlayback,
    undo,
  ]);

  useEffect(() => {
    if (mainTrackMagnet && collisionMode === "allow-overlap") {
      setCollisionMode("no-overlap");
    }
  }, [collisionMode, mainTrackMagnet]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPORT_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        jobId?: string;
        preset?: ExportPreset;
        fps?: ExportFps;
      };
      if (parsed.preset === "720p" || parsed.preset === "1080p") {
        setExportPreset(parsed.preset);
      }
      if (parsed.fps === 24 || parsed.fps === 30 || parsed.fps === 60) {
        setExportFps(parsed.fps);
      }
      if (!parsed.jobId) return;
      void refreshExportJob(parsed.jobId)
        .then((job) => {
          if (job.status === "queued" || job.status === "running") {
            beginExportPolling(job.jobId);
            setLog(`Resumed export job: ${job.jobId}`);
          }
        })
        .catch(() => {
          persistExportSession(null);
        });
    } catch {
      // Ignore restore errors.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      clearExportPolling();
    };
  }, []);

  useEffect(() => {
    window.__MAV_DECODE_QA__ = {
      run: runDecodeQA,
      getLastRun: () => lastRunResult,
      getLastMetric: () => qaMetric,
      exportLastMetric: () => exportQARunResult(lastRunResult),
      getState: () => ({
        decoderMode,
        isFmp4Source,
        qaRunning,
        qaProfile,
        qaScenarioCount,
      }),
    };

    return () => {
      delete window.__MAV_DECODE_QA__;
    };
  }, [decoderMode, isFmp4Source, lastRunResult, qaMetric, qaProfile, qaRunning, qaScenarioCount, runDecodeQA]);

  useEffect(() => {
    const worker = new Worker(new URL("./preview/video-decode.worker.ts", import.meta.url), {
      type: "module",
    });
    decodeWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<DecodeWorkerOutMessage>) => {
      const message = event.data;
      if (message.type === "log") {
        appendDecoderLog(message.message);
        return;
      }

      if (message.type === "error") {
        appendDecoderLog(`ERROR: ${message.message}`);
        rejectPendingSeeks(message.message);
        setDecoderMode("fallback");
        return;
      }

      if (message.type === "loaded") {
        appendDecoderLog(
          `Loaded: ${message.width}x${message.height}, keyframes=${message.keyframeCount}, mode=${message.webCodecs}, fragmented=${message.isFragmented}`,
        );
        appendDecoderLog(
          `Config: codec=${message.codec}, coded=${message.codedWidth}x${message.codedHeight}, descriptionLength=${message.descriptionLength}`,
        );
        if (message.timestampAudit) {
          appendDecoderLog(
            `Timestamp audit: issues=${message.timestampAudit.issueCount}, firstSamples=${message.timestampAudit.firstSamples.length}`,
          );
        }

        if (message.isFragmented && message.fmp4Policy === "fallback") {
          setIsFmp4Source(true);
          appendDecoderLog("TELEMETRY:fmp4_preview_path=fallback_htmlvideo");
          setDecoderMode("fallback");
        } else if (message.webCodecs === "supported") {
          setIsFmp4Source(false);
          setDecoderMode("webcodecs");
        } else {
          setIsFmp4Source(false);
          setDecoderMode("fallback");
        }
        setDecoderFps(message.fps);
        setDecoderDurationUs(message.durationUs);
        setSourceDetails({
          codec: message.codec,
          codedWidth: message.codedWidth,
          codedHeight: message.codedHeight,
          descriptionLength: message.descriptionLength,
          timestampAuditIssueCount: message.timestampAudit?.issueCount ?? 0,
        });
        const loadedAssetId = programAssetIdRef.current ?? previewAssetIdRef.current;
        if (loadedAssetId) {
          setProject((prev) => ({
            ...prev,
            assets: prev.assets.map((asset) =>
              asset.id === loadedAssetId
                ? {
                    ...asset,
                    codec: message.codec || asset.codec,
                    width: message.width,
                    height: message.height,
                    durationMs: Math.round(message.durationUs / 1000),
                  }
                : asset,
            ),
          }));
        }

        return;
      }

      if (message.type === "decoderError") {
        decoderErrorsRef.current.push(message);
        appendDecoderLog(
          `DecoderError ${message.name}: ${message.message} req=${message.requestId ?? "n/a"} token=${message.token ?? "n/a"}`,
        );
        if (message.lastChunk) {
          appendDecoderLog(
            `LastChunk idx=${message.lastChunk.sampleIndex} key=${message.lastChunk.isKey} idr=${message.lastChunk.isIdr} ts=${message.lastChunk.timestampUs} dur=${message.lastChunk.durationUs}`,
          );
        }
        return;
      }

      if (message.type === "seekResult") {
        lastSeekResultRef.current = message;
        const pending = pendingSeekRef.current.get(message.requestId);
        if (pending) {
          window.clearTimeout(pending.timeoutId);
          pendingSeekRef.current.delete(message.requestId);
          pending.resolve(message);
        }
        requestReasonRef.current.delete(message.requestId);

        if (message.status === "error") {
          appendDecoderLog(
            `Seek failed req=${message.requestId} target=${message.targetUs}us message=${message.message ?? "n/a"}`,
          );
        }
        if ((message.skippedToIdrSamples ?? 0) > 0) {
          appendDecoderLog(
            `TELEMETRY:seek_skip_to_idr req=${message.requestId} skipped=${message.skippedToIdrSamples}`,
          );
        }
        return;
      }

      if (message.type === "frame") {
        const reason = requestReasonRef.current.get(message.requestId);
        if (reason === "qa") {
          message.frame.close();
          return;
        }

        if (message.requestId < latestHandledRequestIdRef.current) {
          message.frame.close();
          return;
        }

        latestHandledRequestIdRef.current = message.requestId;
        const context = programClipContextRef.current;
        if (context && context.assetKind === "video") {
          drawProgramComposite(message.frame, context, playheadMsRef.current);
        } else {
          const canvas = programCanvasRef.current;
          if (canvas) {
            drawVideoFrameOnCanvas(canvas, message.frame);
          }
        }
        message.frame.close();
      }
    };

    return () => {
      rejectPendingSeeks("Decode worker disposed.");
      const throttle = previewSeekThrottleRef.current;
      if (throttle.timeoutId != null) {
        window.clearTimeout(throttle.timeoutId);
        throttle.timeoutId = null;
      }
      worker.postMessage({ type: "dispose" } satisfies DecodeWorkerInMessage);
      worker.terminate();
      decodeWorkerRef.current = null;
      loadedDecoderAssetIdRef.current = null;
      cleanupPointerListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const assetId = programAssetId;
    if (!assetId) return;
    if (loadedDecoderAssetIdRef.current === assetId) return;

    const worker = decodeWorkerRef.current;
    const file = assetFilesRef.current.get(assetId);
    if (!file) {
      setDecoderMode("fallback");
      return;
    }

    loadedDecoderAssetIdRef.current = assetId;
    setDecoderMode(webCodecsAvailable ? "none" : "fallback");

    if (!worker || !webCodecsAvailable) {
      setDecoderMode("fallback");
      return;
    }

    const activeAssetId = assetId;
    void file.arrayBuffer().then((buffer) => {
      if (loadedDecoderAssetIdRef.current !== activeAssetId) return;
      worker.postMessage(
        {
          type: "load",
          buffer,
          mimeType: file.type || "video/mp4",
          auditSamples: Math.max(0, Math.round(timestampAuditSamples)),
        } satisfies DecodeWorkerInMessage,
        [buffer],
      );
    });
  }, [programAssetId, timestampAuditSamples, webCodecsAvailable]);

  useEffect(() => {
    if (decoderMode !== "webcodecs" || isPlaying) return;
    if (!programAssetId) return;
    if (loadedDecoderAssetIdRef.current !== programAssetId) return;
    queuePreviewSeek(programLocalPlayheadUs);
  }, [decoderMode, isPlaying, programAssetId, programLocalPlayheadUs, programVisualSignature, programStackVisualSignature]);

  useEffect(() => {
    const useFallbackPreview = decoderMode !== "webcodecs";
    if (!useFallbackPreview || isPlaying) return;
    if (!programClipContext) {
      const canvas = programCanvasRef.current;
      if (canvas) clearPreviewCanvas(canvas);
      return;
    }
    if (programClipContext.assetKind === "image") {
      drawProgramComposite(null, programClipContext, playheadMs);
      return;
    }

    const activeSlot = activeProgramSlotRef.current;
    const video = getProgramVideoBySlot(activeSlot);
    if (!video) return;
    const targetLocalMs = fromUs(programLocalPlayheadUs);

    void primeProgramSlot(activeSlot, programClipContext, targetLocalMs).then((loaded) => {
      if (!loaded) return;

      const draw = () => drawProgramComposite(video, programClipContext, playheadMs);
      const hasRvfc =
        typeof (video as HTMLVideoElement & { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback ===
        "function";

      if (hasRvfc) {
        const onSeeked = () => {
          (video as HTMLVideoElement & {
            requestVideoFrameCallback: (
              callback: (now: number, metadata: VideoFrameCallbackMetadata) => void,
            ) => number;
          }).requestVideoFrameCallback(() => draw());
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.currentTime = Math.max(0, targetLocalMs / 1000);
      } else {
        const onSeeked = () => draw();
        video.addEventListener("seeked", onSeeked, { once: true });
        video.currentTime = Math.max(0, targetLocalMs / 1000);
      }
    });

    const next = findNextProgramClipOnTrack(project, programClipContext);
    if (next && next.assetKind === "video") {
      const preloadSlot = getInactiveProgramSlot(activeSlot);
      void primeProgramSlot(preloadSlot, next, next.inMs);
    }
  }, [decoderMode, isPlaying, playheadMs, programClipContext, programLocalPlayheadUs, project]);

  useEffect(() => {
    if (!sourceVideoUrl || sourceIsPlaying) return;
    const video = sourceVideoRef.current;
    const canvas = sourceCanvasRef.current;
    if (!video || !canvas) return;

    const targetSeconds = clamp(sourcePlayheadMs, 0, sourceMonitorDurationMs) / 1000;
    const draw = () => drawVideoFrameOnCanvas(canvas, video);

    const hasRvfc =
      typeof (video as HTMLVideoElement & { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback ===
      "function";

    if (hasRvfc) {
      const onSeeked = () => {
        (video as HTMLVideoElement & {
          requestVideoFrameCallback: (
            callback: (now: number, metadata: VideoFrameCallbackMetadata) => void,
          ) => number;
        }).requestVideoFrameCallback(() => draw());
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = Math.max(0, targetSeconds);
    } else {
      const onSeeked = () => draw();
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = Math.max(0, targetSeconds);
    }
  }, [sourceIsPlaying, sourceMonitorDurationMs, sourcePlayheadMs, sourceVideoUrl]);

  useEffect(() => {
    if (!sourceIsPlaying || !sourceVideoUrl) return;
    const video = sourceVideoRef.current;
    const canvas = sourceCanvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    let rafId: number | null = null;
    let rvfcId: number | null = null;

    const hasRvfc =
      typeof (video as HTMLVideoElement & { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback ===
      "function";

    const drawAndSync = (mediaTimeSeconds?: number) => {
      if (cancelled) return;
      const currentMs = Math.round((mediaTimeSeconds ?? video.currentTime) * 1000);
      if (currentMs >= sourceMonitorDurationMs) {
        setSourcePlayheadMs(sourceMonitorDurationMs);
        setSourceIsPlaying(false);
        return;
      }
      setSourcePlayheadMs(clamp(currentMs, 0, sourceMonitorDurationMs));
      drawVideoFrameOnCanvas(canvas, video);
    };

    const scheduleFrame = () => {
      if (cancelled) return;
      if (hasRvfc) {
        rvfcId = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (
              callback: (now: number, metadata: VideoFrameCallbackMetadata) => void,
            ) => number;
          }
        ).requestVideoFrameCallback((_now, metadata) => {
          drawAndSync(metadata.mediaTime);
          scheduleFrame();
        });
        return;
      }
      rafId = requestAnimationFrame(() => {
        drawAndSync();
        scheduleFrame();
      });
    };

    const initialSourcePlayheadMs = sourcePlayheadMs;
    void (async () => {
      try {
        video.currentTime = clamp(initialSourcePlayheadMs, 0, sourceMonitorDurationMs) / 1000;
        await video.play();
        scheduleFrame();
      } catch (error) {
        setLog(`Source playback error: ${String(error)}`);
        setSourceIsPlaying(false);
      }
    })();

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (hasRvfc && rvfcId != null) {
        (
          video as HTMLVideoElement & {
            cancelVideoFrameCallback: (id: number) => void;
          }
        ).cancelVideoFrameCallback(rvfcId);
      }
      video.pause();
    };
  }, [setLog, sourceIsPlaying, sourceMonitorDurationMs, sourceVideoUrl]);

  const loadAssetForPreview = async (assetId: string, file: File, url: string) => {
    setSourceVideoUrl(url);
    setPreviewAssetId(assetId);
    previewAssetIdRef.current = assetId;
    setActiveAssetId(assetId);
    setDecoderMode(webCodecsAvailable ? "none" : "fallback");
    setIsFmp4Source(false);
    setDecoderLogs([]);
    setQaMetric(null);
    setLastRunResult(null);
    setSourceDetails({
      codec: null,
      codedWidth: null,
      codedHeight: null,
      descriptionLength: null,
      timestampAuditIssueCount: null,
    });
    decoderErrorsRef.current = [];
    lastSeekResultRef.current = null;
    latestHandledRequestIdRef.current = 0;
    setSourceIsPlaying(false);
    const rememberedPlayhead = sourceRangesByAsset[assetId]?.lastPlayheadMs ?? 0;
    setSourcePlayheadMs(Math.max(0, Math.round(rememberedPlayhead)));
    setSourceDurationMs(0);

    const worker = decodeWorkerRef.current;
    if (worker && webCodecsAvailable) {
      loadedDecoderAssetIdRef.current = assetId;
      const buffer = await file.arrayBuffer();
      worker.postMessage(
        {
          type: "load",
          buffer,
          mimeType: file.type || "video/mp4",
          auditSamples: Math.max(0, Math.round(timestampAuditSamples)),
        } satisfies DecodeWorkerInMessage,
        [buffer],
      );
    } else {
      setDecoderMode("fallback");
    }
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) return;
    const assetId = `asset-${crypto.randomUUID().slice(0, 8)}`;
    const url = URL.createObjectURL(file);
    const isImage = file.type.startsWith("image/");
    const kind: Asset["kind"] = isImage ? "image" : "video";

    if (!isImage) {
      assetFilesRef.current.set(assetId, file);
    }
    setProjectWithNormalize((prev) => ({
      ...prev,
      assets: [
        ...prev.assets,
        {
          id: assetId,
          kind,
          url,
          name: file.name,
          durationMs: isImage ? 3000 : 0,
          heroThumbnail: isImage ? url : undefined,
          thumbnails: isImage ? [url] : undefined,
          hasAudio: isImage ? false : undefined,
        },
      ],
    }));

    if (!isImage) {
      requestAssetAnalysis(assetId, file, 0);
    }
    setAiJobStatus("idle");
    setAiSummary(null);
    setAiLastOutput(null);

    if (isImage) {
      setActiveAssetId(assetId);
      setLog(`Loaded image asset: ${file.name}`);
      return;
    }

    await loadAssetForPreview(assetId, file, url);
    setLog(`Loaded media asset: ${file.name}`);
  };

  const onActivateAsset = async (assetId: string): Promise<boolean> => {
    const file = assetFilesRef.current.get(assetId);
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset) {
      setLog("Cannot open asset for preview (missing local file).");
      return false;
    }
    if (asset.kind === "image") {
      setActiveAssetId(assetId);
      setLog(`Selected image asset: ${asset.name ?? asset.id}`);
      return false;
    }
    if (!file || asset.kind !== "video") {
      setLog("Cannot open asset for preview (missing local file).");
      return false;
    }
    await loadAssetForPreview(assetId, file, asset.url);
    setLog(`Opened asset in preview: ${asset.name ?? asset.id}`);
    return true;
  };

  function updateSourceRangeForAsset(
    assetId: string,
    updater: (prev: SourceRangeState) => SourceRangeState,
    durationMs: number,
  ) {
    setSourceRangesByAsset((prev) => {
      const current = prev[assetId] ?? { inMs: null, outMs: null, lastPlayheadMs: 0 };
      const nextRaw = updater(current);
      const points = normalizeSourceRangePoints(nextRaw.inMs, nextRaw.outMs, durationMs);
      return {
        ...prev,
        [assetId]: {
          inMs: points.inMs,
          outMs: points.outMs,
          lastPlayheadMs: Math.max(0, Math.round(nextRaw.lastPlayheadMs)),
        },
      };
    });
  }

  function setSourceInAtPlayhead() {
    if (!activeAssetId) {
      setLog("Open a source clip before setting In.");
      return;
    }
    const asset = project.assets.find((item) => item.id === activeAssetId);
    if (!asset || asset.kind !== "video") {
      setLog("Source In/Out is available for video assets only.");
      return;
    }
    const markerMs = clamp(Math.round(sourcePlayheadMs), 0, sourceMonitorDurationMs);
    updateSourceRangeForAsset(
      asset.id,
      (prev) => ({
        ...prev,
        inMs: markerMs,
        lastPlayheadMs: markerMs,
      }),
      sourceMonitorDurationMs,
    );
    setLog("Source In point updated.");
  }

  function setSourceOutAtPlayhead() {
    if (!activeAssetId) {
      setLog("Open a source clip before setting Out.");
      return;
    }
    const asset = project.assets.find((item) => item.id === activeAssetId);
    if (!asset || asset.kind !== "video") {
      setLog("Source In/Out is available for video assets only.");
      return;
    }
    const markerMs = clamp(Math.round(sourcePlayheadMs), 0, sourceMonitorDurationMs);
    updateSourceRangeForAsset(
      asset.id,
      (prev) => ({
        ...prev,
        outMs: markerMs,
        lastPlayheadMs: markerMs,
      }),
      sourceMonitorDurationMs,
    );
    setLog("Source Out point updated.");
  }

  function clearSourceRange() {
    if (!activeAssetId) return;
    const asset = project.assets.find((item) => item.id === activeAssetId);
    if (!asset || asset.kind !== "video") return;
    updateSourceRangeForAsset(
      asset.id,
      (prev) => ({
        ...prev,
        inMs: null,
        outMs: null,
        lastPlayheadMs: clamp(Math.round(sourcePlayheadMs), 0, sourceMonitorDurationMs),
      }),
      sourceMonitorDurationMs,
    );
    setLog("Source range cleared.");
  }

  function insertSourceRangeToTimeline(options: {
    assetId: string;
    mode: "insert" | "overwrite" | "append";
    targetTrackId?: string;
    targetStartMs?: number;
    inMs?: number | null;
    outMs?: number | null;
  }) {
    const asset = project.assets.find((item) => item.id === options.assetId);
    if (!asset || asset.kind !== "video") {
      setLog("Source insert requires a video asset.");
      return;
    }

    const assetDurationHintMs =
      typeof asset.durationMs === "number" && Number.isFinite(asset.durationMs) && asset.durationMs > 0
        ? Math.round(asset.durationMs)
        : options.assetId === activeAssetId
          ? sourceMonitorDurationMs
          : 1000;
    const sourceState = sourceRangesByAsset[options.assetId];
    const resolvedWindow = resolveSourceWindow(
      {
        inMs: options.inMs ?? sourceState?.inMs ?? null,
        outMs: options.outMs ?? sourceState?.outMs ?? null,
        lastPlayheadMs: sourceState?.lastPlayheadMs ?? 0,
      },
      assetDurationHintMs,
    );
    const sourceInMs = resolvedWindow.inMs;
    const sourceOutMs = resolvedWindow.outMs;
    const rawRangeDurationMs = Math.max(1, sourceOutMs - sourceInMs);
    const minDurationMs =
      sourceInMs + MIN_CLIP_DURATION_MS <= assetDurationHintMs ? MIN_CLIP_DURATION_MS : rawRangeDurationMs;
    const sourceDurationMs = Math.max(rawRangeDurationMs, minDurationMs);
    const hasLinkedAudio = asset.hasAudio !== false;

    setProjectWithNormalize((prev) => {
      let tracks = [...prev.timeline.tracks];
      let visualTrackIndex = -1;
      if (options.targetTrackId) {
        const index = tracks.findIndex((track) => track.id === options.targetTrackId);
        const track = index >= 0 ? tracks[index] : null;
        if (!track || track.kind !== "video" || track.locked) {
          return prev;
        }
        visualTrackIndex = index;
      } else {
        const resolvedVisual = findOrCreateUnlockedTrack(tracks, "video");
        if (!resolvedVisual) return prev;
        tracks = resolvedVisual.tracks;
        visualTrackIndex = resolvedVisual.trackIndex;
      }

      let visualTrack = { ...tracks[visualTrackIndex], clips: [...tracks[visualTrackIndex].clips] };
      let insertAtMs = 0;
      if (options.mode === "append") {
        insertAtMs = visualTrack.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
      } else if (typeof options.targetStartMs === "number" && Number.isFinite(options.targetStartMs)) {
        insertAtMs = Math.max(0, Math.round(options.targetStartMs));
      } else {
        insertAtMs = Math.max(0, Math.round(playheadMsRef.current));
      }

      if (options.mode === "insert") {
        visualTrack = applyInsertGap(visualTrack, insertAtMs, sourceDurationMs);
      } else if (options.mode === "overwrite") {
        visualTrack = applyOverwriteWindow(visualTrack, insertAtMs, insertAtMs + sourceDurationMs);
      }

      const linkGroupId = hasLinkedAudio ? `link-${crypto.randomUUID().slice(0, 8)}` : undefined;
      const visualClipId = `clip-${crypto.randomUUID().slice(0, 8)}`;
      const visualClip: Clip = {
        id: visualClipId,
        label: asset.name ?? "video",
        assetId: asset.id,
        startMs: insertAtMs,
        durationMs: sourceDurationMs,
        inMs: sourceInMs,
        outMs: sourceInMs + sourceDurationMs,
        mediaRole: "video",
        linkGroupId,
        linkLocked: Boolean(linkGroupId),
        visual: defaultClipVisual(),
      };
      visualTrack.clips.push(visualClip);
      tracks[visualTrackIndex] = { ...visualTrack, clips: sortClips(visualTrack.clips) };

      if (hasLinkedAudio) {
        const resolvedAudio = findOrCreateUnlockedTrack(tracks, "audio");
        if (!resolvedAudio) return prev;
        tracks = resolvedAudio.tracks;
        let audioTrack = {
          ...tracks[resolvedAudio.trackIndex],
          clips: [...tracks[resolvedAudio.trackIndex].clips],
        };
        if (options.mode === "insert") {
          audioTrack = applyInsertGap(audioTrack, insertAtMs, sourceDurationMs);
        } else if (options.mode === "overwrite") {
          audioTrack = applyOverwriteWindow(audioTrack, insertAtMs, insertAtMs + sourceDurationMs);
        }
        const audioClip: Clip = {
          id: `clip-${crypto.randomUUID().slice(0, 8)}`,
          label: `${asset.name ?? "video"} audio`,
          assetId: asset.id,
          startMs: insertAtMs,
          durationMs: sourceDurationMs,
          inMs: sourceInMs,
          outMs: sourceInMs + sourceDurationMs,
          mediaRole: "audio",
          linkGroupId,
          linkLocked: true,
          visual: undefined,
        };
        audioTrack.clips.push(audioClip);
        tracks[resolvedAudio.trackIndex] = { ...audioTrack, clips: sortClips(audioTrack.clips) };
      }

      const timelineDuration = Math.max(prev.timeline.durationMs, insertAtMs + sourceDurationMs + 1000);
      setSelection({ trackId: tracks[visualTrackIndex].id, clipId: visualClipId });
      setSelectedClipKeys([clipKey(tracks[visualTrackIndex].id, visualClipId)]);
      setPlayheadMs(insertAtMs);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          durationMs: timelineDuration,
          tracks,
        },
      };
    });

    updateSourceRangeForAsset(
      asset.id,
      (prev) => ({
        ...prev,
        inMs: resolvedWindow.points.inMs,
        outMs: resolvedWindow.points.outMs,
        lastPlayheadMs: clamp(Math.round(sourcePlayheadMs), 0, sourceMonitorDurationMs),
      }),
      sourceMonitorDurationMs,
    );

    if (options.mode === "overwrite") {
      setLog(`Overwrite from Source: ${asset.name ?? asset.id}`);
    } else if (options.mode === "append") {
      setLog(`Append from Source: ${asset.name ?? asset.id}`);
    } else {
      setLog(`Insert from Source: ${asset.name ?? asset.id}`);
    }
    setExportValidationMessage(null);
  }

  const addAssetToTimeline = (assetId: string, preferredTrackId?: string, preferredStartMs?: number) => {
    const asset = project.assets.find((item) => item.id === assetId && (item.kind === "video" || item.kind === "image"));
    if (!asset) {
      setLog("Asset not found.");
      return;
    }
    if (preferredTrackId && isTrackLocked(project, preferredTrackId)) {
      setLog("Track is locked.");
      return;
    }
    if (preferredTrackId) {
      const preferredTrack = project.timeline.tracks.find((track) => track.id === preferredTrackId);
      if (preferredTrack && preferredTrack.kind !== "video") {
        setLog("Drop rejected: visual assets can only be dropped on video tracks.");
        return;
      }
    }

    setProjectWithNormalize((prev) => {
      let tracks = [...prev.timeline.tracks];
      let visualTrackIndex = -1;
      if (preferredTrackId != null) {
        const preferredIndex = tracks.findIndex((track) => track.id === preferredTrackId);
        const preferredTrack = preferredIndex >= 0 ? tracks[preferredIndex] : null;
        if (!preferredTrack || preferredTrack.kind !== "video") return prev;
        if (preferredTrack?.locked) {
          return prev;
        }
        visualTrackIndex = preferredIndex;
      }

      if (visualTrackIndex === -1) {
        const resolved = findOrCreateUnlockedTrack(tracks, "video");
        if (!resolved) return prev;
        tracks = resolved.tracks;
        visualTrackIndex = resolved.trackIndex;
      }

      const visualTrack = { ...tracks[visualTrackIndex], clips: [...tracks[visualTrackIndex].clips] };
      const nextStartMs =
        typeof preferredStartMs === "number" && Number.isFinite(preferredStartMs)
          ? Math.max(0, Math.round(preferredStartMs))
          : visualTrack.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
      const durationMs = Math.max(
        MIN_CLIP_DURATION_MS,
        Math.round((asset.durationMs ?? (asset.kind === "image" ? 3000 : videoDurationMs ?? 3000))),
      );
      const clipId = `clip-${crypto.randomUUID().slice(0, 8)}`;
      const shouldCreateLinkedAudio = asset.kind === "video" && asset.hasAudio !== false;
      const linkGroupId = shouldCreateLinkedAudio ? `link-${crypto.randomUUID().slice(0, 8)}` : undefined;
      const clip: Clip = {
        id: clipId,
        label: asset.name ?? (asset.kind === "image" ? "image" : "video"),
        assetId: asset.id,
        startMs: nextStartMs,
        durationMs,
        inMs: 0,
        outMs: durationMs,
        mediaRole: "video",
        linkGroupId,
        linkLocked: Boolean(linkGroupId),
        visual: defaultClipVisual(),
      };

      visualTrack.clips.push(clip);
      tracks[visualTrackIndex] = visualTrack;

      if (shouldCreateLinkedAudio) {
        const resolvedAudio = findOrCreateUnlockedTrack(tracks, "audio");
        if (resolvedAudio) {
          tracks = resolvedAudio.tracks;
          const audioTrack = {
            ...tracks[resolvedAudio.trackIndex],
            clips: [...tracks[resolvedAudio.trackIndex].clips],
          };
          const audioClipId = `clip-${crypto.randomUUID().slice(0, 8)}`;
          const audioClip: Clip = {
            id: audioClipId,
            label: `${asset.name ?? "video"} audio`,
            assetId: asset.id,
            startMs: nextStartMs,
            durationMs,
            inMs: 0,
            outMs: durationMs,
            mediaRole: "audio",
            linkGroupId,
            linkLocked: true,
            visual: undefined,
          };
          audioTrack.clips.push(audioClip);
          tracks[resolvedAudio.trackIndex] = audioTrack;
        }
      }

      const timelineDuration = Math.max(
        prev.timeline.durationMs,
        clip.startMs + clip.durationMs + 1000,
      );

      setSelection({ trackId: visualTrack.id, clipId: clipId });
      setSelectedClipKeys([clipKey(visualTrack.id, clipId)]);
      setPlayheadMs(clip.startMs);
      return { ...prev, timeline: { ...prev.timeline, durationMs: timelineDuration, tracks } };
    });

    setLog(
      asset.hasAudio !== false
        ? `Added ${asset.name ?? assetId} to timeline (linked video/audio).`
        : `Added ${asset.name ?? assetId} to timeline.`,
    );
    setExportValidationMessage(null);
  };

  const onProgramMetadataLoaded = (durationMs: number, width: number, height: number) => {
    setVideoDurationMs(durationMs);
    const targetAssetId = programAssetIdRef.current;
    if (!targetAssetId) return;
    setProjectWithNormalize((prev) => ({
      ...prev,
      assets: prev.assets.map((asset) =>
        asset.id === targetAssetId
          ? {
              ...asset,
              durationMs,
              width: width > 0 ? width : asset.width,
              height: height > 0 ? height : asset.height,
            }
          : asset,
      ),
    }), { recordHistory: false });

    const file = assetFilesRef.current.get(targetAssetId);
    if (!file) return;
    requestAssetAnalysis(targetAssetId, file, durationMs);
  };

  const onSourceMetadataLoaded = (durationMs: number) => {
    if (Number.isFinite(durationMs) && durationMs > 0) {
      const rounded = Math.round(durationMs);
      setSourceDurationMs(rounded);
      if (sourcePlayheadMs > rounded) {
        setSourcePlayheadMs(rounded);
      }
      if (devMode) {
        console.debug(`[MAV] Source metadata loaded: ${rounded}ms`);
      }
      return;
    }

    const fallbackAsset = activeAssetId
      ? project.assets.find((asset) => asset.id === activeAssetId && asset.kind === "video")
      : null;
    const fallbackDuration =
      typeof fallbackAsset?.durationMs === "number" && Number.isFinite(fallbackAsset.durationMs) && fallbackAsset.durationMs > 0
        ? Math.round(fallbackAsset.durationMs)
        : 1000;
    setSourceDurationMs(fallbackDuration);
    setSourcePlayheadMs((prev) => clamp(prev, 0, fallbackDuration));
    if (devMode) {
      console.debug(`[MAV] Source duration fallback used: ${fallbackDuration}ms`);
    }
  };

  function insertFromSourceMonitor(mode: "insert" | "overwrite" | "append") {
    if (!activeAssetId) {
      setLog("Open a source clip first.");
      return;
    }
    insertSourceRangeToTimeline({ assetId: activeAssetId, mode });
  }

  function onSourceRangeDragStart(event: ReactDragEvent<HTMLElement>) {
    if (!activeAssetId) {
      event.preventDefault();
      return;
    }
    const asset = project.assets.find((entry) => entry.id === activeAssetId);
    if (!asset || asset.kind !== "video") {
      event.preventDefault();
      return;
    }
    const durationHint =
      typeof asset.durationMs === "number" && Number.isFinite(asset.durationMs) && asset.durationMs > 0
        ? Math.round(asset.durationMs)
        : sourceMonitorDurationMs;
    const windowRange = resolveSourceWindow(sourceRangesByAsset[asset.id], durationHint);
    const payload = {
      assetId: asset.id,
      inMs: windowRange.inMs,
      outMs: windowRange.outMs,
      durationMs: windowRange.durationMs,
      hasAudio: asset.hasAudio !== false,
    };
    const dragBadge = document.createElement("div");
    dragBadge.textContent = "Clip";
    dragBadge.style.position = "fixed";
    dragBadge.style.top = "-1000px";
    dragBadge.style.left = "-1000px";
    dragBadge.style.padding = "6px 10px";
    dragBadge.style.borderRadius = "8px";
    dragBadge.style.background = "#1f4f85";
    dragBadge.style.border = "1px solid #4cb0ff";
    dragBadge.style.color = "#eaf4ff";
    dragBadge.style.font = "600 12px/1 system-ui";
    dragBadge.style.pointerEvents = "none";
    document.body.appendChild(dragBadge);
    event.dataTransfer.setDragImage(dragBadge, 16, 12);
    window.setTimeout(() => {
      dragBadge.remove();
    }, 0);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/x-mav-source-range", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", asset.id);
    setLog("Drag source range to a video track.");
  }

  const zoomWidthPx = Math.max(
    960,
    (playbackDurationMs / 1000) * pixelsPerSecond + 120,
  );

  const setPlayheadClamped = (value: number) => {
    setPlayheadMs(clamp(Math.round(value), 0, playbackDurationMs));
  };

  const setSelectionFromKeys = (keys: string[], primary?: { trackId: string; clipId: string } | null) => {
    const sanitized = keys.filter((key) => {
      const [trackId, clipId] = key.split(":");
      return clipExists(trackId, clipId);
    });
    setSelectedClipKeys(sanitized);
    if (primary) {
      setSelection(primary);
      return;
    }
    const fallback = sanitized[0];
    if (!fallback) {
      setSelection(null);
      return;
    }
    const [trackId, clipId] = fallback.split(":");
    setSelection({ trackId, clipId });
  };

  const timelineStatus = `Ready | Selected: ${selectedClipCount} | Ripple: ${rippleMode}`;
  const diagnosticsEnabled = devMode && diagnosticsVisible;
  const exportCanStart = canStartExport();
  const aiSuggestionCount = aiLastOutput?.suggestions.length ?? 0;
  const canApplyAiResult = aiJobStatus === "completed" && (aiLastOutput?.clipPatches.length ?? 0) > 0;
  const timelineAssetMap = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const projectSettingsValue = useMemo(
    () => ({
      width: project.meta.width,
      height: project.meta.height,
      fps: project.meta.fps,
      durationMs: project.timeline.durationMs,
      snapEnabled,
      snapMs,
      collisionMode,
      rippleMode,
      magnetEnabled: mainTrackMagnet,
      zoomPps: pixelsPerSecond,
    }),
    [
      project.meta.width,
      project.meta.height,
      project.meta.fps,
      project.timeline.durationMs,
      snapEnabled,
      snapMs,
      collisionMode,
      rippleMode,
      mainTrackMagnet,
      pixelsPerSecond,
    ],
  );

  const applyProjectSettings = (next: {
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    snapEnabled: boolean;
    snapMs: number;
    collisionMode: CollisionMode;
    rippleMode: RippleMode;
    magnetEnabled: boolean;
    zoomPps: number;
  }) => {
    let appliedDurationMs = next.durationMs;
    setProjectWithNormalize((prev) => {
      const maxClipEndMs = prev.timeline.tracks.reduce(
        (maxTrack, track) =>
          Math.max(
            maxTrack,
            track.clips.reduce((maxClip, clip) => Math.max(maxClip, clip.startMs + clip.durationMs), 0),
          ),
        0,
      );
      appliedDurationMs = Math.max(1000, next.durationMs, maxClipEndMs);
      return {
        ...prev,
        meta: {
          ...prev.meta,
          width: Math.max(16, next.width),
          height: Math.max(16, next.height),
          fps: Math.max(1, next.fps),
        },
        timeline: {
          ...prev.timeline,
          durationMs: appliedDurationMs,
        },
      };
    });

    setSnapEnabled(next.snapEnabled);
    setSnapMs(Math.max(1, next.snapMs));
    setMainTrackMagnet(next.magnetEnabled);
    setCollisionMode(next.magnetEnabled && next.collisionMode === "allow-overlap" ? "no-overlap" : next.collisionMode);
    setRippleMode(next.rippleMode);
    setPixelsPerSecond(Math.max(20, Math.min(260, next.zoomPps)));
    setPlayheadMs((prev) => clamp(prev, 0, appliedDurationMs));
    setSourcePlayheadMs((prev) => clamp(prev, 0, sourceMonitorDurationMs));
    setLog("Project settings updated.");
  };

  return (
    <>
      <EditorShell
        layout={editorLayout}
        onResizeLayout={resizeEditorLayout}
        onResizeLayoutCommit={commitEditorLayout}
        isDesktopResizable={isDesktopResizable}
        toolbar={(
          <TopToolbar
            projectName={project.meta.projectId}
            onProjectNameChange={setProjectName}
            onOpenProjectSettings={() => setProjectSettingsOpen(true)}
            onUndo={undo}
            onRedo={redo}
            onExport={() => {
              setExportValidationMessage(exportCanStart ? null : "Add at least one video clip to the timeline.");
              setExportOpen(true);
            }}
            onSave={saveProject}
            onLoad={loadProject}
            onResetLayout={resetEditorLayout}
            onOpenAbout={() => setAboutOpen(true)}
            canShowDiagnostics={devMode}
            diagnosticsVisible={diagnosticsVisible}
            onToggleDiagnostics={() => setDiagnosticsVisible((prev) => !prev)}
          />
        )}
        mediaBin={(
          <LibraryPanel
            activeTab={libraryTab}
            onTabChange={setLibraryTab}
            hasVideoAsset={project.assets.some((asset) => asset.kind === "video")}
            aiJobStatus={aiJobStatus}
            aiSummary={aiSummary}
            aiSuggestionCount={aiSuggestionCount}
            canApplyAi={canApplyAiResult}
            onRunSilenceCut={() => {
              void runSilenceCutAiPlugin();
            }}
            onApplyAiResult={applySilenceCutResult}
            mediaContent={(
              <MediaBinPanel
                assets={project.assets}
                activeAssetId={activeAssetId}
                onUpload={(file) => {
                  void onPickVideo(file);
                }}
                onActivateAsset={(assetId) => {
                  void onActivateAsset(assetId);
                }}
                onOpenInSourceMonitor={(assetId) => {
                  void (async () => {
                    const opened = await onActivateAsset(assetId);
                    if (opened) {
                      setPreviewMonitorMode("source");
                    }
                  })();
                }}
                onAddToTimeline={(assetId) => addAssetToTimeline(assetId)}
                onAssetDragStart={(assetId) => {
                  const asset = project.assets.find((item) => item.id === assetId);
                  setLog(`Drag asset to timeline: ${asset?.name ?? assetId}`);
                }}
              />
            )}
          />
        )}
        preview={(
          <PreviewPanel
            programCanvasRef={programCanvasRef}
            programVideoARef={programVideoARef}
            programVideoBRef={programVideoBRef}
            sourceCanvasRef={sourceCanvasRef}
            sourceVideoRef={sourceVideoRef}
            sourceVideoUrl={sourceVideoUrl}
            programMuted={programTrackMuted}
            onProgramLoadedMetadata={onProgramMetadataLoaded}
            onSourceLoadedMetadata={onSourceMetadataLoaded}
            playheadMs={playheadMs}
            durationMs={playbackDurationMs}
            isPlaying={isPlaying}
            onTogglePlay={togglePlayback}
            onScrub={setPlayheadClamped}
            onStepFrame={stepFrame}
            loopEnabled={loopPlayback}
            onLoopToggle={() => setLoopPlayback((prev) => !prev)}
            markInMs={markInMs}
            markOutMs={markOutMs}
            onSetMarkIn={setMarkInAtPlayhead}
            onSetMarkOut={setMarkOutAtPlayhead}
            sourcePlayheadMs={sourcePlayheadMs}
            sourceDurationMs={sourceMonitorDurationMs}
            sourceIsPlaying={sourceIsPlaying}
            monitorMode={previewMonitorMode}
            onMonitorModeChange={setPreviewMonitorMode}
            onSourceTogglePlay={toggleSourcePlayback}
            sourceRangeInMs={resolvedActiveSourceRange.points.inMs}
            sourceRangeOutMs={resolvedActiveSourceRange.points.outMs}
            onSetSourceIn={setSourceInAtPlayhead}
            onSetSourceOut={setSourceOutAtPlayhead}
            onClearSourceRange={clearSourceRange}
            onInsertFromSource={() => insertFromSourceMonitor("insert")}
            onOverwriteFromSource={() => insertFromSourceMonitor("overwrite")}
            onAppendFromSource={() => insertFromSourceMonitor("append")}
            onSourceRangeDragStart={onSourceRangeDragStart}
            onSourceScrub={(value) => {
              setSourceIsPlaying(false);
              setSourcePlayheadMs(clamp(Math.round(value), 0, sourceMonitorDurationMs));
            }}
            onSourceStepFrame={stepSourceFrame}
          />
        )}
        inspector={(
          <InspectorPanel
            selectedClip={selectedClip}
            selectedClipRole={selectedClipRole}
            selectedCount={selectedClipCount}
            onUpdateTiming={updateSelectedTiming}
            onUpdateVisual={updateSelectedVisual}
            onResetVisual={resetSelectedVisual}
            onAdaptToFrame={adaptSelectedVisualToFrame}
          />
        )}
        timeline={(
          <TimelinePanel
            tracks={project.timeline.tracks}
            playheadMs={playheadMs}
            onPlayheadChange={setPlayheadClamped}
            pixelsPerSecond={pixelsPerSecond}
            onZoomChange={setPixelsPerSecond}
            zoomWidthPx={zoomWidthPx}
            snapGuideMs={snapGuideMs}
            selection={selection}
            selectedClipKeys={selectedClipKeys}
            collisionMode={collisionMode}
            rippleMode={rippleMode}
            snapEnabled={snapEnabled}
            altSnapDisabled={altSnapDisabled}
            snapMs={snapMs}
            toolMode={timelineTool}
            magnetEnabled={mainTrackMagnet}
            showFilmstrip={showFilmstrip}
            statusText={timelineStatus}
            onSnapEnabledChange={setSnapEnabled}
            onSnapMsChange={setSnapMs}
            onCollisionModeChange={(nextMode) => {
              if (mainTrackMagnet && nextMode === "allow-overlap") {
                setCollisionMode("no-overlap");
                return;
              }
              setCollisionMode(nextMode);
            }}
            onRippleModeChange={setRippleMode}
            onToolModeChange={setTimelineTool}
            onMagnetEnabledChange={(enabled) => {
              setMainTrackMagnet(enabled);
              if (enabled && collisionMode === "allow-overlap") {
                setCollisionMode("no-overlap");
              }
            }}
            onShowFilmstripChange={setShowFilmstrip}
            onUndo={undo}
            onRedo={redo}
            onSplit={splitSelected}
            onDelete={removeSelected}
            getClipRenderState={getClipRenderState}
            interactionPreview={interactionPreview}
            onClipPointerDown={onClipPointerDown}
            onAssetDrop={(assetId, trackId, startMs) => {
              addAssetToTimeline(assetId, trackId, startMs);
            }}
            onSourceRangeDrop={(payload, trackId, startMs) => {
              insertSourceRangeToTimeline({
                assetId: payload.assetId,
                mode: "insert",
                targetTrackId: trackId,
                targetStartMs: startMs,
                inMs: payload.inMs,
                outMs: payload.outMs,
              });
            }}
            onAssetDropToNewTrack={(assetId, trackKind, startMs) => {
              addAssetToNewTrack(assetId, trackKind, startMs);
            }}
            onSelectClipKeys={setSelectionFromKeys}
            onClearSelection={() => setSelectionFromKeys([])}
            onSplitClip={(trackId, clipId) => splitClipAt(trackId, clipId, playheadMs)}
            onDeleteClip={deleteClipById}
            onDuplicateClip={duplicateClip}
            onDetachAudio={detachLinkedGroup}
            onRelinkClip={relinkSelectedVideoAudio}
            onAddTrack={addTrack}
            onRemoveTrack={removeTrack}
            onToggleTrackFlag={toggleTrackFlag}
            onDropRejected={setLog}
            assetMap={timelineAssetMap}
          />
        )}
        diagnostics={
          diagnosticsEnabled ? (
            <DiagnosticsPanel
              decoderLogs={decoderLogs}
              timestampAuditSamples={timestampAuditSamples}
              onTimestampAuditSamplesChange={setTimestampAuditSamples}
              qaProfile={qaProfile}
              onQaProfileChange={setQaProfile}
              qaScenarioCount={qaScenarioCount}
              onQaScenarioCountChange={setQaScenarioCount}
              qaRunning={qaRunning}
              canRunQa={decoderMode === "webcodecs"}
              onRunQa={() => {
                void runDecodeQA();
              }}
              onExportLastResult={() => {
                exportQARunResult(lastRunResult);
              }}
              qaMetric={qaMetric}
              qaHistory={qaHistory}
              lastRunResult={lastRunResult}
              projectSchemaSummary={{ id: projectSchema.$id, title: projectSchema.title }}
              projectJson={normalizeProject(project)}
            />
          ) : undefined
        }
        status={log}
      />

      <ExportModal
        open={exportOpen}
        busy={exportBusy}
        job={exportJob}
        history={exportHistory}
        canStart={exportCanStart}
        validationMessage={exportValidationMessage}
        preset={exportPreset}
        fps={exportFps}
        onPresetChange={setExportPreset}
        onFpsChange={setExportFps}
        onClose={() => setExportOpen(false)}
        onStart={() => {
          void createExportJob();
        }}
        onCancel={() => {
          void cancelExportJob();
        }}
        onRetry={() => {
          void retryExportJob();
        }}
        onDownload={downloadExport}
        previewOnlyVisualWarning={hasPreviewOnlyVisualAdjustments}
      />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ProjectSettingsModal
        open={projectSettingsOpen}
        value={projectSettingsValue}
        onClose={() => setProjectSettingsOpen(false)}
        onApply={applyProjectSettings}
      />
    </>
  );
}
