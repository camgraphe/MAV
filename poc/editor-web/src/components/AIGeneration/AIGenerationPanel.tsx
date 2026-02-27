import { useMemo, useState } from "react";
import type {
  AIGenerationSourceContext,
  IntentContract,
  IntentRefStrength,
  IntentReferenceBank,
  IntentRenderVersion,
} from "../../ai-generation/types";
import { AIGenField, AIGenSection, AIGenTag } from "./AIGenerationSections";

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

type AIGenerationPanelProps = {
  selectedClip: IntentClipPanelState | null;
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
    strength: IntentRefStrength,
  ) => void;
  onAddBankRef: (target: "characters" | "objects", source: "source-monitor" | "timeline-program") => void;
  onRemoveBankRef: (target: "characters" | "objects", bankRefId: string) => void;
};

type SectionId = "intent" | "frames" | "characters" | "objects" | "angles" | "motion" | "output" | "advanced";

const ANGLE_PRESETS: Array<{ id: NonNullable<IntentContract["anglePreset"]>; label: string; hint: string }> = [
  { id: "wide", label: "Wide", hint: "Establishing" },
  { id: "close-up", label: "Close-up", hint: "Subject detail" },
  { id: "ots-left", label: "OTS Left", hint: "Over shoulder" },
  { id: "ots-right", label: "OTS Right", hint: "Reverse shoulder" },
  { id: "low-angle", label: "Low", hint: "Dominant" },
  { id: "high-angle", label: "High", hint: "Overview" },
  { id: "profile-left", label: "Profile L", hint: "Lateral" },
  { id: "profile-right", label: "Profile R", hint: "Lateral" },
];

function formatTimeLabel(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  const millis = (safe % 1000).toString().padStart(3, "0");
  return `${minutes}:${seconds}.${millis}`;
}

function readRefStrength(contract: IntentContract, target: "characterRefs" | "objectRefs", bankRefId: string): IntentRefStrength {
  const found = contract[target].find((entry) => entry.bankRefId === bankRefId);
  return found?.strength ?? "medium";
}

