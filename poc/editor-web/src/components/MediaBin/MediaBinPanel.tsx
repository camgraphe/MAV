import { useRef, useState } from "react";

type MediaAsset = {
  id: string;
  kind: "video" | "audio" | "image";
  url: string;
  durationMs?: number;
  name?: string;
  codec?: string;
  width?: number;
  height?: number;
  heroThumbnail?: string;
  hasAudio?: boolean;
  thumbnails?: string[];
  waveform?: number[];
};

type MediaBinPanelProps = {
  assets: MediaAsset[];
  activeAssetId: string | null;
  intentTemplates: Array<{
    kind: "hook" | "scene" | "outro" | "vo" | "music" | "sfx";
    label: string;
    durationMs: number;
  }>;
  onUpload: (file: File | null) => void;
  onActivateAsset: (assetId: string) => void;
  onOpenInSourceMonitor?: (assetId: string) => void;
  onAddToTimeline: (assetId: string) => void;
  onAddIntentToTimeline: (kind: "hook" | "scene" | "outro" | "vo" | "music" | "sfx") => void;
  onAssetDragStart?: (payload: {
    assetId: string;
    kind: "video" | "audio" | "image";
    durationMs?: number;
    hasAudio?: boolean;
  }) => void;
  onAssetDragEnd?: () => void;
  onIntentDragStart?: (payload: {
    kind: "hook" | "scene" | "outro" | "vo" | "music" | "sfx";
    label: string;
    durationMs: number;
  }) => void;
  onIntentDragEnd?: () => void;
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

function compactName(value?: string, fallback?: string) {
  const source = value ?? fallback ?? "Untitled";
  if (source.length <= 28) return source;
  return `${source.slice(0, 25)}...`;
}

function isSyntheticThumbnail(value: string): boolean {
  return value.startsWith("data:image/svg+xml");
}

export function MediaBinPanel({
  assets,
  activeAssetId,
  intentTemplates,
  onUpload,
  onActivateAsset,
  onOpenInSourceMonitor,
  onAddToTimeline,
  onAddIntentToTimeline,
  onAssetDragStart,
  onAssetDragEnd,
  onIntentDragStart,
  onIntentDragEnd,
}: MediaBinPanelProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visualAssets = assets.filter((asset) => asset.kind === "video" || asset.kind === "image");

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="mediaBin">
      <div className="panelHeader">
        <h2>Media</h2>
        <div className="mediaBinHeaderActions">
          <button
            type="button"
            className="iconBtn mediaImportBtn"
            title="Import media"
            onClick={openPicker}
          >
            +
          </button>
          <div className="mediaViewToggle" role="tablist" aria-label="Media view mode">
            <button
              type="button"
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              ▦
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              ≡
            </button>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        id="decode-input-file"
        className="mediaUploadInput"
        type="file"
        accept="video/mp4,video/*,image/*"
        onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
      />

      <section className="intentTemplatePanel">
        <header>
          <h3>Intent Blocks</h3>
          <p className="hint">Drag empty blocks to timeline.</p>
        </header>
        <div className="intentTemplateGrid">
          {intentTemplates.map((template) => {
            const isAudio = template.kind === "vo" || template.kind === "music" || template.kind === "sfx";
            return (
              <article
                key={template.kind}
                className={`intentTemplateCard ${isAudio ? "audioIntent" : "videoIntent"}`}
                draggable
                onDragStart={(event) => {
                  const payload = {
                    kind: template.kind,
                    label: template.label,
                    durationMs: template.durationMs,
                  };
                  event.dataTransfer.setData("text/x-mav-intent-template", JSON.stringify(payload));
                  event.dataTransfer.effectAllowed = "copy";
                  onIntentDragStart?.(payload);
                }}
                onDragEnd={() => onIntentDragEnd?.()}
              >
                <div>
                  <strong>{template.label}</strong>
                  <small>{isAudio ? "Audio intent" : "Video intent"}</small>
                </div>
                <button
                  type="button"
                  className="iconBtn tiny"
                  onClick={() => onAddIntentToTimeline(template.kind)}
                  title={`Add ${template.label} block`}
                >
                  +
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <div className={`assetList ${viewMode === "grid" ? "gridMode" : "listMode"}`}>
        {visualAssets.length === 0 ? (
          <div className="assetEmptyState">
            <p className="hint">Use + to import media, then drag clips to the timeline.</p>
          </div>
        ) : null}

        {visualAssets.map((asset) => {
          const active = asset.id === activeAssetId;
          const realThumbnails = (asset.thumbnails ?? []).filter((thumb) => !isSyntheticThumbnail(thumb));
          const heroThumbIndex = realThumbnails.length > 1 ? 1 : 0;
          const previewThumb = asset.heroThumbnail ?? realThumbnails[heroThumbIndex] ?? null;

          return (
            <article
              key={asset.id}
              className={`assetCard ${active ? "active" : ""}`}
              draggable
              onDoubleClick={() => onOpenInSourceMonitor?.(asset.id)}
              onDragStart={(event) => {
                const dragPayload = {
                  assetId: asset.id,
                  kind: asset.kind,
                  durationMs:
                    typeof asset.durationMs === "number" && Number.isFinite(asset.durationMs)
                      ? Math.max(0, Math.round(asset.durationMs))
                      : undefined,
                  hasAudio: asset.kind === "video" ? asset.hasAudio !== false : false,
                };
                event.dataTransfer.setData("text/x-mav-asset-id", asset.id);
                event.dataTransfer.setData("text/x-mav-asset-meta", JSON.stringify(dragPayload));
                event.dataTransfer.setData("text/plain", asset.id);
                event.dataTransfer.effectAllowed = "copy";
                onAssetDragStart?.(dragPayload);
              }}
              onDragEnd={() => {
                onAssetDragEnd?.();
              }}
            >
              {viewMode === "grid" ? (
                <>
                  <div className="assetPreview">
                    {previewThumb ? (
                      <img src={previewThumb} alt="" loading="lazy" />
                    ) : (
                      asset.kind === "image" ? (
                        <img src={asset.url} alt="" loading="lazy" />
                      ) : (
                        <video className="assetPreviewVideoThumb" src={asset.url} muted playsInline preload="metadata" />
                      )
                    )}
                    <div className="assetPreviewMeta">
                      <span>{formatDuration(asset.durationMs)}</span>
                      <span>{formatResolution(asset.width, asset.height)}</span>
                    </div>
                    <div className="assetActions">
                      <button
                        type="button"
                        className="iconBtn"
                        title="Open in player"
                        onClick={() => onActivateAsset(asset.id)}
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        className="iconBtn"
                        title="Add to timeline"
                        onClick={() => onAddToTimeline(asset.id)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="assetMeta">
                    <strong title={asset.name}>{compactName(asset.name, asset.id)}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="assetThumb">
                    {previewThumb ? (
                      <img src={previewThumb} alt="" loading="lazy" />
                    ) : (
                      asset.kind === "image" ? (
                        <img src={asset.url} alt="" loading="lazy" />
                      ) : (
                        <video className="assetThumbVideo" src={asset.url} muted playsInline preload="metadata" />
                      )
                    )}
                  </div>
                  <div className="assetMeta listMeta">
                    <strong title={asset.name}>{compactName(asset.name, asset.id)}</strong>
                    <span>{formatDuration(asset.durationMs)}</span>
                    <span>{asset.codec ?? "codec --"}</span>
                    <span>{formatResolution(asset.width, asset.height)}</span>
                  </div>
                  <div className="assetActions listActions">
                    <button
                      type="button"
                      className="iconBtn"
                      title="Open in player"
                      onClick={() => onActivateAsset(asset.id)}
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      className="iconBtn"
                      title="Add to timeline"
                      onClick={() => onAddToTimeline(asset.id)}
                    >
                      +
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}

      </div>
    </div>
  );
}
