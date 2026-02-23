import type { RefObject } from "react";

type PreviewPanelProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  fallbackVideoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  onLoadedMetadata: (durationMs: number) => void;
  decoderMode: "none" | "webcodecs" | "fallback";
  webCodecsAvailable: boolean;
  sourceDetails: {
    codec: string | null;
    codedWidth: number | null;
    codedHeight: number | null;
    descriptionLength: number | null;
    timestampAuditIssueCount: number | null;
  };
  isFmp4Source: boolean;
};

export function PreviewPanel({
  canvasRef,
  fallbackVideoRef,
  videoUrl,
  onLoadedMetadata,
  decoderMode,
  webCodecsAvailable,
  sourceDetails,
  isFmp4Source,
}: PreviewPanelProps) {
  return (
    <div>
      <div className="panelHeader">
        <h2>Preview</h2>
      </div>

      <canvas ref={canvasRef} width={960} height={540} className="previewCanvas" />

      <video
        ref={fallbackVideoRef}
        className="hiddenVideo"
        src={videoUrl ?? undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          onLoadedMetadata(Math.round(event.currentTarget.duration * 1000));
        }}
      />

      <p className="hint">
        Mode: <strong>{decoderMode}</strong>. WebCodecs available: <strong>{webCodecsAvailable ? "yes" : "no"}</strong>
      </p>
      <p className="hint">
        Source: codec=<strong>{sourceDetails.codec ?? "n/a"}</strong>, coded=
        <strong>
          {sourceDetails.codedWidth ?? 0}x{sourceDetails.codedHeight ?? 0}
        </strong>
        , avcC bytes=<strong>{sourceDetails.descriptionLength ?? 0}</strong>, timestamp issues=
        <strong>{sourceDetails.timestampAuditIssueCount ?? 0}</strong>
      </p>
      {isFmp4Source ? (
        <p className="hint">
          fMP4 detected: preview forced to HTMLVideoElement + RVFC fallback path.
        </p>
      ) : null}
    </div>
  );
}
