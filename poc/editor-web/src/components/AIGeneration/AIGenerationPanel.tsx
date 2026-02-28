import { useMemo, useState } from "react";
import type {
  AIGenerationSourceContext,
  IntentContract,
  IntentFrameRef,
  IntentReferenceBank,
  IntentRenderVersion,
} from "../../ai-generation/types";
import { SCENE_BLOCK_DURATION_OPTIONS_SEC, clampSceneBlockDurationSec } from "../../ai-generation/scene-engine-limits";

type IntentClipPanelState = {
  id: string;
  title: string;
  intent: IntentContract;
  intentRender: {
    status: "draft" | "queued" | "generating" | "ready" | "failed";
    progressPct: number;
    activeVersionId: string | null;
    versions: IntentRenderVersion[];
    error: string | null;
    hasDraftChanges: boolean;
  };
};

export type AIGenerationPanelSelection =
  | { kind: "none"; label: null }
  | { kind: "scene-block"; label: string }
  | { kind: "audio-block"; label: string }
  | { kind: "media"; label: string; mediaKind: "video" | "audio" }
  | { kind: "image"; label: string };

type AIGenerationPanelProps = {
  selectedClip: IntentClipPanelState | null;
  selection: AIGenerationPanelSelection;
  referenceBank: IntentReferenceBank;
  sourceContext: AIGenerationSourceContext;
  onContractChange: (next: IntentContract) => void;
  onGenerate: () => void;
  onRetryVersion: (versionId: string) => void;
  onSetFrame: (target: "first" | "end", source: "source-monitor" | "timeline-program") => void;
  onContinueFromPrevious: () => void;
  onAttachRef: (
    target: "characterRefs" | "objectRefs",
    bankRefId: string,
    enabled: boolean,
    strength: "low" | "medium" | "high",
  ) => void;
  onAddBankRef: (target: "characters" | "objects", source: "source-monitor" | "timeline-program") => string | null;
  onRemoveBankRef: (target: "characters" | "objects", bankRefId: string) => void;
};

function EmptyState() {
  return (
    <section className="aiComposerEmpty">
      <p className="hint">Select a Scene Block, Audio Block, Media clip, or Image clip.</p>
    </section>
  );
}

function createFrameFromSourceContext(
  sourceContext: AIGenerationSourceContext,
  source: "source-monitor" | "timeline-program",
): IntentFrameRef | null {
  if (source === "source-monitor") {
    if (!sourceContext.sourceAssetId) return null;
    return {
      assetId: sourceContext.sourceAssetId,
      assetLabel: sourceContext.sourceAssetLabel,
      timeMs: Math.max(0, Math.round(sourceContext.sourcePlayheadMs)),
      thumbnailUrl: sourceContext.sourceThumbnailUrl,
      source,
    };
  }
  if (!sourceContext.timelineAssetId) return null;
  return {
    assetId: sourceContext.timelineAssetId,
    assetLabel: sourceContext.timelineAssetLabel,
    timeMs: Math.max(0, Math.round(sourceContext.timelinePlayheadMs)),
    thumbnailUrl: sourceContext.timelineThumbnailUrl,
    source,
  };
}

