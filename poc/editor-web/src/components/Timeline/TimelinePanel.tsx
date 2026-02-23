import React, { useEffect, useMemo, useRef, useState } from "react";

type Clip = {
  id: string;
  label: string;
  assetId: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  mediaRole?: "video" | "audio" | "overlay";
  linkGroupId?: string;
  linkLocked?: boolean;
};

type Track = {
  id: string;
  kind: "video" | "overlay" | "audio";
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
};

type Selection = {
  trackId: string;
  clipId: string;
} | null;

type AssetMeta = {
  id: string;
  kind: "video" | "audio" | "image";
  hasAudio?: boolean;
  thumbnails?: string[];
  waveform?: number[];
};

type TimelinePanelProps = {
  tracks: Track[];
  playheadMs: number;
  onPlayheadChange: (value: number) => void;
  pixelsPerSecond: number;
  onZoomChange: (value: number) => void;
  zoomWidthPx: number;
  snapGuideMs: number | null;
  selection: Selection;
  selectedClipKeys: string[];
  collisionMode: "no-overlap" | "push" | "allow-overlap";
  rippleMode: "none" | "ripple-delete";
  snapEnabled: boolean;
  altSnapDisabled: boolean;
  snapMs: number;
  toolMode: "select" | "split";
  magnetEnabled: boolean;
  showFilmstrip: boolean;
  statusText: string;
  onSnapEnabledChange: (value: boolean) => void;
  onSnapMsChange: (value: number) => void;
  onCollisionModeChange: (value: "no-overlap" | "push" | "allow-overlap") => void;
  onRippleModeChange: (value: "none" | "ripple-delete") => void;
  onToolModeChange: (value: "select" | "split") => void;
  onMagnetEnabledChange: (value: boolean) => void;
  onShowFilmstripChange: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDelete: () => void;
  getClipRenderState: (trackId: string, clip: Clip) => Clip;
  onClipPointerDown: (event: React.PointerEvent<HTMLButtonElement>, trackId: string, clip: Clip) => void;
  onAssetDrop: (assetId: string, trackId: string, startMs: number) => void;
  onSelectClipKeys: (keys: string[], primary?: { trackId: string; clipId: string } | null) => void;
  onClearSelection: () => void;
  onSplitClip: (trackId: string, clipId: string) => void;
  onDeleteClip: (trackId: string, clipId: string) => void;
  onDuplicateClip: (trackId: string, clipId: string) => void;
  onDetachAudio: (trackId: string, clipId: string) => void;
  onRelinkClip: (trackId: string, clipId: string) => void;
  onAddTrack: (kind: "video" | "overlay" | "audio") => void;
  onRemoveTrack: (trackId: string) => void;
  onToggleTrackFlag: (trackId: string, key: "muted" | "locked" | "visible") => void;
  onDropRejected: (message: string) => void;
  assetMap: Map<string, AssetMeta>;
};

type Marquee = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function trackDisplayName(track: Track, tracks: Track[]) {
  const base = track.kind === "video" ? "Video" : track.kind === "overlay" ? "Overlay" : "Audio";
  const sameKind = tracks.filter((item) => item.kind === track.kind);
  if (sameKind.length <= 1) return base;
  const order = sameKind.findIndex((item) => item.id === track.id) + 1;
  return `${base} ${order}`;
}

function overlapRect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function formatRulerTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const TRACK_LABEL_WIDTH = 156;
const RULER_HEIGHT = 28;
const LANE_HEIGHT = 64;
const CLIP_TOP = 6;
const CLIP_HEIGHT = 52;

