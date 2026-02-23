import { useEffect, useMemo, useRef, useState } from "react";
import projectSchema from "../contracts/project.schema.v0.json";
import type {
  DecodeWorkerInMessage,
  DecodeWorkerOutMessage,
} from "./preview/protocol";

type TrackKind = "video" | "overlay" | "audio";

type OverlayTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

type Clip = {
  id: string;
  label: string;
  assetId: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  transform?: OverlayTransform;
};

type Track = {
  id: string;
  kind: TrackKind;
  clips: Clip[];
};

type ProjectState = {
  schemaVersion: "mav.project.v0";
  meta: {
    projectId: string;
    createdAt: string;
    updatedAt: string;
    fps: number;
    width: number;
    height: number;
  };
  assets: Array<{ id: string; kind: "video" | "audio" | "image"; url: string; durationMs?: number }>;
  timeline: {
    durationMs: number;
    tracks: Track[];
  };
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
  startClientX: number;
  latestClientX: number;
  original: Clip;
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
};

type CollisionMode = "no-overlap" | "push" | "allow-overlap";

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

declare global {
  interface Window {
    __MAV_DECODE_QA__?: DecodeQaApi;
  }
}

const STORAGE_KEY = "mav.poc.editor.state.v2";
const MIN_CLIP_DURATION_MS = 100;
const DEFAULT_QA_SCENARIOS = 50;

function toUs(ms: number): number {
  return Math.round(ms * 1000);
}

function fromUs(us: number): number {
  return us / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function quantize(value: number, step: number): number {
  if (step <= 1) return value;
  return Math.round(value / step) * step;
}

function createInitialProject(): ProjectState {
  const now = new Date().toISOString();
  return {
    schemaVersion: "mav.project.v0",
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
          id: "video-1",
          kind: "video",
          clips: [
            {
              id: "clip-1",
              label: "shot-01",
              assetId: "asset-video-1",
              startMs: 0,
              durationMs: 5000,
              inMs: 0,
              outMs: 5000,
            },
          ],
        },
        {
          id: "overlay-1",
          kind: "overlay",
          clips: [
            {
              id: "overlay-title",
              label: "title",
              assetId: "asset-overlay-title",
              startMs: 600,
              durationMs: 1800,
              inMs: 0,
              outMs: 1800,
              transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            },
          ],
        },
        {
          id: "audio-1",
          kind: "audio",
          clips: [
            {
              id: "music-1",
              label: "music",
              assetId: "asset-audio-1",
              startMs: 0,
              durationMs: 5000,
              inMs: 0,
              outMs: 5000,
            },
          ],
        },
      ],
    },
  };
}