function formatTimeLabel(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const DURATION_OPTIONS = SCENE_BLOCK_DURATION_OPTIONS_SEC;

type CompactSlotProps = {
  icon: string;
  label: string;
  valueLabel: string | null;
  thumbUrl: string | null;
  onUseSource: () => void;
  onUseTimeline: () => void;
  onClear: () => void;
};

function CompactSlot({ icon, label, valueLabel, thumbUrl, onUseSource, onUseTimeline, onClear }: CompactSlotProps) {
  const hasValue = Boolean(valueLabel);
  return (
    <article className={`aiSceneSlot ${hasValue ? "isFilled" : "isEmpty"}`}>
      <div className="aiSceneSlotHead">
        <span className="aiSceneSlotIcon" aria-hidden>
          {icon}
        </span>
        <strong>{label}</strong>
      </div>
      <div className="aiSceneSlotPreview">
        {thumbUrl ? <img src={thumbUrl} alt={label} /> : <span>{hasValue ? "SET" : "+"}</span>}
      </div>
      <small className="aiSceneSlotValue">{valueLabel ?? "Empty"}</small>
      <div className="aiSceneSlotActions">
        <button type="button" className="iconBtn tiny" onClick={onUseSource}>
          Source
        </button>
        <button type="button" className="iconBtn tiny" onClick={onUseTimeline}>
          Timeline
        </button>
        <button type="button" className="iconBtn tiny" onClick={onClear} disabled={!hasValue}>
          Clear
        </button>
      </div>
    </article>
  );
}

type SceneBlockComposerProps = {
  selectedClip: IntentClipPanelState;
  referenceBank: IntentReferenceBank;
  sourceContext: AIGenerationSourceContext;
  onContractChange: (next: IntentContract) => void;
  onSetFrame: (target: "first" | "end", source: "source-monitor" | "timeline-program") => void;
  onContinueFromPrevious: () => void;
  onAddBankRef: (target: "characters" | "objects", source: "source-monitor" | "timeline-program") => string | null;
};

function SceneBlockComposer({
  selectedClip,
  referenceBank,
  sourceContext,
  onContractChange,
  onSetFrame,
  onContinueFromPrevious,
  onAddBankRef,
}: SceneBlockComposerProps) {
  const intent = selectedClip.intent;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const primaryCharacter =
    (intent.characterRefs[0]
      ? referenceBank.characters.find((entry) => entry.id === intent.characterRefs[0]?.bankRefId)
      : null) ?? null;
  const primaryObject =
    (intent.objectRefs[0] ? referenceBank.objects.find((entry) => entry.id === intent.objectRefs[0]?.bankRefId) : null) ??
    null;

  const promptIsEmpty = intent.prompt.trim().length === 0;
  const multiPromptEnabled = intent.sceneComposer.multiPrompt.enabled;
  const hasMultiPromptContent = intent.sceneComposer.multiPrompt.shots.some((entry) => entry.prompt.trim().length > 0);

  const setDuration = (value: number) => {
    onContractChange({
      ...intent,
      output: {
        ...intent.output,
        durationSec: clampSceneBlockDurationSec(value),
      },
    });
  };

  const setAspect = (value: "16:9" | "9:16" | "1:1") => {
    onContractChange({
      ...intent,
      output: {
        ...intent.output,
        aspectRatio: value,
      },
    });
  };

  const setStyleFromSource = (source: "source-monitor" | "timeline-program") => {
    const frame = createFrameFromSourceContext(sourceContext, source);
    if (!frame) return;
    onContractChange({
      ...intent,
      sceneComposer: {
        ...intent.sceneComposer,
        styleFrame: frame,
      },
    });
  };

  const setPrimarySlotRef = (target: "characterRefs" | "objectRefs", source: "source-monitor" | "timeline-program") => {
    const bankTarget = target === "characterRefs" ? "characters" : "objects";
    const refId = onAddBankRef(bankTarget, source);
    if (!refId) return;
    onContractChange({
      ...intent,
      [target]: [{ bankRefId: refId, strength: "high", locked: false }],
    });
  };

  const setVoiceId = (index: 0 | 1, value: string) => {
    const next = [intent.sceneComposer.fal.voiceIds[0] ?? "", intent.sceneComposer.fal.voiceIds[1] ?? ""];
    next[index] = value;
    const normalized = next
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 2);
    onContractChange({
      ...intent,
      sceneComposer: {
        ...intent.sceneComposer,
        fal: {
          ...intent.sceneComposer.fal,
          voiceIds: normalized,
        },
      },
    });
  };

  const setMultiPromptEnabled = (enabled: boolean) => {
    if (!enabled) {
      onContractChange({
        ...intent,
        sceneComposer: {
          ...intent.sceneComposer,
          multiPrompt: {
            ...intent.sceneComposer.multiPrompt,
            enabled: false,
          },
        },
      });
      return;
    }

    const shots =
      intent.sceneComposer.multiPrompt.shots.length > 0
        ? intent.sceneComposer.multiPrompt.shots
        : [{ prompt: intent.prompt.trim() || "", durationSec: clampSceneBlockDurationSec(intent.output.durationSec) }];

    onContractChange({
      ...intent,
      sceneComposer: {
        ...intent.sceneComposer,
        multiPrompt: {
          ...intent.sceneComposer.multiPrompt,
          enabled: true,
          shots,
        },
      },
    });
  };

  const updateShotPrompt = (index: number, value: string) => {
    onContractChange({
      ...intent,
      sceneComposer: {
        ...intent.sceneComposer,
        multiPrompt: {
          ...intent.sceneComposer.multiPrompt,
          shots: intent.sceneComposer.multiPrompt.shots.map((shot, shotIndex) =>
            shotIndex === index ? { ...shot, prompt: value } : shot,
          ),
        },
      },
    });
  };

  const updateShotDuration = (index: number, value: number) => {
    onContractChange({
      ...intent,
      sceneComposer: {
        ...intent.sceneComposer,
        multiPrompt: {
          ...intent.sceneComposer.multiPrompt,
          shots: intent.sceneComposer.multiPrompt.shots.map((shot, shotIndex) =>
            shotIndex === index ? { ...shot, durationSec: clampSceneBlockDurationSec(value) } : shot,
          ),
        },
      },
    });
  };

  const addShot = () => {
    if (intent.sceneComposer.multiPrompt.shots.length >= 8) return;
    onContractChange({
      ...intent,
      sceneComposer: {
        ...intent.sceneComposer,
        multiPrompt: {
          ...intent.sceneComposer.multiPrompt,
          shots: [
            ...intent.sceneComposer.multiPrompt.shots,
            {
              prompt: "",
              durationSec: clampSceneBlockDurationSec(intent.output.durationSec),
            },
          ],
        },
      },
    });
  };

  const removeShot = (index: number) => {
    onContractChange({
      ...intent,
      sceneComposer: {
        ...intent.sceneComposer,
        multiPrompt: {
          ...intent.sceneComposer.multiPrompt,
          shots: intent.sceneComposer.multiPrompt.shots.filter((_, shotIndex) => shotIndex !== index),
        },
      },
    });
  };

  return (
    <section className="aiSceneComposer">
      <article className="aiSceneCard">
        <div className="aiSceneCoreTop">
          {multiPromptEnabled ? (
            hasMultiPromptContent ? null : <small className="aiSceneWarning">At least one shot prompt is required</small>
          ) : promptIsEmpty ? (
            <small className="aiSceneWarning">Prompt required</small>
          ) : null}
        </div>
        <div className="aiSceneModeRow">
          <button
            type="button"
            className={`iconBtn tiny ${!multiPromptEnabled ? "activeTool" : ""}`}
            onClick={() => setMultiPromptEnabled(false)}
          >
            Single Prompt
          </button>
          <button
            type="button"
            className={`iconBtn tiny ${multiPromptEnabled ? "activeTool" : ""}`}
            onClick={() => setMultiPromptEnabled(true)}
          >
            Multi-prompt
          </button>
        </div>
        {!multiPromptEnabled ? (
          <label className="aiScenePrompt">
            <span>Prompt</span>
            <textarea
              rows={3}
              value={intent.prompt}
              onChange={(event) =>
                onContractChange({
                  ...intent,
                  prompt: event.target.value,
                })
              }
            />
          </label>
        ) : (
          <div className="aiSceneMultiPromptList">
            {intent.sceneComposer.multiPrompt.shots.map((shot, index) => (
              <article key={`shot-${index}`} className="aiSceneMultiPromptItem">
                <div className="aiSceneMultiPromptHead">
                  <strong>Shot {index + 1}</strong>
                  <button
                    type="button"
                    className="iconBtn tiny"
                    onClick={() => removeShot(index)}
                    disabled={intent.sceneComposer.multiPrompt.shots.length <= 1}
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={shot.prompt}
                  placeholder="Shot prompt"
                  onChange={(event) => updateShotPrompt(index, event.target.value)}
                />
                <div className="aiSceneMultiPromptControls">
                  <span>Duration</span>
                  <select
                    value={clampSceneBlockDurationSec(shot.durationSec)}
                    onChange={(event) => updateShotDuration(index, Number(event.target.value))}
                  >
                    {DURATION_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}s
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
            <button
              type="button"
              className="iconBtn tiny"
              onClick={addShot}
              disabled={intent.sceneComposer.multiPrompt.shots.length >= 8}
            >
              + Add shot
            </button>
          </div>
        )}
        <div className="aiSceneChipRows">
          <div className="aiSceneChipRow">
            <span>Duration</span>
            <select
              className="aiSceneDurationSelect"
              value={clampSceneBlockDurationSec(intent.output.durationSec)}
              onChange={(event) => setDuration(Number(event.target.value))}
            >
              {DURATION_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}s
                </option>
              ))}
            </select>
          </div>
          <div className="aiSceneChipRow">
            <span>Aspect</span>
            <div className="aiSceneChips">
              <button
                type="button"
                className={`iconBtn tiny ${intent.output.aspectRatio === "16:9" ? "activeTool" : ""}`}
                onClick={() => setAspect("16:9")}
              >
                16:9
              </button>
              <button
                type="button"
                className={`iconBtn tiny ${intent.output.aspectRatio === "9:16" ? "activeTool" : ""}`}
                onClick={() => setAspect("9:16")}
              >
                9:16
              </button>
              <button
                type="button"
                className={`iconBtn tiny ${intent.output.aspectRatio === "1:1" ? "activeTool" : ""}`}
                onClick={() => setAspect("1:1")}
              >
                1:1
              </button>
            </div>
          </div>
        </div>
      </article>

      <article className="aiSceneCard">
        <div className="aiSceneStartGrid">
          <CompactSlot
            icon="S"
            label="Start Image"
            valueLabel={intent.firstFrame ? `${intent.firstFrame.assetLabel} @ ${formatTimeLabel(intent.firstFrame.timeMs)}` : null}
            thumbUrl={intent.firstFrame?.thumbnailUrl ?? null}
            onUseSource={() => onSetFrame("first", "source-monitor")}
            onUseTimeline={() => onSetFrame("first", "timeline-program")}
            onClear={() =>
              onContractChange({
                ...intent,
                firstFrame: null,
              })
            }
          />
          <CompactSlot
            icon="E"
            label="End Image"
            valueLabel={intent.endFrame ? `${intent.endFrame.assetLabel} @ ${formatTimeLabel(intent.endFrame.timeMs)}` : null}
            thumbUrl={intent.endFrame?.thumbnailUrl ?? null}
            onUseSource={() => onSetFrame("end", "source-monitor")}
            onUseTimeline={() => onSetFrame("end", "timeline-program")}
            onClear={() =>
              onContractChange({
                ...intent,
                endFrame: null,
              })
            }
          />
        </div>
        <div className="aiSceneInlineActions">
          <button type="button" className="iconBtn tiny" onClick={onContinueFromPrevious}>
            Continue prev
          </button>
        </div>
      </article>

      <div className="aiSceneSlotGrid">
        <CompactSlot
          icon="C"
          label="Character"
          valueLabel={primaryCharacter?.label ?? null}
          thumbUrl={primaryCharacter?.thumbnailUrl ?? null}
          onUseSource={() => setPrimarySlotRef("characterRefs", "source-monitor")}
          onUseTimeline={() => setPrimarySlotRef("characterRefs", "timeline-program")}
          onClear={() =>
            onContractChange({
              ...intent,
              characterRefs: [],
            })
          }
        />
        <CompactSlot
          icon="O"
          label="Object"
          valueLabel={primaryObject?.label ?? null}
          thumbUrl={primaryObject?.thumbnailUrl ?? null}
          onUseSource={() => setPrimarySlotRef("objectRefs", "source-monitor")}
          onUseTimeline={() => setPrimarySlotRef("objectRefs", "timeline-program")}
          onClear={() =>
            onContractChange({
              ...intent,
              objectRefs: [],
            })
          }
        />
        <CompactSlot
          icon="S"
          label="Style/Look"
          valueLabel={intent.sceneComposer.styleFrame?.assetLabel ?? null}
          thumbUrl={intent.sceneComposer.styleFrame?.thumbnailUrl ?? null}
          onUseSource={() => setStyleFromSource("source-monitor")}
          onUseTimeline={() => setStyleFromSource("timeline-program")}
          onClear={() =>
            onContractChange({
              ...intent,
              sceneComposer: {
                ...intent.sceneComposer,
                styleFrame: null,
              },
            })
          }
        />
      </div>

      <section className="aiSceneAdvanced">
        <button type="button" className="aiSceneAdvancedToggle" onClick={() => setAdvancedOpen((prev) => !prev)}>
          <strong>Advanced</strong>
          <span aria-hidden>{advancedOpen ? "▾" : "▸"}</span>
        </button>
        {advancedOpen ? (
          <div className="aiSceneAdvancedBody">
            <label>
              <span>Negative prompt</span>
              <textarea
                rows={2}
                value={intent.negativePrompt}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    negativePrompt: event.target.value,
                  })
                }
              />
            </label>

            <label>
              <span>CFG scale: {intent.sceneComposer.fal.cfgScale.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={intent.sceneComposer.fal.cfgScale}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    sceneComposer: {
                      ...intent.sceneComposer,
                      fal: {
                        ...intent.sceneComposer.fal,
                        cfgScale: Math.min(1, Math.max(0, Number(event.target.value) || 0)),
                      },
                    },
                  })
                }
              />
            </label>

            <label className="aiSceneToggleRow">
              <input
                type="checkbox"
                checked={intent.sceneComposer.fal.generateAudio}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    sceneComposer: {
                      ...intent.sceneComposer,
                      fal: {
                        ...intent.sceneComposer.fal,
                        generateAudio: event.target.checked,
                      },
                    },
                  })
                }
              />
              <span>Generate audio</span>
            </label>

            <div className="aiSceneVoiceGrid">
              <label>
                <span>Voice ID 1</span>
                <input
                  type="text"
                  value={intent.sceneComposer.fal.voiceIds[0] ?? ""}
                  onChange={(event) => setVoiceId(0, event.target.value)}
                  placeholder="voice_1"
                />
              </label>
              <label>
                <span>Voice ID 2</span>
                <input
                  type="text"
                  value={intent.sceneComposer.fal.voiceIds[1] ?? ""}
                  onChange={(event) => setVoiceId(1, event.target.value)}
                  placeholder="voice_2"
                />
              </label>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="aiComposerEmpty">
      <strong>{title}</strong>
      <p className="hint">{text}</p>
    </section>
  );
}

