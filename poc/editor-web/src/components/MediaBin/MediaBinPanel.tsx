type MediaAsset = {
  id: string;
  kind: "video" | "audio" | "image";
  url: string;
  durationMs?: number;
  name?: string;
  codec?: string;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  thumbnails?: string[];
  waveform?: number[];
};

type MediaBinPanelProps = {
  assets: MediaAsset[];
  activeAssetId: string | null;
  onUpload: (file: File | null) => void;
  onActivateAsset: (assetId: string) => void;
  onAddToTimeline: (assetId: string) => void;
  onAssetDragStart?: (assetId: string) => void;
};

function formatDuration(ms?: number) {
  if (!ms || ms <= 0) return "--";
  const total = Math.round(ms / 1000);
  const mins = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatResolution(width?: number, height?: number) {
  if (!width || !height) return "--";
  return `${width}x${height}`;
}

export function MediaBinPanel({
  assets,
  activeAssetId,
  onUpload,
  onActivateAsset,
  onAddToTimeline,
  onAssetDragStart,
}: MediaBinPanelProps) {
  const videoAssets = assets.filter((asset) => asset.kind === "video");

  return (
    <div className="mediaBin">
      <div className="panelHeader">
        <h2>Media</h2>
      </div>

      <label className="mediaUpload" htmlFor="decode-input-file">
        Upload MP4 / video
        <input
          id="decode-input-file"
          type="file"
          accept="video/mp4,video/*"
          onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
        />
      </label>

      <div className="assetList">
        {videoAssets.length === 0 ? (
          <div className="assetEmptyState">
            <p className="hint">Upload a video to start, then drag it to the timeline.</p>
            <p className="hint">Tip: click Add for quick insertion on the main track.</p>
          </div>
        ) : null}

        {videoAssets.map((asset) => {
          const active = asset.id === activeAssetId;
          return (
            <article
              key={asset.id}
              className={`assetCard ${active ? "active" : ""}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/x-mav-asset-id", asset.id);
                event.dataTransfer.setData("text/plain", asset.id);
                event.dataTransfer.effectAllowed = "copy";
                onAssetDragStart?.(asset.id);
              }}
            >
              <div className="assetThumb">MP4</div>
              <div className="assetMeta">
                <strong title={asset.name}>{asset.name ?? asset.id}</strong>
                <span>{formatDuration(asset.durationMs)}</span>
                <span>{asset.codec ?? "unknown codec"}</span>
                <span>{formatResolution(asset.width, asset.height)}</span>
                <span className="assetHint">Drag to timeline</span>
              </div>
              <div className="assetActions">
                <button type="button" className="iconBtn" title="Open in player" onClick={() => onActivateAsset(asset.id)}>
                  ▶
                </button>
                <button type="button" className="iconBtn" title="Add to timeline" onClick={() => onAddToTimeline(asset.id)}>
                  +
                </button>
              </div>
              {asset.thumbnails && asset.thumbnails.length > 0 ? (
                <div className="assetStrip">
                  {asset.thumbnails.slice(0, 6).map((thumb, index) => (
                    <img key={`${asset.id}-${index}`} src={thumb} alt="" loading="lazy" />
                  ))}
                </div>
              ) : null}
              {asset.waveform && asset.waveform.length > 0 ? (
                <div className="assetWaveform" aria-hidden>
                  {asset.waveform.slice(0, 48).map((value, index) => (
                    <span key={`${asset.id}-wf-${index}`} style={{ height: `${Math.max(8, value * 28)}px` }} />
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
