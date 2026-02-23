type OverlayTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

type Clip = {
  id: string;
  label: string;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  transform?: OverlayTransform;
};

type InspectorPanelProps = {
  selectedClip: Clip | null;
  onUpdateTiming: (patch: Partial<Pick<Clip, "startMs" | "durationMs" | "inMs" | "outMs">>) => void;
  onUpdateTransform: (patch: Partial<OverlayTransform>) => void;
};

export function InspectorPanel({ selectedClip, onUpdateTiming, onUpdateTransform }: InspectorPanelProps) {
  return (
    <div className="inspector">
      <div className="panelHeader">
        <h2>Inspector</h2>
      </div>

      {!selectedClip ? <p className="hint">Select a clip to edit properties.</p> : null}

      {selectedClip ? (
        <>
          <p className="hint">Clip: {selectedClip.label}</p>

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

          {selectedClip.transform ? (
            <>
              <h3>Overlay Transform</h3>
              <div className="transformGrid">
                <label>
                  X
                  <input
                    type="number"
                    value={selectedClip.transform.x}
                    onChange={(event) => onUpdateTransform({ x: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Y
                  <input
                    type="number"
                    value={selectedClip.transform.y}
                    onChange={(event) => onUpdateTransform({ y: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Scale
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={selectedClip.transform.scale}
                    onChange={(event) =>
                      onUpdateTransform({ scale: Math.max(0.1, Number(event.target.value)) })
                    }
                  />
                </label>
                <label>
                  Rotation
                  <input
                    type="number"
                    value={selectedClip.transform.rotation}
                    onChange={(event) => onUpdateTransform({ rotation: Number(event.target.value) })}
                  />
                </label>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
