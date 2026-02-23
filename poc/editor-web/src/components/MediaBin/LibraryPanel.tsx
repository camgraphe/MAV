import type { ReactNode } from "react";

export type LibraryTab = "media" | "audio" | "text" | "stickers" | "effects" | "ai";

type LibraryPanelProps = {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  mediaContent: ReactNode;
  hasVideoAsset: boolean;
  onRunAutoCaptions: () => void;
};

const tabs: Array<{ id: LibraryTab; label: string; enabled: boolean }> = [
  { id: "media", label: "Media", enabled: true },
  { id: "audio", label: "Audio", enabled: false },
  { id: "text", label: "Text", enabled: false },
  { id: "stickers", label: "Stickers", enabled: false },
  { id: "effects", label: "Effects", enabled: false },
  { id: "ai", label: "AI", enabled: true },
];

export function LibraryPanel({
  activeTab,
  onTabChange,
  mediaContent,
  hasVideoAsset,
  onRunAutoCaptions,
}: LibraryPanelProps) {
  return (
    <div className="libraryPanel">
      <div className="libraryTabs" role="tablist" aria-label="Library tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={tab.id === activeTab ? "activeLibraryTab" : ""}
            disabled={!tab.enabled}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="libraryContent">
        {activeTab === "media" ? mediaContent : null}
        {activeTab === "ai" ? (
          <section className="aiPanel">
            <h2>AI</h2>
            <p className="hint">First feature hook for plugin architecture.</p>
            <button type="button" onClick={onRunAutoCaptions} disabled={!hasVideoAsset}>
              Auto captions (placeholder)
            </button>
            {!hasVideoAsset ? (
              <p className="hint">Upload at least one video to test captions integration.</p>
            ) : null}
          </section>
        ) : null}
        {activeTab !== "media" && activeTab !== "ai" ? (
          <section>
            <h2>Coming Soon</h2>
            <p className="hint">This panel will be enabled in the next iterations.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
