type AboutModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null;

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <section
        className="modalCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="panelHeader">
          <h2 id="about-modal-title">About MAV</h2>
          <p className="hint">Desktop-first online editor: import, edit, export.</p>
        </header>
        <p className="hint">
          Diagnostics and decode QA tooling are available only in developer mode and are hidden from standard
          editing workflows.
        </p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
