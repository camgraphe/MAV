type TopToolbarProps = {
  projectName: string;
  onProjectNameChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onSave: () => void;
  onLoad: () => void;
  onOpenAbout: () => void;
  canShowDiagnostics: boolean;
  diagnosticsVisible: boolean;
  onToggleDiagnostics: () => void;
};

export function TopToolbar({
  projectName,
  onProjectNameChange,
  onUndo,
  onRedo,
  onExport,
  onSave,
  onLoad,
  onOpenAbout,
  canShowDiagnostics,
  diagnosticsVisible,
  onToggleDiagnostics,
}: TopToolbarProps) {
  return (
    <div className="appTopBar">
      <div className="appTopGroup">
        <label className="projectNameInput">
          <span>🎬</span>
          <input
            type="text"
            value={projectName}
            onChange={(event) => onProjectNameChange(event.target.value)}
            placeholder="Untitled project"
          />
        </label>
        <button type="button" className="iconBtn" title="Save project" aria-label="Save project" onClick={onSave}>
          💾
        </button>
        <button type="button" className="iconBtn" title="Load project" aria-label="Load project" onClick={onLoad}>
          📂
        </button>
      </div>

      <div className="appTopGroup">
        <button type="button" className="iconBtn" title="Undo" aria-label="Undo" onClick={onUndo}>
          ↶
        </button>
        <button type="button" className="iconBtn" title="Redo" aria-label="Redo" onClick={onRedo}>
          ↷
        </button>
        <button type="button" className="primaryBtn iconBtn iconBtnWithLabel" onClick={onExport}>
          <span aria-hidden>⤴</span>
          <span>Export</span>
        </button>
      </div>

      <div className="appTopGroup appTopGroupRight">
        {canShowDiagnostics ? (
          <button
            type="button"
            className={`iconBtn ${diagnosticsVisible ? "activeTool" : ""}`}
            title={diagnosticsVisible ? "Hide diagnostics" : "Show diagnostics"}
            aria-label={diagnosticsVisible ? "Hide diagnostics" : "Show diagnostics"}
            onClick={onToggleDiagnostics}
          >
            🧪
          </button>
        ) : null}
        <button type="button" className="iconBtn" aria-label="About MAV" title="About MAV" onClick={onOpenAbout}>
          ⓘ
        </button>
      </div>
    </div>
  );
}