function normalizeProject(project: ProjectState): ProjectState {
  const tracks = [...project.timeline.tracks]
    .map((track) => ({
      ...track,
      clips: [...track.clips]
        .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
        .map((clip) => ({
          ...clip,
          startMs: Math.round(clip.startMs),
          durationMs: Math.round(clip.durationMs),
          inMs: Math.round(clip.inMs),
          outMs: Math.round(clip.outMs),
        })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const durationMs = Math.max(
    1000,
    ...tracks.flatMap((track) =>
      track.clips.map((clip) => clip.startMs + clip.durationMs),
    ),
  );

  return {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: new Date().toISOString(),
    },
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
  const [selection, setSelection] = useState<Selection | null>({ trackId: "video-1", clipId: "clip-1" });
  const [pixelsPerSecond, setPixelsPerSecond] = useState(80);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapMs, setSnapMs] = useState(100);
  const [collisionMode, setCollisionMode] = useState<CollisionMode>("no-overlap");
  const [log, setLog] = useState("Ready.");

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDurationMs, setVideoDurationMs] = useState<number>(0);
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

  const dragRef = useRef<DragState | null>(null);
  const dragRafRef = useRef<number | null>(null);

  const decodeWorkerRef = useRef<Worker | null>(null);
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

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  const webCodecsAvailable = useMemo(
    () => typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined",
    [],
  );

  const playheadUs = useMemo(() => toUs(playheadMs), [playheadMs]);

  const selectedClip = useMemo(() => {
    const pos = findClip(project, selection);
    if (!pos) return null;
    return project.timeline.tracks[pos.trackIndex].clips[pos.clipIndex];
  }, [project, selection]);

  const setProjectWithNormalize = (updater: (prev: ProjectState) => ProjectState) => {
    setProject((prev) => normalizeProject(updater(prev)));
  };

  const getClipRenderState = (trackId: string, clip: Clip): Clip => {
    if (interactionPreview && interactionPreview.trackId === trackId && interactionPreview.clipId === clip.id) {
      return {
        ...clip,
        startMs: interactionPreview.startMs,
        durationMs: interactionPreview.durationMs,
        inMs: interactionPreview.inMs,
        outMs: interactionPreview.outMs,
      };
    }
    return clip;
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
      if (snapEnabled) {
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

      if (snapEnabled) {
        candidateStart = quantize(candidateStart, snapMs);
      }

      startMs = Math.max(0, candidateStart);
    }

    if (drag.mode === "resize-start") {
      const maxStart = original.startMs + original.durationMs - minDuration;
      let candidateStart = clamp(original.startMs + deltaMs, 0, maxStart);
      if (snapEnabled) {
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
      if (snapEnabled) {
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

    const track = project.timeline.tracks.find((item) => item.id === drag.trackId);
    if (track) {
      const constrainedTrack = applyCollisionPolicy(
        track,
        drag.clipId,
        {
          ...original,
          startMs,
          durationMs,
          inMs,
          outMs,
        },
        collisionMode,
      );

      const constrained = constrainedTrack.clips.find((clip) => clip.id === drag.clipId);
      if (constrained) {
        startMs = constrained.startMs;
        durationMs = constrained.durationMs;
        inMs = constrained.inMs;
        outMs = constrained.outMs;
      }
    }

    setInteractionPreview({
      trackId: drag.trackId,
      clipId: drag.clipId,
      startMs,
      durationMs,
      inMs,
      outMs,
      snapGuideMs: guide,
    });

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

    if (interactionPreview) {
      setProjectWithNormalize((prev) => {
        const pos = findClip(prev, {
          trackId: interactionPreview.trackId,
          clipId: interactionPreview.clipId,
        });
        if (!pos) return prev;

        const tracks = [...prev.timeline.tracks];
        const track = { ...tracks[pos.trackIndex] };
        const clip = track.clips[pos.clipIndex];
        const constrainedTrack = applyCollisionPolicy(
          track,
          clip.id,
          {
            ...clip,
            startMs: interactionPreview.startMs,
            durationMs: interactionPreview.durationMs,
            inMs: interactionPreview.inMs,
            outMs: interactionPreview.outMs,
          },
          collisionMode,
        );

        tracks[pos.trackIndex] = constrainedTrack;
        return { ...prev, timeline: { ...prev.timeline, tracks } };
      });
      setLog(`Committed ${drag.mode} for ${drag.clipId} (${collisionMode}).`);
    }

    dragRef.current = null;
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

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const edge = Math.max(16, Math.min(24, rect.width * 0.2));

    let mode: InteractionMode = "move";
    if (localX <= edge) mode = "resize-start";
    if (localX >= rect.width - edge) mode = "resize-end";

    event.currentTarget.setPointerCapture(event.pointerId);

    const thresholdMs = (8 / pixelsPerSecond) * 1000;
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      trackId,
      clipId: clip.id,
      startClientX: event.clientX,
      latestClientX: event.clientX,
      original: clip,
      snapTargetsMs: collectSnapTargets(project, clip.id, playheadMs),
      thresholdMs,
    };

    setSelection({ trackId, clipId: clip.id });
    setInteractionPreview({
      trackId,
      clipId: clip.id,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      inMs: clip.inMs,
      outMs: clip.outMs,
      snapGuideMs: null,
    });

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
  };

  const updateSelectedClip = (updater: (clip: Clip) => Clip) => {
    if (!selection) return;
    setProjectWithNormalize((prev) => {
      const pos = findClip(prev, selection);
      if (!pos) return prev;
      const tracks = [...prev.timeline.tracks];
      const track = { ...tracks[pos.trackIndex] };
      const clip = track.clips[pos.clipIndex];
      const updated = updater(clip);
      tracks[pos.trackIndex] = applyCollisionPolicy(track, clip.id, updated, collisionMode);
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const moveSelected = (deltaMs: number) => {
    updateSelectedClip((clip) => {
      const raw = clip.startMs + deltaMs;
      const snapped = snapEnabled ? quantize(raw, snapMs) : raw;
      return { ...clip, startMs: Math.max(0, snapped) };
    });
  };

  const trimSelectedStart = (deltaMs: number) => {
    updateSelectedClip((clip) => {
      const maxStart = clip.startMs + clip.durationMs - MIN_CLIP_DURATION_MS;
      const targetStart = clamp(clip.startMs + deltaMs, 0, maxStart);
      const snapped = snapEnabled ? quantize(targetStart, snapMs) : targetStart;
      const finalStart = clamp(snapped, 0, maxStart);
      const shifted = finalStart - clip.startMs;
      const durationMs = clip.durationMs - shifted;
      return {
        ...clip,
        startMs: finalStart,
        durationMs,
        inMs: clip.inMs + shifted,
      };
    });
  };

  const trimSelectedEnd = (deltaMs: number) => {
    updateSelectedClip((clip) => {
      const rawDuration = clip.durationMs + deltaMs;
      const snapped = snapEnabled ? quantize(rawDuration, snapMs) : rawDuration;
      const durationMs = Math.max(MIN_CLIP_DURATION_MS, snapped);
      return {
        ...clip,
        durationMs,
        outMs: clip.inMs + durationMs,
      };
    });
  };

  const splitSelected = () => {
    if (!selection) return;
    setProjectWithNormalize((prev) => {
      const pos = findClip(prev, selection);
      if (!pos) return prev;

      const tracks = [...prev.timeline.tracks];
      const track = { ...tracks[pos.trackIndex] };
      const clips = [...track.clips];
      const clip = clips[pos.clipIndex];

      const splitAt = clamp(
        snapEnabled ? quantize(playheadMs, snapMs) : playheadMs,
        clip.startMs + MIN_CLIP_DURATION_MS,
        clip.startMs + clip.durationMs - MIN_CLIP_DURATION_MS,
      );

      const leftDuration = splitAt - clip.startMs;
      const rightDuration = clip.durationMs - leftDuration;

      const left: Clip = {
        ...clip,
        id: `${clip.id}-a`,
        label: `${clip.label}-A`,
        durationMs: leftDuration,
        outMs: clip.inMs + leftDuration,
      };

      const right: Clip = {
        ...clip,
        id: `${clip.id}-b`,
        label: `${clip.label}-B`,
        startMs: splitAt,
        inMs: clip.inMs + leftDuration,
        durationMs: rightDuration,
        outMs: clip.inMs + leftDuration + rightDuration,
      };

      clips.splice(pos.clipIndex, 1, left, right);
      track.clips = clips;
      tracks[pos.trackIndex] = track;

      setSelection({ trackId: track.id, clipId: right.id });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const addOverlayClip = () => {
    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.map((track) => {
        if (track.kind !== "overlay") return track;
        const id = `overlay-${crypto.randomUUID().slice(0, 8)}`;
        const next: Clip = {
          id,
          label: "sticker",
          assetId: id,
          startMs: playheadMs,
          durationMs: 1200,
          inMs: 0,
          outMs: 1200,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        };
        setSelection({ trackId: track.id, clipId: id });
        return { ...track, clips: [...track.clips, next] };
      });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
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
      const normalized = normalizeProject(parsed);
      setProject(normalized);
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
    a.download = "mav-project-v0.json";
    a.click();
    URL.revokeObjectURL(url);
    setLog("Project JSON exported.");
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
        const canvas = previewCanvasRef.current;
        if (canvas) {
          drawVideoFrameOnCanvas(canvas, message.frame);
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
      cleanupPointerListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (decoderMode !== "webcodecs") return;
    queuePreviewSeek(playheadUs);
  }, [decoderMode, playheadUs]);

  useEffect(() => {
    if (decoderMode !== "fallback") return;
    if (!videoUrl) return;

    const video = fallbackVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;

    const targetSeconds = fromUs(playheadUs) / 1000;
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
  }, [decoderMode, playheadUs, videoUrl]);

  const onPickVideo = async (file: File | null) => {
    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
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

    setProjectWithNormalize((prev) => {
      const assets = prev.assets.filter((asset) => asset.id !== "asset-video-1");
      assets.push({ id: "asset-video-1", kind: "video", url });
      return { ...prev, assets };
    });

    const worker = decodeWorkerRef.current;
    if (worker && webCodecsAvailable) {
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

    setLog(`Loaded video: ${file.name}`);
  };

  const applyVideoDurationToClip = () => {
    if (!videoDurationMs || videoDurationMs <= 0) return;
    setProjectWithNormalize((prev) => {
      const tracks = prev.timeline.tracks.map((track) => {
        if (track.kind !== "video" || track.clips.length === 0) return track;
        const first = track.clips[0];
        const clips = [...track.clips];
        clips[0] = {
          ...first,
          durationMs: videoDurationMs,
          outMs: first.inMs + videoDurationMs,
        };
        return { ...track, clips };
      });
      return { ...prev, timeline: { ...prev.timeline, tracks } };
    });
  };

  const zoomWidthPx = Math.max(
    960,
    (project.timeline.durationMs / 1000) * pixelsPerSecond + 120,
  );

  return (
    <main className="shell">
      <header className="panel">
        <h1>MAV PoC Editor Web</h1>
        <p>
          Week-1 continuation: MP4 demux + WebCodecs decode worker, lane drag/resize with snap,
          deterministic save/load.
        </p>
      </header>

      <section className="panel controls">
        <div className="row2">
          <label htmlFor="playhead">Playhead: {playheadMs} ms ({playheadUs} us)</label>
          <input
            id="playhead"
            type="range"
            min={0}
            max={project.timeline.durationMs}
            value={playheadMs}
            onChange={(e) => setPlayheadMs(Number(e.target.value))}
          />
        </div>

        <div className="row2">
          <label htmlFor="zoom">Zoom (px/s): {pixelsPerSecond}</label>
          <input
            id="zoom"
            type="range"
            min={20}
            max={240}
            value={pixelsPerSecond}
            onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
          />
        </div>

        <div className="buttons">
          <button onClick={() => moveSelected(-250)}>Move -250ms</button>
          <button onClick={() => moveSelected(250)}>Move +250ms</button>
          <button onClick={() => trimSelectedStart(100)}>Trim Start +100ms</button>
          <button onClick={() => trimSelectedStart(-100)}>Trim Start -100ms</button>
          <button onClick={() => trimSelectedEnd(100)}>Trim End +100ms</button>
          <button onClick={() => trimSelectedEnd(-100)}>Trim End -100ms</button>
          <button onClick={splitSelected}>Split At Playhead</button>
          <button onClick={addOverlayClip}>Add Overlay Clip</button>
        </div>

        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(e) => setSnapEnabled(e.target.checked)}
            />
            Snap
          </label>
          <label>
            Snap ms
            <input
              type="number"
              min={1}
              value={snapMs}
              onChange={(e) => setSnapMs(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label>
            Collision
            <select
              value={collisionMode}
              onChange={(e) => setCollisionMode(e.target.value as CollisionMode)}
            >
              <option value="no-overlap">No overlap</option>
              <option value="push">Push forward</option>
              <option value="allow-overlap">Allow overlap</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Timeline (pointer interactions)</h2>
        <p className="hint">
          Drag middle to move. Drag edge handles to trim. Pointer capture + rAF updates +
          collision mode: {collisionMode}.
        </p>
        <div className="timelineScroller">
          <div className="timelineCanvas" style={{ width: `${zoomWidthPx}px` }}>
            <div
              className="playhead"
              style={{ left: `${(playheadMs / 1000) * pixelsPerSecond}px` }}
            />
            {snapGuideMs != null ? (
              <div className="snapGuide" style={{ left: `${(snapGuideMs / 1000) * pixelsPerSecond}px` }} />
            ) : null}

            {project.timeline.tracks.map((track, rowIndex) => (
              <div key={track.id} className="trackLane" style={{ top: `${rowIndex * 56}px` }}>
                <div className="trackLabel">{track.id}</div>
                {track.clips.map((sourceClip) => {
                  const clip = getClipRenderState(track.id, sourceClip);
                  const isSelected =
                    selection?.trackId === track.id && selection?.clipId === sourceClip.id;
                  return (
                    <button
                      key={sourceClip.id}
                      className={`clipBlock ${isSelected ? "selected" : ""}`}
                      style={{
                        left: `${(clip.startMs / 1000) * pixelsPerSecond}px`,
                        width: `${Math.max(24, (clip.durationMs / 1000) * pixelsPerSecond)}px`,
                      }}
                      onPointerDown={(event) => onClipPointerDown(event, track.id, sourceClip)}
                    >
                      <span className="clipHandle left" />
                      <span className="clipLabel">{clip.label}</span>
                      <span className="clipHandle right" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Decoded Preview</h2>
        <div className="buttons">
          <input
            id="decode-input-file"
            type="file"
            accept="video/mp4,video/*"
            onChange={(e) => onPickVideo(e.target.files?.[0] ?? null)}
          />
          <button onClick={applyVideoDurationToClip}>Apply Video Duration To Clip</button>
          <label>
            Timestamp audit samples
            <input
              type="number"
              min={0}
              max={64}
              value={timestampAuditSamples}
              onChange={(e) => setTimestampAuditSamples(Math.max(0, Math.min(64, Number(e.target.value) || 0)))}
            />
          </label>
        </div>

        <canvas ref={previewCanvasRef} width={960} height={540} className="previewCanvas" />

        <video
          ref={fallbackVideoRef}
          className="hiddenVideo"
          src={videoUrl ?? undefined}
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            const ms = Math.round(e.currentTarget.duration * 1000);
            setVideoDurationMs(ms);
          }}
        />

        <p className="hint">
          Mode: <strong>{decoderMode}</strong>. WebCodecs API available: <strong>{webCodecsAvailable ? "yes" : "no"}</strong>
        </p>
        <p className="hint">
          Source: codec=<strong>{sourceDetails.codec ?? "n/a"}</strong>, coded=<strong>{sourceDetails.codedWidth ?? 0}x{sourceDetails.codedHeight ?? 0}</strong>, avcC bytes=<strong>{sourceDetails.descriptionLength ?? 0}</strong>, timestamp issues=<strong>{sourceDetails.timestampAuditIssueCount ?? 0}</strong>
        </p>
        {isFmp4Source ? (
          <p className="hint">
            fMP4 detected: preview forced to HTMLVideoElement + RVFC fallback (`TELEMETRY:fmp4_preview_path=fallback_htmlvideo`).
          </p>
        ) : null}
        <p className="hint">Debug tip: open Chrome DevTools Media panel while scrubbing.</p>

        <pre>{decoderLogs.join("\n") || "Decoder logs will appear here."}</pre>
      </section>

      <section className="panel">
        <h2>Decode QA Harness</h2>
        <p className="hint">
          Runs random + extremes + rapid drag seek clusters and records drift (target vs decoded
          timestamp, pass threshold ±1 frame).
        </p>

        <div className="toggles">
          <label>
            Curated profile
            <select id="decode-qa-profile" value={qaProfile} onChange={(e) => setQaProfile(e.target.value)}>
              <option value="baseline-short-gop">Baseline / short GOP / AAC</option>
              <option value="main-long-gop">Main / long GOP / AAC</option>
              <option value="high-long-gop">High / long GOP / AAC</option>
              <option value="no-audio">No audio track</option>
              <option value="fmp4">Fragmented MP4 (fMP4)</option>
            </select>
          </label>
          <label>
            Scenarios
            <input
              id="decode-qa-scenarios"
              type="number"
              min={10}
              max={200}
              value={qaScenarioCount}
              onChange={(e) => setQaScenarioCount(Number(e.target.value) || DEFAULT_QA_SCENARIOS)}
            />
          </label>
          <button
            id="decode-qa-run"
            disabled={qaRunning || decoderMode !== "webcodecs"}
            onClick={() => void runDecodeQA()}
          >
            {qaRunning ? "Running..." : "Run Decode QA"}
          </button>
          <button disabled={!lastRunResult} onClick={() => exportQARunResult(lastRunResult)}>
            Export Last Result JSON
          </button>
        </div>

        {qaMetric ? (
          <pre data-testid="decode-qa-metric">{JSON.stringify(qaMetric, null, 2)}</pre>
        ) : (
          <p className="hint">Run QA after loading a video to populate metrics.</p>
        )}
        {lastRunResult?.diagnostics ? (
          <pre>{JSON.stringify(lastRunResult.diagnostics, null, 2)}</pre>
        ) : null}

        <p className="hint">
          Suggested set: Baseline/Main/High + long/short GOP + AAC/no-audio + one fMP4 sample.
        </p>
        <pre>{JSON.stringify(qaHistory, null, 2)}</pre>
      </section>

      <section className="panel">
        <h2>Overlay Transform (selected clip)</h2>
        {selectedClip?.transform ? (
          <div className="transformGrid">
            <label>
              X
              <input
                type="number"
                value={selectedClip.transform.x}
                onChange={(e) =>
                  updateSelectedClip((clip) => ({
                    ...clip,
                    transform: { ...clip.transform!, x: Number(e.target.value) },
                  }))
                }
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={selectedClip.transform.y}
                onChange={(e) =>
                  updateSelectedClip((clip) => ({
                    ...clip,
                    transform: { ...clip.transform!, y: Number(e.target.value) },
                  }))
                }
              />
            </label>
            <label>
              Scale
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={selectedClip.transform.scale}
                onChange={(e) =>
                  updateSelectedClip((clip) => ({
                    ...clip,
                    transform: {
                      ...clip.transform!,
                      scale: Math.max(0.1, Number(e.target.value)),
                    },
                  }))
                }
              />
            </label>
            <label>
              Rotation
              <input
                type="number"
                value={selectedClip.transform.rotation}
                onChange={(e) =>
                  updateSelectedClip((clip) => ({
                    ...clip,
                    transform: { ...clip.transform!, rotation: Number(e.target.value) },
                  }))
                }
              />
            </label>
          </div>
        ) : (
          <p className="hint">Select an overlay clip to edit transform values.</p>
        )}
      </section>

      <section className="panel">
        <h2>Persistence</h2>
        <div className="buttons">
          <button onClick={saveProject}>Save Local</button>
          <button onClick={loadProject}>Load Local</button>
          <button onClick={exportProjectJson}>Export JSON</button>
          <button
            onClick={() => {
              setProject(createInitialProject());
              setSelection({ trackId: "video-1", clipId: "clip-1" });
              setPlayheadMs(1200);
              setInteractionPreview(null);
              setSnapGuideMs(null);
              setQaMetric(null);
              setLog("Reset to initial state.");
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Schema Loaded</h2>
        <pre>{JSON.stringify({ id: projectSchema.$id, title: projectSchema.title }, null, 2)}</pre>
      </section>

      <section className="panel">
        <h2>Project JSON</h2>
        <pre>{JSON.stringify(normalizeProject(project), null, 2)}</pre>
      </section>

      <footer className="panel log">{log}</footer>
    </main>
  );
}
