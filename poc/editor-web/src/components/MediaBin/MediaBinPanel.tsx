import { useEffect, useMemo, useRef, useState } from "react";

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

type IntentTemplateKind = "hook" | "scene" | "outro" | "vo" | "music" | "sfx";

type IntentTemplateConfig = {
  kind: IntentTemplateKind;
  label: string;
  durationMs: number;
};

type MediaBinPanelProps = {
  assets: MediaAsset[];
  activeAssetId: string | null;
  intentTemplates: IntentTemplateConfig[];
  onUpload: (file: File | null) => void;
  onActivateAsset: (assetId: string) => void;
  onOpenInSourceMonitor?: (assetId: string) => void;
  onAddToTimeline: (assetId: string) => void;
  onAddIntentToTimeline: (kind: IntentTemplateKind, title?: string) => void;
  onAssetDragStart?: (payload: {
    assetId: string;
    kind: "video" | "audio" | "image";
    durationMs?: number;
    hasAudio?: boolean;
  }) => void;
  onAssetDragEnd?: () => void;
  onIntentDragStart?: (payload: {
    kind: IntentTemplateKind;
    label: string;
    durationMs: number;
  }) => void;
  onIntentDragEnd?: () => void;
};

type IntentLibraryItem = {
  id: string;
  kind: IntentTemplateKind;
  label: string;
  durationMs: number;
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

function isAudioIntentKind(kind: IntentTemplateKind): boolean {
  return kind === "vo" || kind === "music" || kind === "sfx";
}

function intentUsageLabel(kind: IntentTemplateKind): string {
  return isAudioIntentKind(kind) ? "Audio only" : "Video + Audio";
}

function nextIntentItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `intent-template-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `intent-template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function waveformHeight(index: number, seed = 0): string {
  const value = Math.abs(Math.sin((index + 1) * 0.55 + seed));
  return `${22 + Math.round(value * 52)}%`;
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
  const CREATE_MENU_WIDTH_PX = 176;
  const CREATE_MENU_MARGIN_PX = 8;
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [intentItems, setIntentItems] = useState<IntentLibraryItem[]>([]);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPosition, setCreateMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const createMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  const visualAssets = assets.filter((asset) => asset.kind === "video" || asset.kind === "image");

  const templateByKind = useMemo(() => {
    const map = new Map<IntentTemplateKind, IntentTemplateConfig>();
    for (const template of intentTemplates) {
      map.set(template.kind, template);
    }
    return map;
  }, [intentTemplates]);

  useEffect(() => {
    if (!createMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (createMenuRef.current && !createMenuRef.current.contains(target)) {
        setCreateMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [createMenuOpen]);

  useEffect(() => {
    if (!createMenuOpen) {
      setCreateMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const button = createMenuButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const left = Math.min(
        Math.max(CREATE_MENU_MARGIN_PX, rect.left),
        Math.max(CREATE_MENU_MARGIN_PX, window.innerWidth - CREATE_MENU_WIDTH_PX - CREATE_MENU_MARGIN_PX),
      );
      const top = Math.max(CREATE_MENU_MARGIN_PX, rect.bottom + 6);
      setCreateMenuPosition({ top, left });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [createMenuOpen]);

  const openPicker = () => inputRef.current?.click();

  const createIntentItem = (kind: IntentTemplateKind) => {
    const template =
      templateByKind.get(kind) ?? {
        kind,
        label: kind === "vo" ? "Audio Block" : "Scene Block",
        durationMs: kind === "vo" ? 8000 : 5000,
      };

    setIntentItems((prev) => {
      const indexForKind = prev.filter((entry) => entry.kind === kind).length + 1;
      const label = indexForKind === 1 ? template.label : `${template.label} ${indexForKind}`;
      return [
        ...prev,
        {
          id: nextIntentItemId(),
          kind,
          label,
          durationMs: Math.max(1000, Math.round(template.durationMs)),
        },
      ];
    });

    setCreateMenuOpen(false);
  };

  const updateIntentItemLabel = (itemId: string, nextLabel: string) => {
    setIntentItems((prev) =>
      prev.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              label: nextLabel,
            }
          : entry,
      ),
    );
  };

  return (
    <div className="mediaBin">
      <div className="panelHeader">
        <h2>Media</h2>
        <div className="mediaBinHeaderActions">
          <div className="mediaCreateMenuWrap" ref={createMenuRef}>
            <button
              type="button"
              className="iconBtn mediaImportBtn"
              title="Create or import"
              ref={createMenuButtonRef}
              onClick={() => setCreateMenuOpen((prev) => !prev)}
            >
              +
            </button>
            {createMenuOpen ? (
              <div
                className="mediaCreateMenu"
                role="menu"
                aria-label="Create media items"
                style={
                  createMenuPosition
                    ? {
                        top: `${createMenuPosition.top}px`,
                        left: `${createMenuPosition.left}px`,
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => createIntentItem("scene")}
                >
                  Scene Block
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => createIntentItem("vo")}
                >
                  Audio Block
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    openPicker();
                  }}
                >
                  Import media
                </button>
              </div>
            ) : null}
          </div>
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

      <div className={`assetList ${viewMode === "grid" ? "gridMode" : "listMode"}`}>
        {intentItems.length === 0 && visualAssets.length === 0 ? (
          <div className="assetEmptyState">
            <p className="hint">Use + to create Scene/Audio blocks or import media, then drag to timeline.</p>
          </div>
        ) : null}

        {intentItems.map((item) => {
          const isAudio = isAudioIntentKind(item.kind);
          const fallbackLabel = templateByKind.get(item.kind)?.label ?? (isAudio ? "Audio Block" : "Scene Block");

          return (
            <article
              key={item.id}
              className={`assetCard intentLibraryCard ${isAudio ? "audioIntent" : "videoIntent"}`}
              draggable
              onDoubleClick={() => onAddIntentToTimeline(item.kind, item.label)}
              onDragStart={(event) => {
                const payload = {
                  kind: item.kind,
                  label: item.label,
                  durationMs: item.durationMs,
                };
                event.dataTransfer.setData("text/x-mav-intent-template", JSON.stringify(payload));
                event.dataTransfer.setData("text/plain", `intent:${item.id}`);
                event.dataTransfer.effectAllowed = "copy";
                onIntentDragStart?.(payload);
              }}
              onDragEnd={() => onIntentDragEnd?.()}
            >
              {viewMode === "grid" ? (
                <>
                  <div className="assetPreview intentLibraryPreview">
                    <div className={`intentLibraryPlaceholder ${isAudio ? "audio" : "video"}`}>
                      {isAudio ? (
                        <div className="intentLibraryWaveform" aria-hidden="true">
                          {Array.from({ length: 28 }, (_, index) => (
                            <span key={index} style={{ height: waveformHeight(index, 0.2) }} />
                          ))}
                        </div>
                      ) : (
                        <div className="intentLibraryImage" aria-hidden="true">
                          <span>Image Placeholder</span>
                        </div>
                      )}
                    </div>
                    <div className="assetPreviewMeta">
                      <span>{formatDuration(item.durationMs)}</span>
                      <span>{intentUsageLabel(item.kind)}</span>
                    </div>
                    <div className="assetActions">
                      <button
                        type="button"
                        className="iconBtn"
                        title={`Add ${item.label} to timeline`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAddIntentToTimeline(item.kind, item.label);
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="assetMeta intentLibraryMeta">
                    <input
                      className="intentLibraryNameInput"
                      type="text"
                      value={item.label}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateIntentItemLabel(item.id, event.target.value)}
                      onBlur={() => {
                        const normalized = item.label.trim();
                        updateIntentItemLabel(item.id, normalized.length > 0 ? normalized : fallbackLabel);
                      }}
                      aria-label={`${fallbackLabel} name`}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="assetThumb intentLibraryThumb">
                    {isAudio ? (
                      <div className="intentLibraryWaveform" aria-hidden="true">
                        {Array.from({ length: 22 }, (_, index) => (
                          <span key={index} style={{ height: waveformHeight(index, 0.5) }} />
                        ))}
                      </div>
                    ) : (
                      <div className="intentLibraryImage" aria-hidden="true">
                        <span>Image</span>
                      </div>
                    )}
                  </div>
                  <div className="assetMeta listMeta intentLibraryListMeta">
                    <input
                      className="intentLibraryNameInput"
                      type="text"
                      value={item.label}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateIntentItemLabel(item.id, event.target.value)}
                      onBlur={() => {
                        const normalized = item.label.trim();
                        updateIntentItemLabel(item.id, normalized.length > 0 ? normalized : fallbackLabel);
                      }}
                      aria-label={`${fallbackLabel} name`}
                    />
                    <span>{formatDuration(item.durationMs)}</span>
                  </div>
                  <div className="assetActions listActions">
                    <button
                      type="button"
                      className="iconBtn"
                      title={`Add ${item.label} to timeline`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAddIntentToTimeline(item.kind, item.label);
                      }}
                    >
                      +
                    </button>
                  </div>
                  {isAudio ? (
                    <div className="assetWaveform intentLibraryWaveRow" aria-hidden="true">
                      {Array.from({ length: 56 }, (_, index) => (
                        <span key={index} style={{ height: waveformHeight(index, 1.1) }} />
                      ))}
                    </div>
                  ) : (
                    <div className="intentLibraryStrip" aria-hidden="true">
                      {Array.from({ length: 8 }, (_, index) => (
                        <span key={index} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}

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
                    ) : asset.kind === "image" ? (
                      <img src={asset.url} alt="" loading="lazy" />
                    ) : (
                      <video className="assetPreviewVideoThumb" src={asset.url} muted playsInline preload="metadata" />
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
                    ) : asset.kind === "image" ? (
                      <img src={asset.url} alt="" loading="lazy" />
                    ) : (
                      <video className="assetThumbVideo" src={asset.url} muted playsInline preload="metadata" />
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
