import React, { useEffect, useMemo, useRef, useState } from "react";

type Clip = {
  id: string;
  label: string;
  assetId: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
};

type Track = {
  id: string;
  kind: "video" | "overlay" | "audio";
  clips: Clip[];
};

type Selection = {
  trackId: string;
  clipId: string;
} | null;

type TrackUi = {
  mute: boolean;
  locked: boolean;
  visible: boolean;
};

type AssetMeta = {
  id: string;
  kind: "video" | "audio" | "image";
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

function trackDisplayName(track: Track) {
  if (track.kind === "video") return "Main video";
  if (track.kind === "overlay") return "Overlay";
  return "Audio";
}

function overlapRect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

const TRACK_LABEL_WIDTH = 124;
const LANE_HEIGHT = 56;
const CLIP_TOP = 10;
const CLIP_HEIGHT = 30;

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
  assetMap,
}: TimelinePanelProps) {
  const selected = new Set(selectedClipKeys);
  const [dragOver, setDragOver] = useState(false);
  const [trackUi, setTrackUi] = useState<Record<string, TrackUi>>({});
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
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const hasAnyClip = tracks.some((track) => track.clips.length > 0);
  const timelineHeight = Math.max(180, tracks.length * LANE_HEIGHT + 8);

  const clipLayout = useMemo(() => {
    return tracks.flatMap((track, rowIndex) =>
      track.clips.map((sourceClip) => {
        const clip = getClipRenderState(track.id, sourceClip);
        const widthPx = Math.max(24, (clip.durationMs / 1000) * pixelsPerSecond);
        const xPx = TRACK_LABEL_WIDTH + (clip.startMs / 1000) * pixelsPerSecond;
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
    setTrackUi((prev) => {
      const next: Record<string, TrackUi> = {};
      for (const track of tracks) {
        next[track.id] = prev[track.id] ?? {
          mute: false,
          locked: false,
          visible: true,
        };
      }
      return next;
    });
  }, [tracks]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const toggleTrackFlag = (trackId: string, key: keyof TrackUi) => {
    setTrackUi((prev) => ({
      ...prev,
      [trackId]: {
        ...(prev[trackId] ?? { mute: false, locked: false, visible: true }),
        [key]: !(prev[trackId]?.[key] ?? false),
      },
    }));
  };

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

  return (
    <div className="timelinePanel">
      <div className="timelineToolbar">
        <div className="timelineToolbarGroup">
          <button
            type="button"
            className={toolMode === "select" ? "activeTool" : ""}
            onClick={() => onToolModeChange("select")}
          >
            Select
          </button>
          <button
            type="button"
            className={toolMode === "split" ? "activeTool" : ""}
            onClick={() => onToolModeChange("split")}
          >
            Split Tool
          </button>
          <button type="button" onClick={onUndo}>
            Undo
          </button>
          <button type="button" onClick={onRedo}>
            Redo
          </button>
          <button type="button" onClick={onSplit}>
            Split
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
          <label>
            Ripple
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
          <label>
            <input
              type="checkbox"
              checked={magnetEnabled}
              onChange={(event) => onMagnetEnabledChange(event.target.checked)}
            />
            Main track magnet
          </label>
          <label>
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(event) => onSnapEnabledChange(event.target.checked)}
            />
            Auto snap
          </label>
          <label>
            Snap (ms)
            <input
              type="number"
              min={1}
              value={snapMs}
              onChange={(event) => onSnapMsChange(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={showFilmstrip}
              onChange={(event) => onShowFilmstripChange(event.target.checked)}
            />
            Preview axis
          </label>
          <label className="zoomControl">
            Zoom
            <button type="button" onClick={() => setZoom(pixelsPerSecond - 12)}>
              -
            </button>
            <input
              type="range"
              min={20}
              max={240}
              value={pixelsPerSecond}
              onChange={(event) => onZoomChange(Number(event.target.value))}
            />
            <button type="button" onClick={() => setZoom(pixelsPerSecond + 12)}>
              +
            </button>
            <button type="button" onClick={() => setZoom(60)}>
              60
            </button>
            <button type="button" onClick={() => setZoom(120)}>
              120
            </button>
            <button type="button" onClick={() => setZoom(180)}>
              180
            </button>
          </label>
          <label>
            Placement mode
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

      <p className="hint timelineHint">Alt temporarily disables snapping ({altSnapDisabled ? "disabled" : "enabled"}).</p>

      <div
        className="timelineScroller"
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          const delta = event.deltaY > 0 ? -8 : 8;
          setZoom(pixelsPerSecond + delta);
        }}
      >
        <div
          ref={canvasRef}
          className={`timelineCanvas ${showFilmstrip ? "filmstripOn" : "filmstripOff"} ${dragOver ? "dropActive" : ""}`}
          style={{ width: `${zoomWidthPx}px`, height: `${timelineHeight}px` }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const localX = Math.max(0, event.clientX - rect.left - TRACK_LABEL_WIDTH);
            const localY = Math.max(0, event.clientY - rect.top);
            const nextMs = Math.round((localX / pixelsPerSecond) * 1000);
            onPlayheadChange(nextMs);
            onClearSelection();
            marqueeRef.current = {
              pointerId: event.pointerId,
              startX: localX + TRACK_LABEL_WIDTH,
              startY: localY,
            };
            setMarquee({
              startX: localX + TRACK_LABEL_WIDTH,
              startY: localY,
              x: localX + TRACK_LABEL_WIDTH,
              y: localY,
              width: 0,
              height: 0,
            });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = marqueeRef.current;
            if (!active || active.pointerId !== event.pointerId) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.max(TRACK_LABEL_WIDTH, event.clientX - rect.left);
            const y = Math.max(0, event.clientY - rect.top);
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
            event.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          }}
          onDragEnter={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const assetId =
              event.dataTransfer.getData("text/x-mav-asset-id") || event.dataTransfer.getData("text/plain");
            if (!assetId) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.max(0, event.clientX - rect.left - TRACK_LABEL_WIDTH);
            const y = Math.max(0, event.clientY - rect.top);
            const laneIndex = Math.min(tracks.length - 1, Math.max(0, Math.floor(y / LANE_HEIGHT)));
            const lane = tracks[laneIndex];
            const startMs = Math.round((x / pixelsPerSecond) * 1000);
            if (!lane) return;
            onAssetDrop(assetId, lane.id, startMs);
          }}
        >
          <div className="playhead" style={{ left: `${TRACK_LABEL_WIDTH + (playheadMs / 1000) * pixelsPerSecond}px` }} />
          {snapGuideMs != null ? (
            <div className="snapGuide" style={{ left: `${TRACK_LABEL_WIDTH + (snapGuideMs / 1000) * pixelsPerSecond}px` }} />
          ) : null}
          {!hasAnyClip ? <div className="timelineEmptyState">Drag media from the Media tab to create your first clip.</div> : null}
          {dragOver ? <div className="timelineDropState">Drop to add clip at this position</div> : null}

          {tracks.map((track, rowIndex) => {
            const currentTrackUi = trackUi[track.id] ?? {
              mute: false,
              locked: false,
              visible: true,
            };

            return (
              <div key={track.id} className="trackLane" style={{ top: `${rowIndex * LANE_HEIGHT}px` }}>
                <div className="trackHeader">
                  <strong>{trackDisplayName(track)}</strong>
                  <div className="trackHeaderActions">
                    <button
                      type="button"
                      className={currentTrackUi.mute ? "activeTrackBtn" : ""}
                      onClick={() => toggleTrackFlag(track.id, "mute")}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      className={currentTrackUi.locked ? "activeTrackBtn" : ""}
                      onClick={() => toggleTrackFlag(track.id, "locked")}
                    >
                      L
                    </button>
                    <button
                      type="button"
                      className={currentTrackUi.visible ? "activeTrackBtn" : ""}
                      onClick={() => toggleTrackFlag(track.id, "visible")}
                    >
                      V
                    </button>
                  </div>
                </div>

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
                        opacity: currentTrackUi.visible ? 1 : 0.25,
                      }}
                      disabled={currentTrackUi.locked}
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
          <button type="button" disabled>
            Detach audio (later)
          </button>
        </div>
      ) : null}

      <div className="timelineStatusBar">{statusText}</div>
    </div>
  );
}
