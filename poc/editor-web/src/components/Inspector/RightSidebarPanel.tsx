import type { ReactNode } from "react";
import type { AIGenRightSidebarTab } from "../../ai-generation/types";

type RightSidebarPanelProps = {
  activeTab: AIGenRightSidebarTab;
  onTabChange: (tab: AIGenRightSidebarTab) => void;
  aiGeneration: ReactNode;
  inspector: ReactNode;
};

export function RightSidebarPanel({ activeTab, onTabChange, aiGeneration, inspector }: RightSidebarPanelProps) {
  return (
    <div className="rightSidebarPanel">
      <div className="rightSidebarTabs" role="tablist" aria-label="Right sidebar tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "ai-generation"}
          className={activeTab === "ai-generation" ? "activeRightSidebarTab" : ""}
          onClick={() => onTabChange("ai-generation")}
        >
          AI Generation
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "inspector"}
          className={activeTab === "inspector" ? "activeRightSidebarTab" : ""}
          onClick={() => onTabChange("inspector")}
        >
          Inspector
        </button>
      </div>

      <div className="rightSidebarContent">{activeTab === "ai-generation" ? aiGeneration : inspector}</div>
    </div>
  );
}
