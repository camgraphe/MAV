type ExportJobState = {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  progress: number;
  attempts?: number;
  renderOptions?: {
    preset: "720p" | "1080p";
    fps: 24 | 30 | 60;
    format: "mp4";
  };
  sourceAssetCount?: number;
  createdAt?: string;
  updatedAt?: string;
  outputUrl?: string;
  error?: string;
};

type ExportModalProps = {
  open: boolean;
  busy: boolean;
  job: ExportJobState | null;
  history: ExportJobState[];
  canStart: boolean;
  validationMessage: string | null;
  preset: "720p" | "1080p";
  fps: 24 | 30 | 60;
  onPresetChange: (value: "720p" | "1080p") => void;
  onFpsChange: (value: 24 | 30 | 60) => void;
  onClose: () => void;
  onStart: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDownload: () => void;
  previewOnlyVisualWarning?: boolean;
};

export function ExportModal({
  open,
  busy,
  job,
  history,
  canStart,
  validationMessage,
  preset,
  fps,
  onPresetChange,
  onFpsChange,
  onClose,
  onStart,
  onCancel,
  onRetry,
  onDownload,
  previewOnlyVisualWarning = false,
}: ExportModalProps) {
  if (!open) return null;

  const canCancel = job?.status === "queued" || job?.status === "running";
  const canRetry = job?.status === "failed" || job?.status === "canceled";
  const canDownload = job?.status === "completed" && Boolean(job.outputUrl);
  const progress = Math.max(0, Math.min(100, Math.round(job?.progress ?? 0)));

  const statusLabel = (() => {
    if (!job) return "Idle";
    if (job.status === "queued") return "Queued";
    if (job.status === "running") return "Rendering";
    if (job.status === "completed") return "Completed";
    if (job.status === "failed") return "Failed";
    if (job.status === "canceled") return "Canceled";
    return job.status;
  })();

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
            Status: <strong>{statusLabel}</strong>
          </p>
          <p>
            Progress: <strong>{progress}%</strong>
          </p>
          <div className="exportProgress">
            <span style={{ width: `${progress}%` }} />
          </div>
          {job?.renderOptions ? (
            <p>
              Output:{" "}
              <strong>
                {job.renderOptions.preset} · {job.renderOptions.fps}fps · {job.renderOptions.format.toUpperCase()}
              </strong>
            </p>
          ) : null}
          {typeof job?.sourceAssetCount === "number" ? (
            <p>
              Source assets: <strong>{job.sourceAssetCount}</strong>
            </p>
          ) : null}
          {typeof job?.attempts === "number" ? (
            <p>
              Attempts: <strong>{job.attempts}</strong>
            </p>
          ) : null}
          {job?.error ? <p className="hint">Error: {job.error}</p> : null}
        </div>

        <div className="buttons">
          <button type="button" disabled={busy || canCancel || !canStart} onClick={onStart}>
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

        {!canStart || validationMessage ? (
          <p className="hint">
            {validationMessage ?? "You need at least one clip in the timeline to export."}
          </p>
        ) : null}
        {previewOnlyVisualWarning ? (
          <p className="hint">
            Export currently ignores transform/opacity settings (preview-only).
          </p>
        ) : null}

        {history.length > 0 ? (
          <div className="exportHistory">
            <h3>Recent Jobs</h3>
            <ul>
              {history.map((entry) => (
                <li key={entry.jobId}>
                  <span>{entry.jobId}</span>
                  <span>{entry.status}</span>
                  <span>{Math.round(entry.progress)}%</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