export function AIGenerationPanel({
  selectedClip,
  referenceBank,
  sourceContext,
  onContractChange,
  onGenerate,
  onRetryVersion,
  onSetFrame,
  onContinueFromPrevious,
  onAttachRef,
  onAddBankRef,
  onRemoveBankRef,
}: AIGenerationPanelProps) {
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    intent: true,
    frames: true,
    characters: true,
    objects: true,
    angles: true,
    motion: true,
    output: true,
    advanced: false,
  });

  const toggleSection = (id: string) => {
    const key = id as SectionId;
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const latestVersion = useMemo(() => {
    if (!selectedClip) return null;
    return selectedClip.intentRender.versions.find((entry) => entry.id === selectedClip.intentRender.activeVersionId) ?? null;
  }, [selectedClip]);

  if (!selectedClip) {
    return (
      <div className="aiGenerationPanel">
        <header className="panelHeader aiGenHeader">
          <h2>Clip Composer</h2>
          <div className="aiGenCapsRow">
            <AIGenTag>Intent-first</AIGenTag>
            <AIGenTag>Timeline native</AIGenTag>
          </div>
        </header>
        <section className="aiComposerEmpty">
          <p className="hint">Select an intent block in timeline to edit generation settings.</p>
          <p className="hint">Create new blocks from Media &gt; Intent Blocks.</p>
        </section>
      </div>
    );
  }

  const intent = selectedClip.intent;
  const intentTemplateMode: "scene" | "vo" =
    intent.blockKind === "vo" || intent.blockKind === "music" || intent.blockKind === "sfx" ? "vo" : "scene";
  const isAudioIntent = intentTemplateMode === "vo";

  return (
    <div className="aiGenerationPanel">
      <header className="panelHeader aiGenHeader">
        <h2>Clip Composer</h2>
        <div className="aiGenCapsRow">
          <AIGenTag>{intent.blockKind.toUpperCase()}</AIGenTag>
          <AIGenTag>{selectedClip.intentRender.status.toUpperCase()}</AIGenTag>
          <AIGenTag>{latestVersion?.id ?? "V0"}</AIGenTag>
          {selectedClip.intentRender.hasDraftChanges ? <AIGenTag>Draft changes</AIGenTag> : null}
        </div>
      </header>

      <div className="aiGenAccordion">
        <AIGenSection id="intent" title="Intent" subtitle="Goal and narration" open={openSections.intent} onToggle={toggleSection}>
          <div className="aiGenGrid twoCols">
            <AIGenField label="Block title">
              <input
                type="text"
                value={intent.title}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    title: event.target.value,
                  })
                }
              />
            </AIGenField>
            <AIGenField label="Template">
              <select
                value={intentTemplateMode}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    blockKind: (event.target.value === "vo" ? "vo" : "scene") as IntentContract["blockKind"],
                  })
                }
              >
                <option value="scene">Video Intent</option>
                <option value="vo">Audio Intent</option>
              </select>
            </AIGenField>
          </div>

          <AIGenField label={isAudioIntent ? "Audio direction" : "Visual prompt"}>
            <textarea
              className="aiGenPromptInput"
              rows={4}
              value={intent.prompt}
              onChange={(event) =>
                onContractChange({
                  ...intent,
                  prompt: event.target.value,
                })
              }
            />
          </AIGenField>

          {!isAudioIntent ? (
            <AIGenField label="Negative prompt">
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
            </AIGenField>
          ) : null}
        </AIGenSection>

        {!isAudioIntent ? (
          <>
            <AIGenSection id="frames" title="Frames" subtitle="First frame / End frame" open={openSections.frames} onToggle={toggleSection}>
              <div className="aiRefCards twoCols">
                <article className={`aiRefCard ${intent.firstFrame ? "isSet" : "isEmpty"}`}>
                  <header>
                    <strong>First frame</strong>
                    <span>{intent.firstFrame ? "set" : "empty"}</span>
                  </header>
                  <p>{intent.firstFrame ? `${intent.firstFrame.assetLabel} @ ${formatTimeLabel(intent.firstFrame.timeMs)}` : "No frame"}</p>
                  <div className="buttons">
                    <button type="button" className="iconBtn tiny" onClick={() => onSetFrame("first", "timeline-program")}>Use playhead</button>
                    <button type="button" className="iconBtn tiny" onClick={() => onSetFrame("first", "source-monitor")}>Use source</button>
                  </div>
                </article>
                <article className={`aiRefCard ${intent.endFrame ? "isSet" : "isEmpty"}`}>
                  <header>
                    <strong>End frame</strong>
                    <span>{intent.endFrame ? "set" : "empty"}</span>
                  </header>
                  <p>{intent.endFrame ? `${intent.endFrame.assetLabel} @ ${formatTimeLabel(intent.endFrame.timeMs)}` : "No frame"}</p>
                  <div className="buttons">
                    <button type="button" className="iconBtn tiny" onClick={() => onSetFrame("end", "timeline-program")}>Use playhead</button>
                    <button type="button" className="iconBtn tiny" onClick={() => onSetFrame("end", "source-monitor")}>Use source</button>
                  </div>
                </article>
              </div>
              <div className="buttons">
                <button type="button" className="iconBtn" onClick={onContinueFromPrevious}>Continue from previous</button>
              </div>
            </AIGenSection>

            <AIGenSection id="characters" title="Characters" subtitle="Reference bank links" open={openSections.characters} onToggle={toggleSection}>
              <div className="buttons">
                <button type="button" className="iconBtn" onClick={() => onAddBankRef("characters", "timeline-program")}>Use timeline frame as Character</button>
                <button type="button" className="iconBtn" onClick={() => onAddBankRef("characters", "source-monitor")}>Use source frame as Character</button>
              </div>
              <div className="aiReferenceList">
                {referenceBank.characters.length === 0 ? <p className="hint">No character reference yet.</p> : null}
                {referenceBank.characters.map((ref) => {
                  const enabled = intent.characterRefs.some((entry) => entry.bankRefId === ref.id);
                  const strength = readRefStrength(intent, "characterRefs", ref.id);
                  return (
                    <article key={ref.id} className="aiReferenceItem">
                      <div className="aiReferenceItemMeta">
                        <strong>{ref.label}</strong>
                        <small>{formatTimeLabel(ref.timeMs)} · {ref.source}</small>
                      </div>
                      <div className="aiReferenceItemControls">
                        <select
                          value={strength}
                          disabled={!enabled}
                          onChange={(event) =>
                            onAttachRef("characterRefs", ref.id, true, event.target.value as IntentRefStrength)
                          }
                        >
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                        </select>
                        <button type="button" className={`iconBtn tiny ${enabled ? "activeTool" : ""}`} onClick={() => onAttachRef("characterRefs", ref.id, !enabled, strength)}>
                          {enabled ? "Linked" : "Link"}
                        </button>
                        <button type="button" className="iconBtn tiny dangerBtn" onClick={() => onRemoveBankRef("characters", ref.id)}>✕</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </AIGenSection>

            <AIGenSection id="objects" title="Objets" subtitle="Reference bank links" open={openSections.objects} onToggle={toggleSection}>
              <div className="buttons">
                <button type="button" className="iconBtn" onClick={() => onAddBankRef("objects", "timeline-program")}>Use timeline frame as Objet</button>
                <button type="button" className="iconBtn" onClick={() => onAddBankRef("objects", "source-monitor")}>Use source frame as Objet</button>
              </div>
              <div className="aiReferenceList">
                {referenceBank.objects.length === 0 ? <p className="hint">No object reference yet.</p> : null}
                {referenceBank.objects.map((ref) => {
                  const enabled = intent.objectRefs.some((entry) => entry.bankRefId === ref.id);
                  const strength = readRefStrength(intent, "objectRefs", ref.id);
                  return (
                    <article key={ref.id} className="aiReferenceItem">
                      <div className="aiReferenceItemMeta">
                        <strong>{ref.label}</strong>
                        <small>{formatTimeLabel(ref.timeMs)} · {ref.source}</small>
                      </div>
                      <div className="aiReferenceItemControls">
                        <select
                          value={strength}
                          disabled={!enabled}
                          onChange={(event) =>
                            onAttachRef("objectRefs", ref.id, true, event.target.value as IntentRefStrength)
                          }
                        >
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                        </select>
                        <button type="button" className={`iconBtn tiny ${enabled ? "activeTool" : ""}`} onClick={() => onAttachRef("objectRefs", ref.id, !enabled, strength)}>
                          {enabled ? "Linked" : "Link"}
                        </button>
                        <button type="button" className="iconBtn tiny dangerBtn" onClick={() => onRemoveBankRef("objects", ref.id)}>✕</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </AIGenSection>

            <AIGenSection id="angles" title="Angles" subtitle="2x4 visual explorer" open={openSections.angles} onToggle={toggleSection}>
              <div className="angleGrid">
                {ANGLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`angleCard ${intent.anglePreset === preset.id ? "active" : ""}`}
                    onClick={() => {
                      const timelineFrame =
                        sourceContext.timelineAssetId != null
                          ? {
                              assetId: sourceContext.timelineAssetId,
                              assetLabel: sourceContext.timelineAssetLabel,
                              timeMs: sourceContext.timelinePlayheadMs,
                              thumbnailUrl: sourceContext.timelineThumbnailUrl,
                              source: "timeline-program" as const,
                            }
                          : null;
                      onContractChange({
                        ...intent,
                        anglePreset: preset.id,
                        firstFrame: intent.firstFrame ?? timelineFrame,
                      });
                    }}
                  >
                    <strong>{preset.label}</strong>
                    <small>{preset.hint}</small>
                  </button>
                ))}
              </div>
              <AIGenField label="Match lens & lighting">
                <select
                  value={intent.matchLensAndLighting ? "on" : "off"}
                  onChange={(event) =>
                    onContractChange({
                      ...intent,
                      matchLensAndLighting: event.target.value === "on",
                    })
                  }
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </AIGenField>
            </AIGenSection>

            <AIGenSection id="motion" title="Motion" subtitle="Camera movement behavior" open={openSections.motion} onToggle={toggleSection}>
              <div className="aiGenGrid twoCols">
                <AIGenField label="Movement">
                  <select
                    value={intent.motion.movement}
                    onChange={(event) =>
                      onContractChange({
                        ...intent,
                        motion: {
                          ...intent.motion,
                          movement: event.target.value as IntentContract["motion"]["movement"],
                        },
                      })
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="pan">Pan</option>
                    <option value="tilt">Tilt</option>
                    <option value="dolly">Dolly</option>
                    <option value="orbit">Orbit</option>
                  </select>
                </AIGenField>
                <AIGenField label="Intensity">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={intent.motion.intensity}
                    onChange={(event) =>
                      onContractChange({
                        ...intent,
                        motion: {
                          ...intent.motion,
                          intensity: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                        },
                      })
                    }
                  />
                </AIGenField>
              </div>
            </AIGenSection>
          </>
        ) : null}

        <AIGenSection id="output" title="Output" subtitle="Duration and format" open={openSections.output} onToggle={toggleSection}>
          <div className={`aiGenGrid ${isAudioIntent ? "twoCols" : "threeCols"}`}>
            {!isAudioIntent ? (
              <AIGenField label="Aspect ratio">
                <select
                  value={intent.output.aspectRatio}
                  onChange={(event) =>
                    onContractChange({
                      ...intent,
                      output: {
                        ...intent.output,
                        aspectRatio: event.target.value as IntentContract["output"]["aspectRatio"],
                      },
                    })
                  }
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="4:5">4:5</option>
                  <option value="21:9">21:9</option>
                </select>
              </AIGenField>
            ) : null}
            <AIGenField label="Duration (s)">
              <input
                type="number"
                min={1}
                max={30}
                value={intent.output.durationSec}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    output: {
                      ...intent.output,
                      durationSec: Math.max(1, Math.min(30, Number(event.target.value) || 1)),
                    },
                  })
                }
                />
              </AIGenField>
            {!isAudioIntent ? (
              <AIGenField label="FPS">
                <select
                  value={intent.output.fps}
                  onChange={(event) =>
                    onContractChange({
                      ...intent,
                      output: {
                        ...intent.output,
                        fps: Number(event.target.value) as IntentContract["output"]["fps"],
                      },
                    })
                  }
                >
                  <option value={24}>24</option>
                  <option value={25}>25</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </AIGenField>
            ) : null}
          </div>
        </AIGenSection>

        <AIGenSection id="advanced" title={isAudioIntent ? "Audio Characteristics" : "Advanced"} subtitle={isAudioIntent ? "Voice / music / SFX direction" : "Audio intention (minimal)"} open={openSections.advanced} onToggle={toggleSection}>
          <AIGenField label="Audio text">
            <textarea
              rows={3}
              value={intent.audio.text}
              onChange={(event) =>
                onContractChange({
                  ...intent,
                  audio: {
                    ...intent.audio,
                    text: event.target.value,
                  },
                })
              }
            />
          </AIGenField>
          <div className="aiGenGrid twoCols">
            <AIGenField label="Mood">
              <input
                type="text"
                value={intent.audio.mood}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    audio: {
                      ...intent.audio,
                      mood: event.target.value,
                    },
                  })
                }
              />
            </AIGenField>
            <AIGenField label="Tempo">
              <input
                type="number"
                min={40}
                max={220}
                value={intent.audio.tempo}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    audio: {
                      ...intent.audio,
                      tempo: Math.max(40, Math.min(220, Number(event.target.value) || 40)),
                    },
                  })
                }
              />
            </AIGenField>
            <AIGenField label="Intensity">
              <input
                type="range"
                min={0}
                max={100}
                value={intent.audio.intensity}
                onChange={(event) =>
                  onContractChange({
                    ...intent,
                    audio: {
                      ...intent.audio,
                      intensity: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                    },
                  })
                }
              />
            </AIGenField>
          </div>
        </AIGenSection>
      </div>

      <footer className="aiGenStickyFooter">
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
      </footer>
    </div>
  );
}
