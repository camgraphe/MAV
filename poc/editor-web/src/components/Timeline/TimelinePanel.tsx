import type React from "react";

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

type TimelinePanelProps = {
  tracks: Track[];
  playheadMs: number;
  onPlayheadChange: (value: number) => void;
  pixelsPerSecond: number;
  zoomWidthPx: number;
  snapGuideMs: number | null;
  selection: Selection;
  selectedClipKeys: string[];
  collisionMode: "no-overlap" | "push" | "allow-overlap";
  rippleMode: "none" | "ripple-delete";
  snapEnabled: boolean;
  altSnapDisabled: boolean;
  snapMs: number;
  onSnapEnabledChange: (value: boolean) => void;
  onSnapMsChange: (value: number) => void;
  onCollisionModeChange: (value: "no-overlap" | "push" | "allow-overlap") => void;
  onRippleModeChange: (value: "none" | "ripple-delete") => void;
  getClipRenderState: (trackId: string, clip: Clip) => Clip;
  onClipPointerDown: (event: React.PointerEvent<HTMLButtonElement>, trackId: string, clip: Clip) => void;
  onAssetDrop: (assetId: string, trackId: string, startMs: number) => void;
};

export function TimelinePanel({
  tracks,
  playheadMs,
  onPlayheadChange,
  pixelsPerSecond,
  zoomWidthPx,
  snapGuideMs,
  selection,
  selectedClipKeys,
  collisionMode,
  rippleMode,
  snapEnabled,
  altSnapDisabled,
  snapMs,
  onSnapEnabledChange,
  onSnapMsChange,
  onCollisionModeChange,
  onRippleModeChange,
  getClipRenderState,
  onClipPointerDown,
  onAssetDrop,
}: TimelinePanelProps) {
  const selected = new Set(selectedClipKeys);

  return (
    <div>
      <div className="panelHeader">
        <h2>Timeline</h2>
        <p className="hint">Pointer capture + lane drag/resize + collision modes.</p>
      </div>

      <div className="toggles timelineToggles">
        <label>
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(event) => onSnapEnabledChange(event.target.checked)}
          />
          Snap
        </label>
        <span className="hint">Alt temporarily disables snapping ({altSnapDisabled ? "off" : "on"}).</span>
        <label>
          Snap ms
          <input
            type="number"
            min={1}
            value={snapMs}
            onChange={(event) => onSnapMsChange(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <label>
          Collision
          <select
            value={collisionMode}
            onChange={(event) => onCollisionModeChange(event.target.value as "no-overlap" | "push" | "allow-overlap")}
          >
            <option value="no-overlap">No overlap</option>
            <option value="push">Push forward</option>
            <option value="allow-overlap">Allow overlap</option>
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

      <div className="timelineScroller">
        <div
          className="timelineCanvas"
          style={{ width: `${zoomWidthPx}px` }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.max(0, event.clientX - rect.left - 88);
            const nextMs = Math.round((x / pixelsPerSecond) * 1000);
            onPlayheadChange(nextMs);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const assetId =
              event.dataTransfer.getData("text/x-mav-asset-id") || event.dataTransfer.getData("text/plain");
            if (!assetId) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.max(0, event.clientX - rect.left - 88);
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

          {tracks.map((track, rowIndex) => (
            <div key={track.id} className="trackLane" style={{ top: `${rowIndex * 56}px` }}>
              <div className="trackLabel">{track.id}</div>
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
    </div>
  );
}
