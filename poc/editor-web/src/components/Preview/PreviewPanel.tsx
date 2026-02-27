import type { DragEvent, RefObject } from "react";

type PreviewPanelProps = {
  programCanvasRef: RefObject<HTMLCanvasElement | null>;
  programVideoARef: RefObject<HTMLVideoElement | null>;
  programVideoBRef: RefObject<HTMLVideoElement | null>;
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  sourceVideoRef: RefObject<HTMLVideoElement | null>;
  sourceVideoUrl: string | null;
  programMuted: boolean;
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
  monitorMode: "program" | "source";
  onMonitorModeChange: (mode: "program" | "source") => void;
  onSourceTogglePlay: () => void;
  sourceRangeInMs: number | null;
  sourceRangeOutMs: number | null;
  onSetSourceIn: () => void;
  onSetSourceOut: () => void;
  onClearSourceRange: () => void;
  onInsertFromSource: () => void;
  onOverwriteFromSource: () => void;
  onAppendFromSource: () => void;
  onSourceRangeDragStart: (event: DragEvent<HTMLElement>) => void;
  onSourceScrub: (nextMs: number) => void;
  onSourceStepFrame: (direction: "forward" | "backward") => void;
  intentOverlay: { title: string; status: string; progressPct: number } | null;
  debugLines?: string[];
};

function formatClock(ms: number) {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  const milliseconds = (safe % 1000).toString().padStart(3, "0");
  return `${minutes}:${seconds}.${milliseconds}`;
}

export function PreviewPanel({
  programCanvasRef,
  programVideoARef,
  programVideoBRef,
  sourceCanvasRef,
  sourceVideoRef,
  sourceVideoUrl,
  programMuted,
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
  monitorMode,
  onMonitorModeChange,
  onSourceTogglePlay,
  sourceRangeInMs,
  sourceRangeOutMs,
  onSetSourceIn,
  onSetSourceOut,
  onClearSourceRange,
  onInsertFromSource,
  onOverwriteFromSource,
  onAppendFromSource,
  onSourceRangeDragStart,
  onSourceScrub,
  onSourceStepFrame,
  intentOverlay,
  debugLines = [],
}: PreviewPanelProps) {
  const showSourceMonitor = monitorMode === "source";
  const maxDuration = Math.max(1000, durationMs);
  const sourceMaxDuration = Math.max(1000, sourceDurationMs);
  const sourceIn = sourceRangeInMs == null ? 0 : sourceRangeInMs;
  const sourceOut = sourceRangeOutMs == null ? sourceMaxDuration : sourceRangeOutMs;
  const sourceRangeDuration = Math.max(0, sourceOut - sourceIn);
  const sourceInPct = Math.max(0, Math.min(100, (sourceIn / sourceMaxDuration) * 100));
  const sourceOutPct = Math.max(0, Math.min(100, (sourceOut / sourceMaxDuration) * 100));
  const sourceRangeStartPct = Math.min(sourceInPct, sourceOutPct);
  const sourceRangeWidthPct = Math.max(0.35, Math.abs(sourceOutPct - sourceInPct));

  return (
    <div className="previewPanel">
      <div className="previewMonitors programOnly">
        <section className="monitorCard">
          <header className="monitorHeader monitorHeaderTabs">
            <div className="monitorModeSwitch" role="tablist" aria-label="Monitor view">
              <button
                type="button"
                role="tab"
                aria-selected={!showSourceMonitor}
                className={`monitorTabBtn ${!showSourceMonitor ? "active" : ""}`}
                title="Afficher Program"
                onClick={() => onMonitorModeChange("program")}
              >
                Program
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showSourceMonitor}
                className={`monitorTabBtn ${showSourceMonitor ? "active" : ""}`}
                title="Afficher Source"
                onClick={() => onMonitorModeChange("source")}
              >
                Source
              </button>
            </div>
          </header>
          <div
            className="previewStage"
            draggable={showSourceMonitor}
            onDragStart={showSourceMonitor ? onSourceRangeDragStart : undefined}
            title={showSourceMonitor ? "Drag source range to timeline" : undefined}
          >
            {showSourceMonitor ? (
              <canvas ref={sourceCanvasRef} width={960} height={540} className="previewCanvas" />
            ) : (
              <canvas ref={programCanvasRef} width={960} height={540} className="previewCanvas" />
            )}
            {!showSourceMonitor && intentOverlay ? (
              <div className="intentProgramOverlay">
                <strong>{intentOverlay.title || "Intent block"}</strong>
                <span>Status: {intentOverlay.status}</span>
                <span>Progress: {Math.max(0, Math.min(100, Math.round(intentOverlay.progressPct)))}%</span>
              </div>
            ) : null}
            {debugLines.length > 0 ? (
              <div className="previewDebugOverlay">
                {debugLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            ) : null}
          </div>
          {showSourceMonitor ? (
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
                <button type="button" className="iconBtn" title="Mark source In (I)" onClick={onSetSourceIn}>
                  I
                </button>
                <button type="button" className="iconBtn" title="Mark source Out (O)" onClick={onSetSourceOut}>
                  O
                </button>
                <button type="button" className="iconBtn" title="Clear source In/Out" onClick={onClearSourceRange}>
                  ⨯
                </button>
              </div>
              <div className="playerScrubRow sourceScrubRow">
                <div
                  className="sourceRangeTrack"
                  draggable
                  onDragStart={onSourceRangeDragStart}
                  title="Drag selected source range to timeline"
                >
                  <input
                    type="range"
                    min={0}
                    max={sourceMaxDuration}
                    value={Math.min(sourceMaxDuration, Math.max(0, sourcePlayheadMs))}
                    onChange={(event) => onSourceScrub(Number(event.target.value))}
                  />
                  <div className="sourceRangeOverlay" aria-hidden>
                    <span
                      className="sourceRangeWindow"
                      style={{
                        left: `${sourceRangeStartPct}%`,
                        width: `${Math.min(100 - sourceRangeStartPct, sourceRangeWidthPct)}%`,
                      }}
                    />
                    {sourceRangeInMs != null ? (
                      <span className="sourceRangeMarker in" style={{ left: `${sourceInPct}%` }}>
                        I
                      </span>
                    ) : null}
                    {sourceRangeOutMs != null ? (
                      <span className="sourceRangeMarker out" style={{ left: `${sourceOutPct}%` }}>
                        O
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="sourceRangeMeta">
                <span>IN {formatClock(sourceIn)}</span>
                <span>OUT {formatClock(sourceOut)}</span>
                <span>DUR {formatClock(sourceRangeDuration)}</span>
              </div>
              <div className="sourceEditActions">
                <button type="button" className="iconBtn iconBtnStrong" title="Insert at playhead (,)" onClick={onInsertFromSource}>
                  Insert
                </button>
                <button type="button" className="iconBtn" title="Overwrite at playhead (.)" onClick={onOverwriteFromSource}>
                  Overwrite
                </button>
                <button type="button" className="iconBtn" title="Append to end" onClick={onAppendFromSource}>
                  Append
                </button>
              </div>
            </div>
          ) : (
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
          )}
        </section>
      </div>

      <video
        ref={programVideoARef}
        className="hiddenVideo"
        muted={programMuted}
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
        ref={programVideoBRef}
        className="hiddenVideo"
        muted={programMuted}
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
        src={sourceVideoUrl ?? undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          onSourceLoadedMetadata(Math.round(event.currentTarget.duration * 1000));
        }}
      />
    </div>
  );
}
