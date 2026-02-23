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
  pixelsPerSecond: number;
  zoomWidthPx: number;
  snapGuideMs: number | null;
  selection: Selection;
  collisionMode: "no-overlap" | "push" | "allow-overlap";
  snapEnabled: boolean;
  snapMs: number;
  onSnapEnabledChange: (value: boolean) => void;
  onSnapMsChange: (value: number) => void;
  onCollisionModeChange: (value: "no-overlap" | "push" | "allow-overlap") => void;
  getClipRenderState: (trackId: string, clip: Clip) => Clip;
  onClipPointerDown: (event: React.PointerEvent<HTMLButtonElement>, trackId: string, clip: Clip) => void;
};

export function TimelinePanel({
  tracks,
  playheadMs,
  pixelsPerSecond,
  zoomWidthPx,
  snapGuideMs,
  selection,
  collisionMode,
  snapEnabled,
  snapMs,
  onSnapEnabledChange,
  onSnapMsChange,
  onCollisionModeChange,
  getClipRenderState,
  onClipPointerDown,
}: TimelinePanelProps) {
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
      </div>

      <div className="timelineScroller">
        <div className="timelineCanvas" style={{ width: `${zoomWidthPx}px` }}>
          <div className="playhead" style={{ left: `${(playheadMs / 1000) * pixelsPerSecond}px` }} />
          {snapGuideMs != null ? (
            <div className="snapGuide" style={{ left: `${(snapGuideMs / 1000) * pixelsPerSecond}px` }} />
          ) : null}

          {tracks.map((track, rowIndex) => (
            <div key={track.id} className="trackLane" style={{ top: `${rowIndex * 56}px` }}>
              <div className="trackLabel">{track.id}</div>
              {track.clips.map((sourceClip) => {
                const clip = getClipRenderState(track.id, sourceClip);
                const isSelected =
                  selection?.trackId === track.id && selection?.clipId === sourceClip.id;

                return (
                  <button
                    key={sourceClip.id}
                    type="button"
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
    </div>
  );
}
