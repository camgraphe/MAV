import type { ReactNode } from "react";

export type LibraryTab = "media" | "audio" | "text" | "stickers" | "effects" | "ai";

type LibraryPanelProps = {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  mediaContent: ReactNode;
  hasVideoAsset: boolean;
  aiJobStatus: "idle" | "running" | "completed" | "failed";
  aiSummary: string | null;
  aiSuggestionCount: number;
  canApplyAi: boolean;
  onRunSilenceCut: () => void;
  onApplyAiResult: () => void;
};

const tabs: Array<{ id: LibraryTab; label: string; icon: string; enabled: boolean }> = [
  { id: "media", label: "Media", icon: "🎞", enabled: true },
  { id: "audio", label: "Audio", icon: "🎵", enabled: false },
  { id: "text", label: "Text", icon: "T", enabled: false },
  { id: "stickers", label: "Stickers", icon: "😊", enabled: false },
  { id: "effects", label: "Effects", icon: "✨", enabled: false },
  { id: "ai", label: "AI", icon: "⚡", enabled: true },
];

export function LibraryPanel({
  activeTab,
  onTabChange,
  mediaContent,
  hasVideoAsset,
  aiJobStatus,
  aiSummary,
  aiSuggestionCount,
  canApplyAi,
  onRunSilenceCut,
  onApplyAiResult,
}: LibraryPanelProps) {
  const statusLabel =
    aiJobStatus === "running"
      ? "Running"
      : aiJobStatus === "completed"
        ? "Ready"
        : aiJobStatus === "failed"
          ? "Failed"
          : "Idle";

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
        {activeTab === "ai" ? (
          <section className="aiPanel">
            <h2>AI</h2>
            <div className="aiStatusRow">
              <span className={`aiStatusTag status-${aiJobStatus}`}>{statusLabel}</span>
              <span className="hint">{aiSuggestionCount} suggestions</span>
            </div>
            <button type="button" onClick={onRunSilenceCut} disabled={!hasVideoAsset || aiJobStatus === "running"}>
              ✂ Silence Cut
            </button>
            <button type="button" onClick={onApplyAiResult} disabled={!canApplyAi || aiJobStatus === "running"}>
              ✔ Apply
            </button>
            {aiSummary ? <p className="hint">{aiSummary}</p> : null}
            {!hasVideoAsset ? (
              <p className="hint">Upload video first</p>
            ) : null}
          </section>
        ) : null}
        {activeTab !== "media" && activeTab !== "ai" ? (
          <section>
            <h2>Soon</h2>
            <p className="hint">Feature not enabled yet.</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
