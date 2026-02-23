import type { RefObject } from "react";

type PreviewPanelProps = {
  programCanvasRef: RefObject<HTMLCanvasElement | null>;
  programVideoRef: RefObject<HTMLVideoElement | null>;
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  sourceVideoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  onProgramLoadedMetadata: (durationMs: number, width: number, height: number) => void;
  onSourceLoadedMetadata: (durationMs: number) => void;
  playheadMs: number;
  durationMs: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onScrub: (nextMs: number) => void;
  onStepFrame: (direction: "forward" | "backward") => void;
  loopEnabled: boolean;
  onLoopToggle: () => void;
  markInMs: number | null;
  markOutMs: number | null;
  onSetMarkIn: () => void;
  onSetMarkOut: () => void;
  sourcePlayheadMs: number;
  sourceDurationMs: number;
  sourceIsPlaying: boolean;
  onSourceTogglePlay: () => void;
  onSourceScrub: (nextMs: number) => void;
  onSourceStepFrame: (direction: "forward" | "backward") => void;
};

export function PreviewPanel({
  programCanvasRef,
  programVideoRef,
  sourceCanvasRef,
  sourceVideoRef,
  videoUrl,
  onProgramLoadedMetadata,
  onSourceLoadedMetadata,
  playheadMs,
  durationMs,
  isPlaying,
  onTogglePlay,
  onScrub,
  onStepFrame,
  loopEnabled,
  onLoopToggle,
  markInMs,
  markOutMs,
  onSetMarkIn,
  onSetMarkOut,
  sourcePlayheadMs,
  sourceDurationMs,
  sourceIsPlaying,
  onSourceTogglePlay,
  onSourceScrub,
  onSourceStepFrame,
}: PreviewPanelProps) {
  const maxDuration = Math.max(1000, durationMs);
  const sourceMaxDuration = Math.max(1000, sourceDurationMs);

  return (
    <div className="previewPanel">
      <div className="previewMonitors">
        <section className="monitorCard">
          <header className="monitorHeader">
            <h3>Source</h3>
          </header>
          <div className="previewStage">
            <canvas ref={sourceCanvasRef} width={960} height={540} className="previewCanvas" />
          </div>
          <div className="sourceControls">
            <div className="playerButtons">
              <button type="button" className="iconBtn" title="Previous source frame" onClick={() => onSourceStepFrame("backward")}>
                ◀
              </button>
              <button type="button" className="iconBtn iconBtnStrong" title="Play/pause source" onClick={onSourceTogglePlay}>
                {sourceIsPlaying ? "❚❚" : "▶"}
              </button>
              <button type="button" className="iconBtn" title="Next source frame" onClick={() => onSourceStepFrame("forward")}>
                ▶
              </button>
            </div>
            <div className="playerScrubRow">
              <input
                type="range"
                min={0}
                max={sourceMaxDuration}
                value={Math.min(sourceMaxDuration, Math.max(0, sourcePlayheadMs))}
                onChange={(event) => onSourceScrub(Number(event.target.value))}
              />
            </div>
          </div>
        </section>

        <section className="monitorCard">
          <header className="monitorHeader">
            <h3>Program</h3>
          </header>
          <div className="previewStage">
            <canvas ref={programCanvasRef} width={960} height={540} className="previewCanvas" />
          </div>
          <div className="playerControls">
            <div className="playerButtons">
              <button type="button" className="iconBtn" title="Previous frame (J / ←)" onClick={() => onStepFrame("backward")}>
                ◀
              </button>
              <button type="button" className="iconBtn iconBtnStrong" title="Play/Pause (Space/K)" onClick={onTogglePlay}>
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <button type="button" className="iconBtn" title="Next frame (L / →)" onClick={() => onStepFrame("forward")}>
                ▶
              </button>
              <button
                type="button"
                className={`iconBtn ${loopEnabled ? "activeTool" : ""}`}
                title="Loop playback"
                onClick={onLoopToggle}
              >
                ↺
              </button>
              <button type="button" className="iconBtn" title="Mark in (I)" onClick={onSetMarkIn}>
                I
              </button>
              <button type="button" className="iconBtn" title="Mark out (O)" onClick={onSetMarkOut}>
                O
              </button>
            </div>

            <div className="playerScrubRow">
              <input
                type="range"
                min={0}
                max={maxDuration}
                value={Math.min(maxDuration, Math.max(0, playheadMs))}
                onChange={(event) => onScrub(Number(event.target.value))}
              />
            </div>
          </div>
        </section>
      </div>

      <video
        ref={programVideoRef}
        className="hiddenVideo"
        src={videoUrl ?? undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          onProgramLoadedMetadata(
            Math.round(event.currentTarget.duration * 1000),
            event.currentTarget.videoWidth,
            event.currentTarget.videoHeight,
          );
        }}
      />
      <video
        ref={sourceVideoRef}
        className="hiddenVideo"
        src={videoUrl ?? undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          onSourceLoadedMetadata(Math.round(event.currentTarget.duration * 1000));
        }}
      />
    </div>
  );
}
