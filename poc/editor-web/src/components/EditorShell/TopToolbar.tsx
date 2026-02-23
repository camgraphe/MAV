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
          <span>Project</span>
          <input
            type="text"
            value={projectName}
            onChange={(event) => onProjectNameChange(event.target.value)}
            placeholder="Untitled project"
          />
        </label>
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onLoad}>
          Load
        </button>
      </div>

      <div className="appTopGroup">
        <button type="button" onClick={onUndo}>
          Undo
        </button>
        <button type="button" onClick={onRedo}>
          Redo
        </button>
        <button type="button" className="primaryBtn" onClick={onExport}>
          Export
        </button>
      </div>

      <div className="appTopGroup appTopGroupRight">
        {canShowDiagnostics ? (
          <button type="button" onClick={onToggleDiagnostics}>
            {diagnosticsVisible ? "Hide Diagnostics" : "Diagnostics"}
          </button>
        ) : null}
        <button type="button" aria-label="About MAV" onClick={onOpenAbout}>
          i
        </button>
      </div>
    </div>
  );
}
