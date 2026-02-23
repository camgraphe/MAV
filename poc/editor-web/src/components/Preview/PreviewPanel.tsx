import type { RefObject } from "react";

type PreviewPanelProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  fallbackVideoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  onLoadedMetadata: (durationMs: number, width: number, height: number) => void;
  playheadMs: number;
  durationMs: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onScrub: (nextMs: number) => void;
};

function formatTimecode(ms: number) {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  const millis = (safe % 1000).toString().padStart(3, "0");
  return `${mins}:${secs}.${millis}`;
}

export function PreviewPanel({
  canvasRef,
  fallbackVideoRef,
  videoUrl,
  onLoadedMetadata,
  playheadMs,
  durationMs,
  isPlaying,
  onTogglePlay,
  onScrub,
}: PreviewPanelProps) {
  const maxDuration = Math.max(1000, durationMs);

  return (
    <div className="previewPanel">
      <div className="panelHeader">
        <h2>Player</h2>
      </div>

      <canvas ref={canvasRef} width={960} height={540} className="previewCanvas" />

      <video
        ref={fallbackVideoRef}
        className="hiddenVideo"
        src={videoUrl ?? undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          onLoadedMetadata(
            Math.round(event.currentTarget.duration * 1000),
            event.currentTarget.videoWidth,
            event.currentTarget.videoHeight,
          );
        }}
      />

      <div className="playerControls">
        <button type="button" onClick={onTogglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={maxDuration}
          value={Math.min(maxDuration, Math.max(0, playheadMs))}
          onChange={(event) => onScrub(Number(event.target.value))}
        />
        <span className="timecode">
          {formatTimecode(playheadMs)} / {formatTimecode(maxDuration)}
        </span>
      </div>
    </div>
  );
}
