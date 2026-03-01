import { useEffect, useMemo, useRef, useState } from "react";
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
  onImportSlot: (target: "start-image" | "end-image" | "style-look" | "character" | "object") => void;
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

function estimateScenePrice(intent: IntentContract): number {
  const shotDurationSec = intent.sceneComposer.multiPrompt.enabled
    ? intent.sceneComposer.multiPrompt.shots.reduce(
        (sum, shot) => sum + clampSceneBlockDurationSec(shot.durationSec),
        0,
      )
    : clampSceneBlockDurationSec(intent.output.durationSec);
  const durationSec = Math.max(clampSceneBlockDurationSec(intent.output.durationSec), shotDurationSec);
  const modeMultiplier = intent.firstFrame ? 1.2 : 1;
  const base = durationSec * 0.08 * modeMultiplier;
  const audio = intent.sceneComposer.fal.generateAudio ? durationSec * 0.025 : 0;
  const style = intent.sceneComposer.styleFrame ? 0.06 : 0;
  return Math.round((base + audio + style) * 100) / 100;
}

const DURATION_OPTIONS = SCENE_BLOCK_DURATION_OPTIONS_SEC;
const ASPECT_OPTIONS: Array<"16:9" | "9:16" | "1:1"> = ["16:9", "9:16", "1:1"];
type SlotIconKind = "start" | "end" | "character" | "object" | "style";

type CompactSlotProps = {
  icon: SlotIconKind;
  label: string;
  tooltip: string;
  menuDirection?: "up" | "down";
  valueLabel: string | null;
  thumbUrl: string | null;
  actions: Array<{
    id: string;
    label: string;
    onSelect: () => void;
    disabled?: boolean;
  }>;
};

function SlotIcon({ kind }: { kind: SlotIconKind }) {
  if (kind === "start") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M6 6h3v20H6z" fill="#5d88ff" />
        <path d="M11 9l14 7-14 7z" fill="#8fd9ff" />
      </svg>
    );
  }
  if (kind === "end") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M7 6h3v20H7z" fill="#5d88ff" />
        <path d="M10 8h14l-4 5 4 5H10z" fill="#8fd9ff" />
      </svg>
    );
  }
  if (kind === "character") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="16" cy="11" r="5" fill="#8fd9ff" />
        <path d="M7 27c0-5 4-9 9-9s9 4 9 9H7z" fill="#5d88ff" />
      </svg>
    );
  }
  if (kind === "object") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M16 5l10 6v10l-10 6-10-6V11z" fill="#5d88ff" />
        <path d="M16 5l10 6-10 6-10-6z" fill="#8fd9ff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 4l2.8 5.6L25 12l-4.5 4.3 1.1 6.2L16 19.6l-5.6 2.9 1.1-6.2L7 12l6.2-2.4z" fill="#8fd9ff" />
      <path d="M6 24l8-8 2 2-8 8H6z" fill="#5d88ff" />
    </svg>
  );
}

