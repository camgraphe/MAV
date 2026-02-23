type ExportJobState = {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  progress: number;
  attempts?: number;
  outputUrl?: string;
  error?: string;
};

type ExportModalProps = {
  open: boolean;
  busy: boolean;
  job: ExportJobState | null;
  preset: "720p" | "1080p";
  fps: 24 | 30 | 60;
  onPresetChange: (value: "720p" | "1080p") => void;
  onFpsChange: (value: 24 | 30 | 60) => void;
  onClose: () => void;
  onStart: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDownload: () => void;
};

export function ExportModal({
  open,
  busy,
  job,
  preset,
  fps,
  onPresetChange,
  onFpsChange,
  onClose,
  onStart,
  onCancel,
  onRetry,
  onDownload,
}: ExportModalProps) {
  if (!open) return null;

  const canCancel = job?.status === "queued" || job?.status === "running";
  const canRetry = job?.status === "failed" || job?.status === "canceled";
  const canDownload = job?.status === "completed" && Boolean(job.outputUrl);

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <section
        className="modalCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="panelHeader">
          <h2 id="export-modal-title">Export MP4</h2>
          <p className="hint">Server-side render worker (H.264/AAC preset).</p>
        </header>

        <div className="exportSettings">
          <label>
            Preset
            <select value={preset} onChange={(event) => onPresetChange(event.target.value as "720p" | "1080p")}>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
          <label>
            FPS
            <select value={fps} onChange={(event) => onFpsChange(Number(event.target.value) as 24 | 30 | 60)}>
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
          <label>
            Format
            <input type="text" value="MP4 (H.264/AAC)" readOnly />
          </label>
        </div>

        <div className="exportStatus">
          <p>
            Job: <strong>{job?.jobId ?? "none"}</strong>
          </p>
          <p>
            Status: <strong>{job?.status ?? "idle"}</strong>
          </p>
          <p>
            Progress: <strong>{Math.max(0, Math.min(100, Math.round(job?.progress ?? 0)))}%</strong>
          </p>
          {typeof job?.attempts === "number" ? (
            <p>
              Attempts: <strong>{job.attempts}</strong>
            </p>
          ) : null}
          {job?.error ? <p className="hint">Error: {job.error}</p> : null}
        </div>

        <div className="buttons">
          <button type="button" disabled={busy || canCancel} onClick={onStart}>
            Start Export
          </button>
          <button type="button" disabled={busy || !canCancel} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={busy || !canRetry} onClick={onRetry}>
            Retry
          </button>
          <button type="button" disabled={!canDownload} onClick={onDownload}>
            Download
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
