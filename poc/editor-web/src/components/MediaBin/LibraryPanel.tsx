import type { ReactNode } from "react";

export type LibraryTab = "media" | "references" | "audio" | "text" | "stickers" | "effects";

type LibraryPanelProps = {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  mediaContent: ReactNode;
  referencesContent?: ReactNode;
};

const tabs: Array<{ id: LibraryTab; label: string; icon: string; enabled: boolean }> = [
  { id: "media", label: "Media", icon: "🎞", enabled: true },
  { id: "references", label: "References", icon: "🧭", enabled: true },
  { id: "audio", label: "Audio", icon: "🎵", enabled: false },
  { id: "text", label: "Text", icon: "T", enabled: false },
  { id: "stickers", label: "Stickers", icon: "😊", enabled: false },
  { id: "effects", label: "Effects", icon: "✨", enabled: false },
];

export function LibraryPanel({ activeTab, onTabChange, mediaContent, referencesContent }: LibraryPanelProps) {
  return (
    <div className="libraryPanel">
      <div className="libraryTabs" role="tablist" aria-label="Library tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            title={tab.label}
            className={tab.id === activeTab ? "activeLibraryTab" : ""}
            disabled={!tab.enabled}
            onClick={() => onTabChange(tab.id)}
          >
            <span aria-hidden>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="libraryContent">
        {activeTab === "media" ? mediaContent : null}
        {activeTab === "references" ? referencesContent ?? null : null}
        {activeTab !== "media" && activeTab !== "references" ? (
          <section>
            <h2>Soon</h2>
            <p className="hint">Feature not enabled yet.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
