type ClipFitMode = "pixel-100" | "adapt";
type ClipRole = "video" | "audio" | "overlay";

type ClipVisual = {
  x: number;
  y: number;
  scalePct: number;
  rotationDeg: number;
  opacityPct: number;
  fitMode: ClipFitMode;
};

type Clip = {
  id: string;
  label: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  visual?: ClipVisual;
};

type InspectorPanelProps = {
  selectedClip: Clip | null;
  selectedClipRole: ClipRole | null;
  selectedCount?: number;
  onUpdateTiming: (patch: Partial<Pick<Clip, "startMs" | "durationMs" | "inMs" | "outMs">>) => void;
  onUpdateVisual: (patch: Partial<ClipVisual>) => void;
  onResetVisual: () => void;
  onAdaptToFrame: () => void;
};

export function InspectorPanel({
  selectedClip,
  selectedClipRole,
  selectedCount = 0,
  onUpdateTiming,
  onUpdateVisual,
  onResetVisual,
  onAdaptToFrame,
}: InspectorPanelProps) {
  const visual = selectedClip?.visual;
  const isAudio = selectedClipRole === "audio";

  return (
    <div className="inspector">
      <div className="panelHeader">
        <h2>Inspector</h2>
      </div>

      {!selectedClip ? (
        <div className="inspectorEmptyState">
          <p className="hint">Select a clip to edit properties.</p>
          <p className="hint">Quick start checklist:</p>
          <ul>
            <li>Upload media in the Media tab.</li>
            <li>Drag an asset into the timeline.</li>
            <li>Use `S` to split and `Delete` to remove clips.</li>
            <li>Press `Space` to play or pause preview.</li>
          </ul>
        </div>
      ) : null}
      {selectedCount > 1 ? <p className="hint">{selectedCount} clips selected (editing primary selection).</p> : null}

      {selectedClip ? (
        <>
          <p className="hint">Clip: {selectedClip.label}</p>

          <h3>Timing</h3>
          <div className="transformGrid">
            <label>
              Start (ms)
              <input
                type="number"
                value={selectedClip.startMs}
                onChange={(event) => onUpdateTiming({ startMs: Number(event.target.value) })}
              />
            </label>
            <label>
              Duration (ms)
              <input
                type="number"
                min={100}
                value={selectedClip.durationMs}
                onChange={(event) => onUpdateTiming({ durationMs: Number(event.target.value) })}
              />
            </label>
            <label>
              In (ms)
              <input
                type="number"
                value={selectedClip.inMs}
                onChange={(event) => onUpdateTiming({ inMs: Number(event.target.value) })}
              />
            </label>
            <label>
              Out (ms)
              <input
                type="number"
                value={selectedClip.outMs}
                onChange={(event) => onUpdateTiming({ outMs: Number(event.target.value) })}
              />
            </label>
          </div>

          {isAudio ? (
            <p className="hint">No visual properties for audio clips.</p>
          ) : (
            <>
              <h3>Transform</h3>
              <div className="transformGrid">
                <label>
                  X
                  <input
                    type="number"
                    value={visual?.x ?? 0}
                    onChange={(event) => onUpdateVisual({ x: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Y
                  <input
                    type="number"
                    value={visual?.y ?? 0}
                    onChange={(event) => onUpdateVisual({ y: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Scale (%)
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={visual?.scalePct ?? 100}
                    onChange={(event) => onUpdateVisual({ scalePct: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Rotation (deg)
                  <input
                    type="number"
                    value={visual?.rotationDeg ?? 0}
                    onChange={(event) => onUpdateVisual({ rotationDeg: Number(event.target.value) })}
                  />
                </label>
              </div>

              <h3>Opacity</h3>
              <div className="transformGrid">
                <label>
                  Opacity (%)
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={visual?.opacityPct ?? 100}
                    onChange={(event) => onUpdateVisual({ opacityPct: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Value
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={visual?.opacityPct ?? 100}
                    onChange={(event) => onUpdateVisual({ opacityPct: Number(event.target.value) })}
                  />
                </label>
              </div>

              <h3>Fit</h3>
              <div className="inspectorFitRow">
                <button
                  type="button"
                  className={`iconBtn tiny ${(visual?.fitMode ?? "pixel-100") === "pixel-100" ? "activeTool" : ""}`}
                  onClick={() => onUpdateVisual({ fitMode: "pixel-100" })}
                >
                  Pixel 100
                </button>
                <button
                  type="button"
                  className={`iconBtn tiny ${(visual?.fitMode ?? "pixel-100") === "adapt" ? "activeTool" : ""}`}
                  onClick={() => onUpdateVisual({ fitMode: "adapt" })}
                >
                  Adapt
                </button>
                <button type="button" className="iconBtn tiny" onClick={onAdaptToFrame}>
                  Adapt to Frame
                </button>
                <button type="button" className="iconBtn tiny" onClick={onResetVisual}>
                  Reset
                </button>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