function CompactSlot({ icon, label, tooltip, menuDirection = "down", valueLabel, thumbUrl, actions }: CompactSlotProps) {
  const hasValue = Boolean(valueLabel);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [menuOpen]);

  return (
    <article ref={rootRef} className={`aiSceneSlot aiSceneSlotCompact ${hasValue ? "isFilled" : "isEmpty"}`}>
      <button
        type="button"
        className="aiSceneSlotTrigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={tooltip}
        onClick={() => setMenuOpen((prev) => !prev)}
        title={tooltip}
      >
        <div className="aiSceneSlotGlyph" aria-hidden>
          {thumbUrl ? <img src={thumbUrl} alt={label} /> : <SlotIcon kind={icon} />}
        </div>
        <small className="aiSceneSlotLabel">{label}</small>
        {valueLabel ? <small className="aiSceneSlotMeta">{valueLabel}</small> : null}
      </button>
      {menuOpen ? (
        <div
          className={`aiSceneSlotMenu ${menuDirection === "up" ? "menuUp" : "menuDown"}`}
          role="menu"
          aria-label={`${label} actions`}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setMenuOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
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
  onImportSlot: (target: "start-image" | "end-image" | "style-look" | "character" | "object") => void;
  onAddBankRef: (target: "characters" | "objects", source: "source-monitor" | "timeline-program") => string | null;
};

function SceneBlockComposer({
  selectedClip,
  referenceBank,
  sourceContext,
  onContractChange,
  onSetFrame,
  onContinueFromPrevious,
  onImportSlot,
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
  const selectedAspect: "16:9" | "9:16" | "1:1" =
    intent.output.aspectRatio === "9:16" || intent.output.aspectRatio === "1:1" ? intent.output.aspectRatio : "16:9";

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
          <div className="aiSceneModeButtons">
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
          <div className="aiSceneModeAudioControl" title="Affects generation cost">
            <span className="aiSceneModeAudioLabel">Audio</span>
            <button
              type="button"
              className={`aiSceneModeAudioSwitch ${intent.sceneComposer.fal.generateAudio ? "isOn" : "isOff"}`}
              aria-pressed={intent.sceneComposer.fal.generateAudio}
              aria-label={`Audio ${intent.sceneComposer.fal.generateAudio ? "on" : "off"}`}
              onClick={() =>
                onContractChange({
                  ...intent,
                  sceneComposer: {
                    ...intent.sceneComposer,
                    fal: {
                      ...intent.sceneComposer.fal,
                      generateAudio: !intent.sceneComposer.fal.generateAudio,
                    },
                  },
                })
              }
            >
              <span className="aiSceneModeAudioKnob" />
            </button>
          </div>
        </div>
        {!multiPromptEnabled ? (
          <label className="aiScenePrompt">
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
        <div className="aiSceneOutputRow">
          <label className="aiSceneOutputField">
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
          </label>
          <label className="aiSceneOutputField">
            <span>Aspect</span>
            <select
              className="aiSceneDurationSelect"
              value={selectedAspect}
              onChange={(event) => setAspect(event.target.value as "16:9" | "9:16" | "1:1")}
            >
              {ASPECT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <article className="aiSceneCard">
        <div className="aiSceneStartGrid">
          <CompactSlot
            icon="start"
            label="Start"
            tooltip="Starting visual reference for the shot."
            valueLabel={intent.firstFrame ? `${intent.firstFrame.assetLabel} @ ${formatTimeLabel(intent.firstFrame.timeMs)}` : null}
            thumbUrl={intent.firstFrame?.thumbnailUrl ?? null}
            actions={[
              {
                id: "prev",
                label: "Previous clip (last frame)",
                onSelect: onContinueFromPrevious,
              },
              {
                id: "timeline",
                label: "Pick timeline",
                onSelect: () => onSetFrame("first", "timeline-program"),
              },
              {
                id: "source",
                label: "Pick source",
                onSelect: () => onSetFrame("first", "source-monitor"),
              },
              {
                id: "import",
                label: "Import image",
                onSelect: () => onImportSlot("start-image"),
              },
              {
                id: "clear",
                label: "Clear",
                disabled: !intent.firstFrame,
                onSelect: () =>
                  onContractChange({
                    ...intent,
                    firstFrame: null,
                  }),
              },
            ]}
          />
          <CompactSlot
            icon="end"
            label="End"
            tooltip="Optional ending visual reference to guide how the shot finishes."
            valueLabel={intent.endFrame ? `${intent.endFrame.assetLabel} @ ${formatTimeLabel(intent.endFrame.timeMs)}` : null}
            thumbUrl={intent.endFrame?.thumbnailUrl ?? null}
            actions={[
              {
                id: "timeline",
                label: "Pick timeline",
                onSelect: () => onSetFrame("end", "timeline-program"),
              },
              {
                id: "source",
                label: "Pick source",
                onSelect: () => onSetFrame("end", "source-monitor"),
              },
              {
                id: "import",
                label: "Import image",
                onSelect: () => onImportSlot("end-image"),
              },
              {
                id: "clear",
                label: "Clear",
                disabled: !intent.endFrame,
                onSelect: () =>
                  onContractChange({
                    ...intent,
                    endFrame: null,
                  }),
              },
            ]}
          />
        </div>
      </article>

      <div className="aiSceneSlotGrid">
        <CompactSlot
          icon="character"
          label="Character"
          tooltip="Primary character reference for identity and consistency."
          menuDirection="up"
          valueLabel={primaryCharacter?.label ?? null}
          thumbUrl={primaryCharacter?.thumbnailUrl ?? null}
          actions={[
            {
              id: "timeline",
              label: "Pick timeline",
              onSelect: () => setPrimarySlotRef("characterRefs", "timeline-program"),
            },
            {
              id: "source",
              label: "Pick source",
              onSelect: () => setPrimarySlotRef("characterRefs", "source-monitor"),
            },
            {
              id: "import",
              label: "Import image",
              onSelect: () => onImportSlot("character"),
            },
            {
              id: "clear",
              label: "Clear",
              disabled: intent.characterRefs.length === 0,
              onSelect: () =>
                onContractChange({
                  ...intent,
                  characterRefs: [],
                }),
            },
          ]}
        />
        <CompactSlot
          icon="object"
          label="Object"
          tooltip="Primary object reference for key props and continuity."
          menuDirection="up"
          valueLabel={primaryObject?.label ?? null}
          thumbUrl={primaryObject?.thumbnailUrl ?? null}
          actions={[
            {
              id: "timeline",
              label: "Pick timeline",
              onSelect: () => setPrimarySlotRef("objectRefs", "timeline-program"),
            },
            {
              id: "source",
              label: "Pick source",
              onSelect: () => setPrimarySlotRef("objectRefs", "source-monitor"),
            },
            {
              id: "import",
              label: "Import image",
              onSelect: () => onImportSlot("object"),
            },
            {
              id: "clear",
              label: "Clear",
              disabled: intent.objectRefs.length === 0,
              onSelect: () =>
                onContractChange({
                  ...intent,
                  objectRefs: [],
                }),
            },
          ]}
        />
        <CompactSlot
          icon="style"
          label="Style"
          tooltip="Visual style reference for look, color mood, and texture."
          menuDirection="up"
          valueLabel={intent.sceneComposer.styleFrame?.assetLabel ?? null}
          thumbUrl={intent.sceneComposer.styleFrame?.thumbnailUrl ?? null}
          actions={[
            {
              id: "timeline",
              label: "Pick timeline",
              onSelect: () => setStyleFromSource("timeline-program"),
            },
            {
              id: "source",
              label: "Pick source",
              onSelect: () => setStyleFromSource("source-monitor"),
            },
            {
              id: "import",
              label: "Import image",
              onSelect: () => onImportSlot("style-look"),
            },
            {
              id: "clear",
              label: "Clear",
              disabled: !intent.sceneComposer.styleFrame,
              onSelect: () =>
                onContractChange({
                  ...intent,
                  sceneComposer: {
                    ...intent.sceneComposer,
                    styleFrame: null,
                  },
                }),
            },
          ]}
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

type SceneAttachedFilePanelProps = {
  attachedVersion: IntentRenderVersion | null;
  simulated: boolean;
  primaryAction: AttachedPrimaryAction;
  secondaryAction: AttachedSecondaryAction;
  onSecondaryActionChange: (next: AttachedSecondaryAction) => void;
  v2vStrength: "low" | "medium" | "high";
  onV2vStrengthChange: (next: "low" | "medium" | "high") => void;
  v2vKeepMotion: boolean;
  onV2vKeepMotionChange: (next: boolean) => void;
  upscaleFactor: 2 | 4;
  onUpscaleFactorChange: (next: 2 | 4) => void;
  upscaleDetailBoost: boolean;
  onUpscaleDetailBoostChange: (next: boolean) => void;
  replaceInTimeline: boolean;
  onReplaceInTimelineChange: (next: boolean) => void;
  saveAsNewClip: boolean;
  onSaveAsNewClipChange: (next: boolean) => void;
  lastActionMessage: string | null;
  onStopSimulation: () => void;
};

type AttachedPrimaryAction = "rerender" | "video-edit" | "upscale";
type AttachedSecondaryAction = "none" | "extend" | "reframe" | "variation" | "extract-frame";

function SceneAttachedFilePanel({
  attachedVersion,
  simulated,
  primaryAction,
  secondaryAction,
  onSecondaryActionChange,
  v2vStrength,
  onV2vStrengthChange,
  v2vKeepMotion,
  onV2vKeepMotionChange,
  upscaleFactor,
  onUpscaleFactorChange,
  upscaleDetailBoost,
  onUpscaleDetailBoostChange,
  replaceInTimeline,
  onReplaceInTimelineChange,
  saveAsNewClip,
  onSaveAsNewClipChange,
  lastActionMessage,
  onStopSimulation,
}: SceneAttachedFilePanelProps) {
  const versionId = attachedVersion?.id ?? "sim-v1";
  const assetId = attachedVersion?.outputAssetId ?? "simulated-output";

  return (
    <section className="aiSceneAttachedPanel">
      <article className="aiSceneCard aiSceneAttachedCard">
        <div className="aiSceneAttachedHead">
          <strong>{simulated ? "Attached File Panel (Simulated)" : "Attached File Panel"}</strong>
          <span className="aiSceneAttachedBadge">{simulated ? "SIMULATED" : "ATTACHED"}</span>
        </div>
        {attachedVersion?.thumbnailUrl ? (
          <div className="aiSceneAttachedPreview">
            <img src={attachedVersion.thumbnailUrl} alt="Attached render preview" />
          </div>
        ) : null}
        <div className="aiSceneAttachedSecondaryRow">
          <button
            type="button"
            className={`iconBtn tiny ${secondaryAction === "none" ? "activeTool" : ""}`}
            onClick={() => onSecondaryActionChange("none")}
          >
            No transform
          </button>
          <button
            type="button"
            className={`iconBtn tiny ${secondaryAction === "extend" ? "activeTool" : ""}`}
            onClick={() => onSecondaryActionChange("extend")}
          >
            Extend
          </button>
          <button
            type="button"
            className={`iconBtn tiny ${secondaryAction === "reframe" ? "activeTool" : ""}`}
            onClick={() => onSecondaryActionChange("reframe")}
          >
            Reframe
          </button>
          <button
            type="button"
            className={`iconBtn tiny ${secondaryAction === "variation" ? "activeTool" : ""}`}
            onClick={() => onSecondaryActionChange("variation")}
          >
            Variation
          </button>
          <button
            type="button"
            className={`iconBtn tiny ${secondaryAction === "extract-frame" ? "activeTool" : ""}`}
            onClick={() => onSecondaryActionChange("extract-frame")}
          >
            Extract frame
          </button>
        </div>

        {primaryAction === "video-edit" ? (
          <div className="aiSceneAttachedOptions">
            <div className="aiSceneAttachedOptionRow">
              <span>Strength</span>
              <div className="aiSceneAttachedChipRow">
                <button
                  type="button"
                  className={`iconBtn tiny ${v2vStrength === "low" ? "activeTool" : ""}`}
                  onClick={() => onV2vStrengthChange("low")}
                >
                  Low
                </button>
                <button
                  type="button"
                  className={`iconBtn tiny ${v2vStrength === "medium" ? "activeTool" : ""}`}
                  onClick={() => onV2vStrengthChange("medium")}
                >
                  Medium
                </button>
                <button
                  type="button"
                  className={`iconBtn tiny ${v2vStrength === "high" ? "activeTool" : ""}`}
                  onClick={() => onV2vStrengthChange("high")}
                >
                  High
                </button>
              </div>
            </div>
            <label className="aiSceneAttachedCheck">
              <input type="checkbox" checked={v2vKeepMotion} onChange={(event) => onV2vKeepMotionChange(event.target.checked)} />
              Keep original motion pacing
            </label>
          </div>
        ) : null}

        {primaryAction === "upscale" ? (
          <div className="aiSceneAttachedOptions">
            <div className="aiSceneAttachedOptionRow">
              <span>Scale</span>
              <div className="aiSceneAttachedChipRow">
                <button
                  type="button"
                  className={`iconBtn tiny ${upscaleFactor === 2 ? "activeTool" : ""}`}
                  onClick={() => onUpscaleFactorChange(2)}
                >
                  2x
                </button>
                <button
                  type="button"
                  className={`iconBtn tiny ${upscaleFactor === 4 ? "activeTool" : ""}`}
                  onClick={() => onUpscaleFactorChange(4)}
                >
                  4x
                </button>
              </div>
            </div>
            <label className="aiSceneAttachedCheck">
              <input
                type="checkbox"
                checked={upscaleDetailBoost}
                onChange={(event) => onUpscaleDetailBoostChange(event.target.checked)}
              />
              Detail boost
            </label>
          </div>
        ) : null}

        {primaryAction === "rerender" ? (
          <p className="hint">Use current prompt, references, and model settings. Open the composer to edit options before launching.</p>
        ) : null}

        <div className="aiSceneAttachedDelivery">
          <label className="aiSceneAttachedCheck">
            <input
              type="checkbox"
              checked={replaceInTimeline}
              onChange={(event) => onReplaceInTimelineChange(event.target.checked)}
            />
            Replace in timeline
          </label>
          <label className="aiSceneAttachedCheck">
            <input
              type="checkbox"
              checked={saveAsNewClip}
              onChange={(event) => onSaveAsNewClipChange(event.target.checked)}
            />
            Save as new clip
          </label>
        </div>

        <div className="aiSceneAttachedMeta">
          <small>Version: {versionId}</small>
          <small>Asset: {assetId}</small>
        </div>
        <div className="aiSceneAttachedActions">
          {simulated ? (
            <button type="button" className="iconBtn tiny" onClick={onStopSimulation}>
              Stop simulation
            </button>
          ) : null}
        </div>
        {lastActionMessage ? <p className="hint">{lastActionMessage}</p> : null}
      </article>
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
  onImportSlot,
  onAttachRef: _onAttachRef,
  onAddBankRef,
  onRemoveBankRef: _onRemoveBankRef,
}: AIGenerationPanelProps) {
  const [simulateAttachedPanel, setSimulateAttachedPanel] = useState(false);
  const [attachedPrimaryAction, setAttachedPrimaryAction] = useState<AttachedPrimaryAction>("rerender");
  const [attachedSecondaryAction, setAttachedSecondaryAction] = useState<AttachedSecondaryAction>("none");
  const [attachedV2vStrength, setAttachedV2vStrength] = useState<"low" | "medium" | "high">("medium");
  const [attachedV2vKeepMotion, setAttachedV2vKeepMotion] = useState(true);
  const [attachedUpscaleFactor, setAttachedUpscaleFactor] = useState<2 | 4>(2);
  const [attachedUpscaleDetailBoost, setAttachedUpscaleDetailBoost] = useState(true);
  const [attachedReplaceInTimeline, setAttachedReplaceInTimeline] = useState(true);
  const [attachedSaveAsNewClip, setAttachedSaveAsNewClip] = useState(false);
  const [attachedLastActionMessage, setAttachedLastActionMessage] = useState<string | null>(null);

  useEffect(() => {
    setSimulateAttachedPanel(false);
    setAttachedPrimaryAction("rerender");
    setAttachedSecondaryAction("none");
    setAttachedV2vStrength("medium");
    setAttachedV2vKeepMotion(true);
    setAttachedUpscaleFactor(2);
    setAttachedUpscaleDetailBoost(true);
    setAttachedReplaceInTimeline(true);
    setAttachedSaveAsNewClip(false);
    setAttachedLastActionMessage(null);
  }, [selectedClip?.id]);

  const latestVersion = useMemo(() => {
    if (!selectedClip) return null;
    return selectedClip.intentRender.versions.find((entry) => entry.id === selectedClip.intentRender.activeVersionId) ?? null;
  }, [selectedClip]);
  const sceneAttachedVersion = useMemo(() => {
    if (!selectedClip || selectedClip.intent.blockKind !== "scene") return null;
    const active =
      selectedClip.intentRender.versions.find((entry) => entry.id === selectedClip.intentRender.activeVersionId) ?? null;
    if (active?.outputAssetId) return active;
    const fallback = [...selectedClip.intentRender.versions].reverse().find((entry) => Boolean(entry.outputAssetId));
    return fallback ?? null;
  }, [selectedClip]);
  const sceneIntent = selectedClip?.intent.blockKind === "scene" ? selectedClip.intent : null;
  const hasAttachedSceneFile = Boolean(sceneAttachedVersion?.outputAssetId);
  const hasAttachedContext =
    selection.kind === "scene-block" && Boolean(selectedClip) && (hasAttachedSceneFile || simulateAttachedPanel);
  const showSceneAttachedPanel = hasAttachedContext && attachedPrimaryAction !== "rerender";
  const scenePromptReady = sceneIntent
    ? sceneIntent.sceneComposer.multiPrompt.enabled
      ? sceneIntent.sceneComposer.multiPrompt.shots.some((entry) => entry.prompt.trim().length > 0)
      : sceneIntent.prompt.trim().length > 0
    : true;
  const attachedActionPrice = useMemo(() => {
    if (!sceneIntent) return 0;
    const base = estimateScenePrice(sceneIntent);
    const primaryMultiplier =
      attachedPrimaryAction === "video-edit"
        ? 1.12
        : attachedPrimaryAction === "upscale"
          ? attachedUpscaleFactor === 4
            ? 0.62
            : 0.38
          : 1;
    const secondaryExtra =
      attachedSecondaryAction === "none"
        ? 0
        : attachedSecondaryAction === "extract-frame"
          ? 0.05
          : attachedSecondaryAction === "reframe"
            ? 0.12
            : attachedSecondaryAction === "variation"
              ? 0.2
              : 0.16;
    const v2vExtra =
      attachedPrimaryAction === "video-edit"
        ? attachedV2vStrength === "high"
          ? 0.22
          : attachedV2vStrength === "medium"
            ? 0.13
            : 0.08
        : 0;
    const upscaleExtra = attachedPrimaryAction === "upscale" && attachedUpscaleDetailBoost ? 0.07 : 0;
    return Math.round((base * primaryMultiplier + secondaryExtra + v2vExtra + upscaleExtra) * 100) / 100;
  }, [
    attachedPrimaryAction,
    attachedSecondaryAction,
    attachedUpscaleDetailBoost,
    attachedUpscaleFactor,
    attachedV2vStrength,
    sceneIntent,
  ]);
  const canGenerate = showSceneAttachedPanel ? Boolean(selectedClip) : Boolean(selectedClip) && scenePromptReady;
  const defaultGenerateLabel = sceneIntent
    ? `Generate · ~$${estimateScenePrice(sceneIntent).toFixed(2)}`
    : "Generate new version";
  const attachedGenerateLabel =
    attachedPrimaryAction === "video-edit"
      ? `Video Edit · ~$${attachedActionPrice.toFixed(2)}`
      : attachedPrimaryAction === "upscale"
        ? `Upscale · ~$${attachedActionPrice.toFixed(2)}`
        : `Re-render · ~$${attachedActionPrice.toFixed(2)}`;
  const generateLabel = hasAttachedContext ? attachedGenerateLabel : defaultGenerateLabel;
  const helperText = !selectedClip
    ? "Select a block to generate."
    : showSceneAttachedPanel
      ? "Use the sticky CTA to run the selected action for this attached file."
    : hasAttachedContext
      ? "Re-render mode: edit settings, then use the sticky CTA."
    : !scenePromptReady
      ? "Add prompt text before generating."
      : sceneIntent
        ? "Estimated cost updates with duration, mode, and audio."
        : null;
  const runStickyGenerate = () => {
    if (!hasAttachedContext) {
      onGenerate();
      return;
    }
    if (attachedPrimaryAction === "rerender") {
      onGenerate();
      setAttachedLastActionMessage("Re-render queued with current Scene Block settings.");
      return;
    }
    const actionText = attachedPrimaryAction === "video-edit" ? "Video Edit (Kling V2V)" : "Upscale";
    const deliveryText = attachedReplaceInTimeline
      ? "replace in timeline"
      : attachedSaveAsNewClip
        ? "save as new clip"
        : "keep as detached output";
    setAttachedLastActionMessage(`${actionText} queued (${deliveryText}) — simulation mode.`);
  };
  const setAttachedPrimaryMode = (next: AttachedPrimaryAction) => {
    setAttachedPrimaryAction(next);
    setAttachedLastActionMessage(null);
  };

  return (
    <div className="aiGenerationPanel aiGenerationPanelComposer">
      <div className="aiGenAccordion">
        {selection.kind === "none" ? <EmptyState /> : null}
        {selection.kind === "scene-block" && selectedClip ? (
          <>
            {hasAttachedContext ? (
              <div className="aiSceneAttachedPrimaryRow aiScenePanelInlineAction">
                <button
                  type="button"
                  className={`iconBtn tiny ${attachedPrimaryAction === "rerender" ? "activeTool" : ""}`}
                  onClick={() => setAttachedPrimaryMode("rerender")}
                >
                  Re-render
                </button>
                <button
                  type="button"
                  className={`iconBtn tiny ${attachedPrimaryAction === "video-edit" ? "activeTool" : ""}`}
                  onClick={() => setAttachedPrimaryMode("video-edit")}
                >
                  Video Edit (V2V)
                </button>
                <button
                  type="button"
                  className={`iconBtn tiny ${attachedPrimaryAction === "upscale" ? "activeTool" : ""}`}
                  onClick={() => setAttachedPrimaryMode("upscale")}
                >
                  Upscale
                </button>
                {simulateAttachedPanel ? (
                  <button
                    type="button"
                    className="iconBtn tiny"
                    onClick={() => {
                      setSimulateAttachedPanel(false);
                      setAttachedPrimaryAction("rerender");
                      setAttachedLastActionMessage(null);
                    }}
                  >
                    Stop simulation
                  </button>
                ) : null}
              </div>
            ) : (
              <button type="button" className="iconBtn tiny aiScenePanelInlineAction" onClick={() => setSimulateAttachedPanel(true)}>
                Simulate attached file panel
              </button>
            )}
            {showSceneAttachedPanel ? (
              <SceneAttachedFilePanel
                attachedVersion={sceneAttachedVersion}
                simulated={!hasAttachedSceneFile}
                primaryAction={attachedPrimaryAction}
                secondaryAction={attachedSecondaryAction}
                onSecondaryActionChange={(next) => {
                  setAttachedSecondaryAction(next);
                  setAttachedLastActionMessage(null);
                }}
                v2vStrength={attachedV2vStrength}
                onV2vStrengthChange={(next) => {
                  setAttachedV2vStrength(next);
                  setAttachedLastActionMessage(null);
                }}
                v2vKeepMotion={attachedV2vKeepMotion}
                onV2vKeepMotionChange={(next) => {
                  setAttachedV2vKeepMotion(next);
                  setAttachedLastActionMessage(null);
                }}
                upscaleFactor={attachedUpscaleFactor}
                onUpscaleFactorChange={(next) => {
                  setAttachedUpscaleFactor(next);
                  setAttachedLastActionMessage(null);
                }}
                upscaleDetailBoost={attachedUpscaleDetailBoost}
                onUpscaleDetailBoostChange={(next) => {
                  setAttachedUpscaleDetailBoost(next);
                  setAttachedLastActionMessage(null);
                }}
                replaceInTimeline={attachedReplaceInTimeline}
                onReplaceInTimelineChange={(next) => {
                  setAttachedReplaceInTimeline(next);
                  if (next) setAttachedSaveAsNewClip(false);
                  setAttachedLastActionMessage(null);
                }}
                saveAsNewClip={attachedSaveAsNewClip}
                onSaveAsNewClipChange={(next) => {
                  setAttachedSaveAsNewClip(next);
                  if (next) setAttachedReplaceInTimeline(false);
                  setAttachedLastActionMessage(null);
                }}
                lastActionMessage={attachedLastActionMessage}
                onStopSimulation={() => {
                  setSimulateAttachedPanel(false);
                  setAttachedPrimaryAction("rerender");
                  setAttachedLastActionMessage(null);
                }}
              />
            ) : (
              <SceneBlockComposer
                selectedClip={selectedClip}
                referenceBank={referenceBank}
                sourceContext={sourceContext}
                onContractChange={onContractChange}
                onSetFrame={onSetFrame}
                onContinueFromPrevious={onContinueFromPrevious}
                onImportSlot={onImportSlot}
                onAddBankRef={onAddBankRef}
              />
            )}
          </>
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
        <div className="aiGenFooterMeta">
          <span>{selectedClip ? `${selectedClip.intentRender.versions.length} version(s)` : "No block selected"}</span>
          <span>{selectedClip ? `${selectedClip.intentRender.progressPct}%` : "0%"}</span>
        </div>
        <button type="button" className="aiGenerateBtn" onClick={runStickyGenerate} disabled={!canGenerate}>
          {generateLabel}
        </button>
        {selectedClip?.intentRender.status === "failed" && latestVersion ? (
          <button type="button" className="iconBtn" onClick={() => onRetryVersion(latestVersion.id)}>
            Retry failed version
          </button>
        ) : null}
        {helperText ? <p className="hint">{helperText}</p> : null}
        {selectedClip?.intentRender.error ? (
          <p className="hint">{selectedClip.intentRender.error}</p>
        ) : null}
      </footer>
    </div>
  );
}
