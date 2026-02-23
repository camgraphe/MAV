type TopToolbarProps = {
  playheadMs: number;
  maxPlayheadMs: number;
  onPlayheadChange: (value: number) => void;
  pixelsPerSecond: number;
  onZoomChange: (value: number) => void;
  onSplit: () => void;
  onAddOverlay: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onSave: () => void;
  onLoad: () => void;
};

export function TopToolbar({
  playheadMs,
  maxPlayheadMs,
  onPlayheadChange,
  pixelsPerSecond,
  onZoomChange,
  onSplit,
  onAddOverlay,
  onUndo,
  onRedo,
  onExport,
  onSave,
  onLoad,
}: TopToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbarMain">
        <h1>MAV Editor</h1>
        <p className="hint">Browser timeline editing with deterministic WebCodecs QA retained.</p>
      </div>

      <div className="toolbarControls">
        <label className="toolbarSlider" htmlFor="playhead">
          Playhead: {playheadMs} ms
          <input
            id="playhead"
            type="range"
            min={0}
            max={maxPlayheadMs}
            value={playheadMs}
            onChange={(event) => onPlayheadChange(Number(event.target.value))}
          />
        </label>

        <label className="toolbarSlider" htmlFor="zoom">
          Zoom: {pixelsPerSecond} px/s
          <input
            id="zoom"
            type="range"
            min={20}
            max={240}
            value={pixelsPerSecond}
            onChange={(event) => onZoomChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="toolbarActions buttons">
        <button type="button" onClick={onUndo}>
          Undo
        </button>
        <button type="button" onClick={onRedo}>
          Redo
        </button>
        <button type="button" onClick={onSplit}>
          Split
        </button>
        <button type="button" onClick={onAddOverlay}>
          Add Overlay
        </button>
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onLoad}>
          Load
        </button>
        <button type="button" onClick={onExport}>
          Export
        </button>
      </div>
    </div>
  );
}