export function TimelinePanel({
  tracks,
  playheadMs,
  onPlayheadChange,
  pixelsPerSecond,
  onZoomChange,
  zoomWidthPx,
  snapGuideMs,
  selection,
  selectedClipKeys,
  collisionMode,
  rippleMode,
  snapEnabled,
  altSnapDisabled,
  snapMs,
  toolMode,
  magnetEnabled,
  showFilmstrip,
  statusText,
  onSnapEnabledChange,
  onSnapMsChange,
  onCollisionModeChange,
  onRippleModeChange,
  onToolModeChange,
  onMagnetEnabledChange,
  onShowFilmstripChange,
  onUndo,
  onRedo,
  onSplit,
  onDelete,
  getClipRenderState,
  onClipPointerDown,
  onAssetDrop,
  onSelectClipKeys,
  onClearSelection,
  onSplitClip,
  onDeleteClip,
  onDuplicateClip,
  onDetachAudio,
  onRelinkClip,
  onAddTrack,
  onRemoveTrack,
  onToggleTrackFlag,
  onDropRejected,
  assetMap,
}: TimelinePanelProps) {
  const selected = new Set(selectedClipKeys);
  const [dragOver, setDragOver] = useState(false);
  const [dragLane, setDragLane] = useState<{
    trackId: string;
    compatible: boolean;
    message: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    trackId: string;
    clipId: string;
  } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const playheadDragRef = useRef<{ pointerId: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [viewportContentWidthPx, setViewportContentWidthPx] = useState(0);
  const hasAnyClip = tracks.some((track) => track.clips.length > 0);
  const timelineHeight = Math.max(180, tracks.length * LANE_HEIGHT + 8);
  const firstAudioLane = tracks.findIndex((track) => track.kind === "audio");
  const timelineContentWidthPx = Math.max(zoomWidthPx, viewportContentWidthPx);
  const timelineWorkspaceWidthPx = TRACK_LABEL_WIDTH + timelineContentWidthPx;
  const rulerStepMs = pixelsPerSecond >= 180 ? 500 : pixelsPerSecond >= 100 ? 1000 : 2000;
  const maxRulerMs = Math.max(playheadMs, Math.round((timelineContentWidthPx / pixelsPerSecond) * 1000));
  const rulerMarks = useMemo(() => {
    const marks: Array<{ ms: number; x: number; major: boolean }> = [];
    const step = Math.max(250, rulerStepMs);
    for (let ms = 0; ms <= maxRulerMs; ms += step) {
      marks.push({
        ms,
        x: (ms / 1000) * pixelsPerSecond,
        major: ms % (step * 2) === 0,
      });
    }
    return marks;
  }, [maxRulerMs, pixelsPerSecond, rulerStepMs]);

  const clipLayout = useMemo(() => {
    return tracks.flatMap((track, rowIndex) =>
      track.clips.map((sourceClip) => {
        const clip = getClipRenderState(track.id, sourceClip);
        const widthPx = Math.max(24, (clip.durationMs / 1000) * pixelsPerSecond);
        const xPx = (clip.startMs / 1000) * pixelsPerSecond;
        const yPx = rowIndex * LANE_HEIGHT + CLIP_TOP;
        return {
          key: `${track.id}:${sourceClip.id}`,
          trackId: track.id,
          clipId: sourceClip.id,
          clip,
          rect: { x: xPx, y: yPx, width: widthPx, height: CLIP_HEIGHT },
        };
      }),
    );
  }, [tracks, getClipRenderState, pixelsPerSecond]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const measure = () => {
      const next = Math.max(320, Math.round(scroller.clientWidth - TRACK_LABEL_WIDTH));
      setViewportContentWidthPx((prev) => (prev === next ? prev : next));
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const setZoom = (next: number) => {
    onZoomChange(Math.max(20, Math.min(240, Math.round(next))));
  };

  const applyMarqueeSelection = (nextMarquee: Marquee) => {
    const selectedClips = clipLayout.filter((entry) => overlapRect(entry.rect, nextMarquee));
    const keys = selectedClips.map((entry) => entry.key);
    const primary = selectedClips[0]
      ? { trackId: selectedClips[0].trackId, clipId: selectedClips[0].clipId }
      : null;
    onSelectClipKeys(keys, primary);
  };

  const seekFromClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scroller = scrollerRef.current;
    const rect = canvas.getBoundingClientRect();
    const scrollLeft = scroller?.scrollLeft ?? 0;
    const x = Math.min(Math.max(0, clientX - rect.left + scrollLeft), timelineContentWidthPx);
    const nextMs = Math.round((x / pixelsPerSecond) * 1000);
    onPlayheadChange(nextMs);
  };

  const resolveDropLane = (event: React.DragEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = scroller?.scrollLeft ?? 0;
    const scrollTop = scroller?.scrollTop ?? 0;
    const x = Math.max(0, event.clientX - rect.left + scrollLeft);
    const y = Math.max(0, event.clientY - rect.top + scrollTop);
    const laneIndex = Math.min(tracks.length - 1, Math.max(0, Math.floor(y / LANE_HEIGHT)));
    const lane = tracks[laneIndex];
    const startMs = Math.round((x / pixelsPerSecond) * 1000);
    return { lane, startMs };
  };

  const resolveDropCompatibility = (assetId: string, lane: Track | undefined) => {
    if (!lane) {
      return { compatible: false, message: "No target track." };
    }
    const asset = assetMap.get(assetId);
    if (!asset) {
      return { compatible: true, message: `Drop on ${trackDisplayName(lane, tracks)}` };
    }

    const isVideoAsset = asset.kind === "video";
    const isOverlayAsset = asset.kind === "image";
    const isAudioAsset = asset.kind === "audio";
    const isVideoLane = lane.kind === "video";
    const isOverlayLane = lane.kind === "overlay";
    const isAudioLane = lane.kind === "audio";
    const compatible =
      (isVideoAsset && isVideoLane) || (isOverlayAsset && isOverlayLane) || (isAudioAsset && isAudioLane);
    const message = compatible
      ? `Drop on ${trackDisplayName(lane, tracks)}`
      : isVideoAsset
        ? "Video only on video tracks."
        : isOverlayAsset
          ? "Overlay only on overlay tracks."
          : "Audio only on audio tracks.";

    return { compatible, message };
  };

  useEffect(() => {
    const onWindowPointerMove = (event: PointerEvent) => {
      const drag = playheadDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      seekFromClientX(event.clientX);
    };

    const stopDrag = (event: PointerEvent) => {
      const drag = playheadDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      playheadDragRef.current = null;
    };

    const onWindowBlur = () => {
      playheadDragRef.current = null;
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [pixelsPerSecond, timelineContentWidthPx, onPlayheadChange]);

  return (
    <div className="timelinePanel">
      <div className="timelineToolbar">
        <div className="timelineToolbarGroup">
          <button
            type="button"
            className={`iconBtn ${toolMode === "select" ? "activeTool" : ""}`}
            title="Select tool"
            onClick={() => onToolModeChange("select")}
          >
            ↖
          </button>
          <button
            type="button"
            className={`iconBtn ${toolMode === "split" ? "activeTool" : ""}`}
            title="Split tool"
            onClick={() => onToolModeChange("split")}
          >
            ✂
          </button>
          <button type="button" className="iconBtn" title="Undo (Cmd/Ctrl+Z)" onClick={onUndo}>
            ↶
          </button>
          <button type="button" className="iconBtn" title="Redo (Cmd/Ctrl+Shift+Z)" onClick={onRedo}>
            ↷
          </button>
          <button type="button" className="iconBtn" title="Split at playhead (S)" onClick={onSplit}>
            ⫼
          </button>
          <button type="button" className="iconBtn" title="Delete selection (Del)" onClick={onDelete}>
            ⌫
          </button>
          <button type="button" className="iconBtn tiny" title="Add video track" onClick={() => onAddTrack("video")}>
            +V
          </button>
          <button type="button" className="iconBtn tiny" title="Add overlay track" onClick={() => onAddTrack("overlay")}>
            +O
          </button>
          <button type="button" className="iconBtn tiny" title="Add audio track" onClick={() => onAddTrack("audio")}>
            +A
          </button>
          <label className="compactLabel">
            <span>Ripple</span>
            <select
              value={rippleMode}
              onChange={(event) => onRippleModeChange(event.target.value as "none" | "ripple-delete")}
            >
              <option value="none">None</option>
              <option value="ripple-delete">Ripple delete</option>
            </select>
          </label>
        </div>

        <div className="timelineToolbarGroup">
          <button
            type="button"
            className={`iconBtn ${magnetEnabled ? "activeTool" : ""}`}
            title="Main track magnet"
            onClick={() => onMagnetEnabledChange(!magnetEnabled)}
          >
            🧲
          </button>
          <button
            type="button"
            className={`iconBtn ${snapEnabled ? "activeTool" : ""}`}
            title={`Snapping ${altSnapDisabled ? "temporarily disabled (Alt)" : "enabled"}`}
            onClick={() => onSnapEnabledChange(!snapEnabled)}
          >
            ✢
          </button>
          <label className="compactLabel">
            <span>Snap</span>
            <input
              type="number"
              min={1}
              value={snapMs}
              onChange={(event) => onSnapMsChange(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <button
            type="button"
            className={`iconBtn ${showFilmstrip ? "activeTool" : ""}`}
            title="Filmstrip preview axis"
            onClick={() => onShowFilmstripChange(!showFilmstrip)}
          >
            ▦
          </button>
          <label className="zoomControl">
            <span>Zoom</span>
            <button type="button" className="iconBtn tiny" title="Zoom out (-)" onClick={() => setZoom(pixelsPerSecond - 12)}>
              -
            </button>
            <input
              type="range"
              min={20}
              max={240}
              value={pixelsPerSecond}
              onChange={(event) => onZoomChange(Number(event.target.value))}
            />
            <button type="button" className="iconBtn tiny" title="Zoom in (+)" onClick={() => setZoom(pixelsPerSecond + 12)}>
              +
            </button>
            <button type="button" className="zoomPreset" onClick={() => setZoom(60)}>
              60
            </button>
            <button type="button" className="zoomPreset" onClick={() => setZoom(120)}>
              120
            </button>
            <button type="button" className="zoomPreset" onClick={() => setZoom(180)}>
              180
            </button>
          </label>
          <label className="compactLabel">
            <span>Placement</span>
            <select
              value={collisionMode}
              onChange={(event) => onCollisionModeChange(event.target.value as "no-overlap" | "push" | "allow-overlap")}
            >
              <option value="no-overlap">No overlap</option>
              <option value="push">Push clips</option>
              <option value="allow-overlap" disabled={magnetEnabled}>
                Allow overlap
              </option>
            </select>
          </label>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="timelineScroller"
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          const delta = event.deltaY > 0 ? -8 : 8;
          setZoom(pixelsPerSecond + delta);
        }}
      >
        <div className="timelineWorkspace" style={{ minWidth: `${timelineWorkspaceWidthPx}px` }}>
          <div className="timelineRulerSpacer" style={{ width: `${TRACK_LABEL_WIDTH}px`, height: `${RULER_HEIGHT}px` }} />
          <div
            className="timelineRuler"
            style={{ width: `${timelineContentWidthPx}px`, height: `${RULER_HEIGHT}px` }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              const scroller = scrollerRef.current;
              const rect = event.currentTarget.getBoundingClientRect();
              const scrollLeft = scroller?.scrollLeft ?? 0;
              const localX = Math.max(0, Math.min(event.clientX - rect.left + scrollLeft, timelineContentWidthPx));
              const nextMs = Math.round((localX / pixelsPerSecond) * 1000);
              onPlayheadChange(nextMs);
            }}
          >
            {rulerMarks.map((mark) => (
              <div
                key={`ruler-${mark.ms}`}
                className={`timelineRulerTick ${mark.major ? "major" : "minor"}`}
                style={{ left: `${mark.x}px` }}
              >
                {mark.major ? <span>{formatRulerTime(mark.ms)}</span> : null}
              </div>
            ))}
            <div className="timelineRulerPlayhead" style={{ left: `${(playheadMs / 1000) * pixelsPerSecond}px` }} />
          </div>

          <div className="trackColumn" style={{ width: `${TRACK_LABEL_WIDTH}px`, height: `${timelineHeight}px` }}>
            {tracks.map((track, rowIndex) => {
              return (
                <div
                  key={`header-${track.id}`}
                  className={`trackHeaderRow ${firstAudioLane >= 0 && rowIndex === firstAudioLane ? "sectionStart" : ""} ${
                    dragLane?.trackId === track.id ? (dragLane.compatible ? "dropTarget" : "dropRejected") : ""
                  }`}
                  style={{ top: `${rowIndex * LANE_HEIGHT}px`, height: `${LANE_HEIGHT}px` }}
                >
                  <strong>{trackDisplayName(track, tracks)}</strong>
                  <div className="trackHeaderActions">
                    <button
                      type="button"
                      className={`iconBtn tiny ${track.muted ? "activeTrackBtn" : ""}`}
                      title="Mute track"
                      onClick={() => onToggleTrackFlag(track.id, "muted")}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      className={`iconBtn tiny ${track.locked ? "activeTrackBtn" : ""}`}
                      title="Lock track"
                      onClick={() => onToggleTrackFlag(track.id, "locked")}
                    >
                      L
                    </button>
                    <button
                      type="button"
                      className={`iconBtn tiny ${track.visible ? "activeTrackBtn" : ""}`}
                      title="Toggle visibility"
                      onClick={() => onToggleTrackFlag(track.id, "visible")}
                    >
                      V
                    </button>
                    <button type="button" className="iconBtn tiny dangerBtn" title="Remove track" onClick={() => onRemoveTrack(track.id)}>
                      −
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            ref={canvasRef}
            className={`timelineCanvas timelineLanes ${showFilmstrip ? "filmstripOn" : "filmstripOff"} ${dragOver ? "dropActive" : ""}`}
            style={{ width: `${timelineContentWidthPx}px`, height: `${timelineHeight}px` }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const target = event.target;
              if (target instanceof HTMLElement && target.closest(".clipBlock")) {
                return;
              }
              const scroller = scrollerRef.current;
              const rect = event.currentTarget.getBoundingClientRect();
              const scrollLeft = scroller?.scrollLeft ?? 0;
              const scrollTop = scroller?.scrollTop ?? 0;
              const localX = Math.max(0, event.clientX - rect.left + scrollLeft);
              const localY = Math.max(0, event.clientY - rect.top + scrollTop);
              const nextMs = Math.round((localX / pixelsPerSecond) * 1000);
              onPlayheadChange(nextMs);
              onClearSelection();
              marqueeRef.current = {
                pointerId: event.pointerId,
                startX: localX,
                startY: localY,
              };
              setMarquee({
                startX: localX,
                startY: localY,
                x: localX,
                y: localY,
                width: 0,
                height: 0,
              });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const active = marqueeRef.current;
              if (!active || active.pointerId !== event.pointerId) return;
              const scroller = scrollerRef.current;
              const rect = event.currentTarget.getBoundingClientRect();
              const scrollLeft = scroller?.scrollLeft ?? 0;
              const scrollTop = scroller?.scrollTop ?? 0;
              const x = Math.max(0, event.clientX - rect.left + scrollLeft);
              const y = Math.max(0, event.clientY - rect.top + scrollTop);
              const left = Math.min(active.startX, x);
              const top = Math.min(active.startY, y);
              const width = Math.abs(x - active.startX);
              const height = Math.abs(y - active.startY);
              const next = { startX: active.startX, startY: active.startY, x: left, y: top, width, height };
              setMarquee(next);
            }}
            onPointerUp={(event) => {
              const active = marqueeRef.current;
              if (!active || active.pointerId !== event.pointerId) return;
              marqueeRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
              if (marquee && marquee.width > 4 && marquee.height > 4) {
                applyMarqueeSelection(marquee);
              }
              setMarquee(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              const assetId =
                event.dataTransfer.getData("text/x-mav-asset-id") || event.dataTransfer.getData("text/plain");
              const { lane } = resolveDropLane(event);
              const { compatible, message } = resolveDropCompatibility(assetId, lane);
              event.dataTransfer.dropEffect = compatible ? "copy" : "none";
              setDragOver(true);
              if (lane) {
                setDragLane({
                  trackId: lane.id,
                  compatible,
                  message,
                });
              } else {
                setDragLane(null);
              }
            }}
            onDragEnter={() => setDragOver(true)}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              setDragOver(false);
              setDragLane(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              setDragLane(null);
              const assetId =
                event.dataTransfer.getData("text/x-mav-asset-id") || event.dataTransfer.getData("text/plain");
              if (!assetId) return;
              const { lane, startMs } = resolveDropLane(event);
              if (!lane) return;
              const { compatible, message } = resolveDropCompatibility(assetId, lane);
              if (!compatible) {
                onDropRejected(`Drop rejected: ${message}`);
                return;
              }
              onAssetDrop(assetId, lane.id, startMs);
            }}
          >
            <div
              className="playhead"
              style={{ left: `${(playheadMs / 1000) * pixelsPerSecond}px` }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                playheadDragRef.current = { pointerId: event.pointerId };
                seekFromClientX(event.clientX);
              }}
            />
            {snapGuideMs != null ? (
              <div className="snapGuide" style={{ left: `${(snapGuideMs / 1000) * pixelsPerSecond}px` }} />
            ) : null}
            {!hasAnyClip ? <div className="timelineEmptyState">Drag media here to start.</div> : null}
            {dragOver ? <div className="timelineDropState">{dragLane?.message ?? "Drop to add clip."}</div> : null}

            {tracks.map((track, rowIndex) => {
              return (
                <div
                  key={track.id}
                  className={`trackLane ${firstAudioLane >= 0 && rowIndex === firstAudioLane ? "sectionStart" : ""} ${
                    dragLane?.trackId === track.id ? (dragLane.compatible ? "dropTarget" : "dropRejected") : ""
                  }`}
                  style={{ top: `${rowIndex * LANE_HEIGHT}px`, height: `${LANE_HEIGHT}px` }}
                >
                  {track.clips.map((sourceClip) => {
                    const clip = getClipRenderState(track.id, sourceClip);
                    const asset = assetMap.get(sourceClip.assetId);
                    const widthPx = Math.max(24, (clip.durationMs / 1000) * pixelsPerSecond);
                    const isSelected = selected.has(`${track.id}:${sourceClip.id}`);
                    const isPrimary = selection?.trackId === track.id && selection?.clipId === sourceClip.id;
                    const filmstripTiles = asset?.thumbnails ?? [];
                    const tileCount = Math.max(1, Math.ceil(widthPx / 42));
                    const waveform = asset?.waveform ?? [];
                    const isAudioClip = track.kind === "audio" || asset?.kind === "audio";

                    return (
                      <button
                        key={sourceClip.id}
                        type="button"
                        className={`clipBlock ${isSelected ? "selected" : ""} ${isPrimary ? "primary" : ""}`}
                        style={{
                          left: `${(clip.startMs / 1000) * pixelsPerSecond}px`,
                          width: `${widthPx}px`,
                          opacity: track.visible ? 1 : 0.25,
                        }}
                        disabled={track.locked}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          onClipPointerDown(event, track.id, sourceClip);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            trackId: track.id,
                            clipId: sourceClip.id,
                          });
                        }}
                      >
                        {showFilmstrip && track.kind === "video" && filmstripTiles.length > 0 ? (
                          <span className="clipFilmstrip" aria-hidden>
                            {Array.from({ length: tileCount }).map((_, index) => (
                              <img
                                key={`${sourceClip.id}-thumb-${index}`}
                                src={filmstripTiles[index % filmstripTiles.length]}
                                alt=""
                              />
                            ))}
                          </span>
                        ) : null}
                        {isAudioClip && waveform.length > 0 ? (
                          <span className="clipWaveform" aria-hidden>
                            {waveform.slice(0, 90).map((value, index) => (
                              <i key={`${sourceClip.id}-wave-${index}`} style={{ height: `${Math.max(4, value * 24)}px` }} />
                            ))}
                          </span>
                        ) : null}
                        <span className="clipHandle left" />
                        <span className="clipLabel">{clip.label}</span>
                        <span className="clipHandle right" />
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {marquee ? (
              <div
                className="timelineMarquee"
                style={{
                  left: `${marquee.x}px`,
                  top: `${marquee.y}px`,
                  width: `${marquee.width}px`,
                  height: `${marquee.height}px`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {contextMenu ? (
        <div className="clipContextMenu" style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}>
          <button
            type="button"
            onClick={() => {
              onSplitClip(contextMenu.trackId, contextMenu.clipId);
              setContextMenu(null);
            }}
          >
            Split
          </button>
          <button
            type="button"
            onClick={() => {
              onDeleteClip(contextMenu.trackId, contextMenu.clipId);
              setContextMenu(null);
            }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => {
              onDuplicateClip(contextMenu.trackId, contextMenu.clipId);
              setContextMenu(null);
            }}
          >
            Duplicate
          </button>
          <button type="button" disabled>
            Speed (later)
          </button>
          <button
            type="button"
            onClick={() => {
              onDetachAudio(contextMenu.trackId, contextMenu.clipId);
              setContextMenu(null);
            }}
          >
            Detach audio
          </button>
          <button
            type="button"
            onClick={() => {
              onRelinkClip(contextMenu.trackId, contextMenu.clipId);
              setContextMenu(null);
            }}
          >
            Relink A/V
          </button>
        </div>
      ) : null}

      <div className="timelineStatusBar">{statusText}</div>
    </div>
  );
}