export function AIGenerationPanel({
  selectedClip,
  selection,
  referenceBank,
  sourceContext,
  onContractChange,
  onGenerate,
  onRetryVersion,
  onSetFrame,
  onContinueFromPrevious,
  onAttachRef: _onAttachRef,
  onAddBankRef,
  onRemoveBankRef: _onRemoveBankRef,
}: AIGenerationPanelProps) {
  const latestVersion = useMemo(() => {
    if (!selectedClip) return null;
    return selectedClip.intentRender.versions.find((entry) => entry.id === selectedClip.intentRender.activeVersionId) ?? null;
  }, [selectedClip]);

  return (
    <div className="aiGenerationPanel aiGenerationPanelComposer">
      <div className="aiGenAccordion">
        {selection.kind === "none" ? <EmptyState /> : null}
        {selection.kind === "scene-block" && selectedClip ? (
          <SceneBlockComposer
            selectedClip={selectedClip}
            referenceBank={referenceBank}
            sourceContext={sourceContext}
            onContractChange={onContractChange}
            onSetFrame={onSetFrame}
            onContinueFromPrevious={onContinueFromPrevious}
            onAddBankRef={onAddBankRef}
          />
        ) : null}
        {selection.kind === "scene-block" && !selectedClip ? (
          <Placeholder title="Scene Block" text="Select a scene block to open the composer." />
        ) : null}
        {selection.kind === "audio-block" ? (
          <Placeholder title={selection.label} text="Audio Block composer will have dedicated options next." />
        ) : null}
        {selection.kind === "media" ? (
          <Placeholder title={selection.label} text={`Media composer placeholder (${selection.mediaKind}).`} />
        ) : null}
        {selection.kind === "image" ? <Placeholder title={selection.label} text="Image composer placeholder." /> : null}
      </div>

      <footer className="aiGenStickyFooter">
        {selectedClip ? (
          <>
            <div className="aiGenFooterMeta">
              <span>{selectedClip.intentRender.versions.length} version(s)</span>
              <span>{selectedClip.intentRender.progressPct}%</span>
            </div>
            <button type="button" className="aiGenerateBtn" onClick={onGenerate}>
              Generate new version
            </button>
            {selectedClip.intentRender.status === "failed" && latestVersion ? (
              <button type="button" className="iconBtn" onClick={() => onRetryVersion(latestVersion.id)}>
                Retry failed version
              </button>
            ) : null}
            {selectedClip.intentRender.error ? <p className="hint">{selectedClip.intentRender.error}</p> : null}
          </>
        ) : (
          <p className="hint">Composer options vary by selected item type.</p>
        )}
      </footer>
    </div>
  );
}
