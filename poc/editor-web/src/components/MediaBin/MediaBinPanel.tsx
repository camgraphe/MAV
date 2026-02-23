type MediaAsset = {
  id: string;
  kind: "video" | "audio" | "image";
  url: string;
  durationMs?: number;
  name?: string;
};

type MediaBinPanelProps = {
  assets: MediaAsset[];
  activeAssetId: string | null;
  onUpload: (file: File | null) => void;
  onActivateAsset: (assetId: string) => void;
  onAddToTimeline: (assetId: string) => void;
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

export function MediaBinPanel({
  assets,
  activeAssetId,
  onUpload,
  onActivateAsset,
  onAddToTimeline,
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
        {videoAssets.length === 0 ? <p className="hint">No assets yet. Upload a video to start.</p> : null}

        {videoAssets.map((asset) => {
          const active = asset.id === activeAssetId;
          return (
            <article key={asset.id} className={`assetCard ${active ? "active" : ""}`}>
              <div className="assetThumb">MP4</div>
              <div className="assetMeta">
                <strong title={asset.name}>{asset.name ?? asset.id}</strong>
                <span>{formatDuration(asset.durationMs)}</span>
              </div>
              <div className="assetActions">
                <button type="button" onClick={() => onActivateAsset(asset.id)}>
                  Open
                </button>
                <button type="button" onClick={() => onAddToTimeline(asset.id)}>
                  Add
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
