import React, { useEffect, useState } from "react";

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
};

function trackDisplayName(track: Track) {
  if (track.kind === "video") return "Main video";
  if (track.kind === "overlay") return "Overlay";
  return "Audio";
}

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
}: TimelinePanelProps) {
  const selected = new Set(selectedClipKeys);
  const [dragOver, setDragOver] = useState(false);
  const [trackUi, setTrackUi] = useState<Record<string, TrackUi>>({});
  const hasAnyClip = tracks.some((track) => track.clips.length > 0);

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

  const toggleTrackFlag = (trackId: string, key: keyof TrackUi) => {
    setTrackUi((prev) => ({
      ...prev,
      [trackId]: {
        ...(prev[trackId] ?? { mute: false, locked: false, visible: true }),
        [key]: !(prev[trackId]?.[key] ?? false),
      },
    }));
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
          <label>
            Zoom
            <input
              type="range"
              min={20}
              max={240}
              value={pixelsPerSecond}
              onChange={(event) => onZoomChange(Number(event.target.value))}
            />
          </label>
          <label>
            Placement
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
      </div>

      <p className="hint timelineHint">
        Alt temporarily disables snapping ({altSnapDisabled ? "disabled" : "enabled"}).
      </p>

      <div className="timelineScroller">
        <div
          className={`timelineCanvas ${showFilmstrip ? "filmstripOn" : "filmstripOff"} ${dragOver ? "dropActive" : ""}`}
          style={{ width: `${zoomWidthPx}px` }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.max(0, event.clientX - rect.left - 124);
            const nextMs = Math.round((x / pixelsPerSecond) * 1000);
            onPlayheadChange(nextMs);
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
            const x = Math.max(0, event.clientX - rect.left - 124);
            const y = Math.max(0, event.clientY - rect.top);
            const laneIndex = Math.min(tracks.length - 1, Math.max(0, Math.floor(y / 56)));
            const lane = tracks[laneIndex];
            const startMs = Math.round((x / pixelsPerSecond) * 1000);
            if (!lane) return;
            onAssetDrop(assetId, lane.id, startMs);
          }}
        >
          <div className="playhead" style={{ left: `${(playheadMs / 1000) * pixelsPerSecond}px` }} />
          {snapGuideMs != null ? (
            <div className="snapGuide" style={{ left: `${(snapGuideMs / 1000) * pixelsPerSecond}px` }} />
          ) : null}
          {!hasAnyClip ? (
            <div className="timelineEmptyState">
              Drag media from the Media tab to create your first clip.
            </div>
          ) : null}
          {dragOver ? <div className="timelineDropState">Drop to add clip at this position</div> : null}

          {tracks.map((track, rowIndex) => {
            const currentTrackUi = trackUi[track.id] ?? {
              mute: false,
              locked: false,
              visible: true,
            };

            return (
              <div key={track.id} className="trackLane" style={{ top: `${rowIndex * 56}px` }}>
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
                  const isSelected = selected.has(`${track.id}:${sourceClip.id}`);
                  const isPrimary = selection?.trackId === track.id && selection?.clipId === sourceClip.id;

                  return (
                    <button
                      key={sourceClip.id}
                      type="button"
                      className={`clipBlock ${isSelected ? "selected" : ""} ${isPrimary ? "primary" : ""}`}
                      style={{
                        left: `${(clip.startMs / 1000) * pixelsPerSecond}px`,
                        width: `${Math.max(24, (clip.durationMs / 1000) * pixelsPerSecond)}px`,
                        opacity: currentTrackUi.visible ? 1 : 0.25,
                      }}
                      disabled={currentTrackUi.locked}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onClipPointerDown(event, track.id, sourceClip);
                      }}
                    >
                      <span className="clipHandle left" />
                      <span className="clipLabel">{clip.label}</span>
                      <span className="clipHandle right" />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="timelineStatusBar">{statusText}</div>
    </div>
  );
}
