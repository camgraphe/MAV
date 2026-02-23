type QAMetric = {
  runAt: string;
  profile: string;
  totalScenarios: number;
  time_to_first_frame_ms: number;
  seek_success_pct: number;
  decode_errors: number;
  stale_results: number;
  drift_within_1frame_pct: number;
  avg_drift_ms: number;
  max_drift_ms: number;
};

type DecodeQaRunResult = {
  metric: QAMetric | null;
  diagnostics: unknown;
};

type DiagnosticsPanelProps = {
  decoderLogs: string[];
  timestampAuditSamples: number;
  onTimestampAuditSamplesChange: (value: number) => void;
  qaProfile: string;
  onQaProfileChange: (value: string) => void;
  qaScenarioCount: number;
  onQaScenarioCountChange: (value: number) => void;
  qaRunning: boolean;
  canRunQa: boolean;
  onRunQa: () => void;
  onExportLastResult: () => void;
  qaMetric: QAMetric | null;
  qaHistory: QAMetric[];
  lastRunResult: DecodeQaRunResult | null;
  projectSchemaSummary: unknown;
  projectJson: unknown;
};

export function DiagnosticsPanel({
  decoderLogs,
  timestampAuditSamples,
  onTimestampAuditSamplesChange,
  qaProfile,
  onQaProfileChange,
  qaScenarioCount,
  onQaScenarioCountChange,
  qaRunning,
  canRunQa,
  onRunQa,
  onExportLastResult,
  qaMetric,
  qaHistory,
  lastRunResult,
  projectSchemaSummary,
  projectJson,
}: DiagnosticsPanelProps) {
  return (
    <div className="diagnosticsLayout">
      <section className="panel diagnosticsCard">
        <h2>Diagnostics</h2>
        <p className="hint">Decode logs, timestamp audit, QA harness and raw JSON live here.</p>
        <label>
          Timestamp audit samples
          <input
            type="number"
            min={0}
            max={64}
            value={timestampAuditSamples}
            onChange={(event) =>
              onTimestampAuditSamplesChange(Math.max(0, Math.min(64, Number(event.target.value) || 0)))
            }
          />
        </label>
        <pre>{decoderLogs.join("\n") || "Decoder logs will appear here."}</pre>
      </section>

      <section className="panel diagnosticsCard">
        <h2>Decode QA Harness</h2>
        <div className="toggles">
          <label>
            Curated profile
            <select id="decode-qa-profile" value={qaProfile} onChange={(event) => onQaProfileChange(event.target.value)}>
              <option value="baseline-short-gop">Baseline / short GOP / AAC</option>
              <option value="main-long-gop">Main / long GOP / AAC</option>
              <option value="high-long-gop">High / long GOP / AAC</option>
              <option value="no-audio">No audio track</option>
              <option value="fmp4">Fragmented MP4 (fMP4)</option>
            </select>
          </label>
          <label>
            Scenarios
            <input
              id="decode-qa-scenarios"
              type="number"
              min={10}
              max={200}
              value={qaScenarioCount}
              onChange={(event) => onQaScenarioCountChange(Number(event.target.value) || 50)}
            />
          </label>
          <button id="decode-qa-run" disabled={qaRunning || !canRunQa} onClick={onRunQa}>
            {qaRunning ? "Running..." : "Run Decode QA"}
          </button>
          <button disabled={!lastRunResult} onClick={onExportLastResult}>
            Export Last Result JSON
          </button>
        </div>

        {qaMetric ? (
          <pre data-testid="decode-qa-metric">{JSON.stringify(qaMetric, null, 2)}</pre>
        ) : (
          <p className="hint">Run QA after loading a video to populate metrics.</p>
        )}

        {lastRunResult?.diagnostics ? <pre>{JSON.stringify(lastRunResult.diagnostics, null, 2)}</pre> : null}
        <pre>{JSON.stringify(qaHistory, null, 2)}</pre>
      </section>

      <section className="panel diagnosticsCard">
        <h2>Schema Loaded</h2>
        <pre>{JSON.stringify(projectSchemaSummary, null, 2)}</pre>
      </section>

      <section className="panel diagnosticsCard">
        <h2>Project JSON</h2>
        <pre>{JSON.stringify(projectJson, null, 2)}</pre>
      </section>
    </div>
  );
}
