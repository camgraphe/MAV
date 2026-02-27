import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { buildEffectiveConfig, ENGINE_MODELS, resolveEngineCapabilities } from "../../ai-generation/capabilities";
import { findMentionSuggestions } from "../../ai-generation/mentions";
import { normalizeAIGenConfig } from "../../ai-generation/defaults";
import type {
  AIGenConfig,
  AIGenFrameRef,
  AIGenPreset,
  AIGenReference,
  AIGenReferenceRole,
  AIGenerationRequestRecord,
  AIGenerationSourceContext,
  LegacySilenceCutState,
  MentionCandidate,
  PromptVersionRecord,
} from "../../ai-generation/types";
import { AIGenField, AIGenSection, AIGenTag } from "./AIGenerationSections";

type AIGenerationPanelProps = {
  config: AIGenConfig;
  history: AIGenerationRequestRecord[];
  promptVersions: PromptVersionRecord[];
  presets: AIGenPreset[];
  mentionCandidates: MentionCandidate[];
  sourceContext: AIGenerationSourceContext;
  legacySilenceCut: LegacySilenceCutState;
  onConfigChange: (next: AIGenConfig) => void;
  onGenerate: () => void;
  onSavePreset: (name: string) => void;
  onApplyPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onRunLegacySilenceCut: () => void;
  onApplyLegacySilenceCut: () => void;
};

type SectionId = "prompt" | "engine" | "output" | "motion" | "frames" | "references" | "advanced";

const SECTION_ORDER: SectionId[] = ["prompt", "engine", "output", "motion", "frames", "references", "advanced"];

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

function createFrameRef(
  source: "source-monitor" | "timeline-program",
  context: AIGenerationSourceContext,
): AIGenFrameRef | null {
  if (source === "source-monitor") {
    if (!context.sourceAssetId) return null;
    return {
      assetId: context.sourceAssetId,
      assetLabel: context.sourceAssetLabel || "Source",
      timeMs: Math.max(0, Math.round(context.sourcePlayheadMs)),
      thumbnailUrl: context.sourceThumbnailUrl,
      source,
    };
  }

  if (!context.timelineAssetId) return null;
  return {
    assetId: context.timelineAssetId,
    assetLabel: context.timelineAssetLabel || "Timeline",
    timeMs: Math.max(0, Math.round(context.timelinePlayheadMs)),
    thumbnailUrl: context.timelineThumbnailUrl,
    source,
  };
}

function resolveFrameMode(startFrame: AIGenFrameRef | null, endFrame: AIGenFrameRef | null): AIGenConfig["frames"]["mode"] {
  if (startFrame && endFrame) return "start-end";
  if (startFrame) return "start-only";
  if (endFrame) return "end-only";
  return "none";
}

function nextCurvePointY(current: AIGenConfig, index: number, yPercent: number): AIGenConfig {
  const curve = [...current.motion.customCurve];
  const target = curve[index];
  if (!target) return current;
  curve[index] = {
    ...target,
    y: Math.max(0, Math.min(1, yPercent / 100)),
  };
  return {
    ...current,
    motion: {
      ...current.motion,
      customCurve: curve,
    },
  };
}

export function AIGenerationPanel({
  config,
  history,
  promptVersions,
  presets,
  mentionCandidates,
  sourceContext,
  legacySilenceCut,
  onConfigChange,
  onGenerate,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onRunLegacySilenceCut,
  onApplyLegacySilenceCut,
}: AIGenerationPanelProps) {
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    prompt: true,
    engine: true,
    output: true,
    motion: true,
    frames: true,
    references: true,
    advanced: false,
  });
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [newRefRole, setNewRefRole] = useState<AIGenReferenceRole>("style");
  const [mentionState, setMentionState] = useState<{ start: number; end: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const refUploadInputRef = useRef<HTMLInputElement | null>(null);

  const engineCapabilities = resolveEngineCapabilities(config.engine.engineId);
  const availableModels = ENGINE_MODELS[config.engine.engineId] ?? [];
  const modeSupported = engineCapabilities.supportedModes.includes(config.engine.mode);

  const mentionSuggestions = useMemo(
    () => findMentionSuggestions(mentionState?.query ?? "", mentionCandidates, 8),
    [mentionCandidates, mentionState?.query],
  );

  const referencesCount = config.references.items.length;
  const referencesRemaining = Math.max(0, engineCapabilities.maxReferences - referencesCount);

  const canGenerate = config.prompt.text.trim().length > 0 && modeSupported;
  const { gatedOffFields } = useMemo(() => buildEffectiveConfig(config), [config]);

  const toggleSection = (sectionId: string) => {
    if (!SECTION_ORDER.includes(sectionId as SectionId)) return;
    const key = sectionId as SectionId;
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const patchConfig = (next: AIGenConfig) => {
    onConfigChange(normalizeAIGenConfig(next));
  };

  const updatePromptMentionSuggestions = () => {
    const textarea = promptRef.current;
    if (!textarea) {
      setMentionState(null);
      return;
    }
    const cursor = textarea.selectionStart ?? 0;
    const before = config.prompt.text.slice(0, cursor);
    const match = /(?:^|\s)@([a-z0-9-]*)$/i.exec(before);
    if (!match) {
      setMentionState(null);
      return;
    }
    const query = match[1] ?? "";
    const end = cursor;
    const start = end - query.length - 1;
    setMentionState({ start, end, query });
    setMentionIndex(0);
  };

  const insertMention = (candidate: MentionCandidate) => {
    const state = mentionState;
    if (!state) return;

    const prefix = config.prompt.text.slice(0, state.start);
    const suffix = config.prompt.text.slice(state.end);
    const mentionToken = `@${candidate.token}`;
    const separator = suffix.startsWith(" ") || suffix.length === 0 ? "" : " ";
    const nextText = `${prefix}${mentionToken}${separator}${suffix}`;

    const mentionExists = config.prompt.mentions.some((mention) => mention.id === candidate.id);
    const nextMentions = mentionExists
      ? config.prompt.mentions
      : [
          ...config.prompt.mentions,
          {
            id: candidate.id,
            label: candidate.label,
            token: candidate.token,
            kind: candidate.kind,
            tags: candidate.tags,
          },
        ];

    patchConfig({
      ...config,
      prompt: {
        ...config.prompt,
        text: nextText,
        mentions: nextMentions,
      },
    });

    setMentionState(null);
    window.requestAnimationFrame(() => {
      const textarea = promptRef.current;
      if (!textarea) return;
      const nextPos = prefix.length + mentionToken.length + separator.length;
      textarea.focus();
      textarea.setSelectionRange(nextPos, nextPos);
    });
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionState || mentionSuggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      insertMention(mentionSuggestions[Math.max(0, mentionIndex)]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setMentionState(null);
    }
  };

  const addReference = (nextRef: AIGenReference) => {
    if (referencesRemaining <= 0) return;
    if (!engineCapabilities.supportedReferenceKinds.includes(nextRef.kind)) return;
    patchConfig({
      ...config,
      references: {
        items: [...config.references.items, nextRef].slice(0, engineCapabilities.maxReferences),
      },
    });
  };

  const addFrameReference = (source: "source-monitor" | "timeline-program") => {
    const frame = createFrameRef(source, sourceContext);
    if (!frame) return;
    addReference({
      id: crypto.randomUUID(),
      kind: "frame",
      source: source === "source-monitor" ? "source-monitor" : "timeline",
      role: newRefRole,
      weight: 70,
      locked: false,
      url: frame.thumbnailUrl ?? "",
      label: `${frame.assetLabel} @ ${formatTimeLabel(frame.timeMs)}`,
      timeMs: frame.timeMs,
    });
  };

  const setFrame = (target: "start" | "end", source: "source-monitor" | "timeline-program") => {
    const frame = createFrameRef(source, sourceContext);
    if (!frame) return;

    const startFrame = target === "start" ? frame : config.frames.startFrame;
    const endFrame = target === "end" ? frame : config.frames.endFrame;
    patchConfig({
      ...config,
      frames: {
        ...config.frames,
        startFrame,
        endFrame,
        mode: resolveFrameMode(startFrame, endFrame),
      },
    });
  };

  return (
    <div className="aiGenerationPanel">
      <header className="panelHeader aiGenHeader">
        <h2>AI Generation</h2>
        <div className="aiGenCapsRow">
          <AIGenTag>{config.engine.engineId.toUpperCase()}</AIGenTag>
          <AIGenTag>{config.engine.mode.toUpperCase()}</AIGenTag>
          <AIGenTag>{engineCapabilities.maxReferences} refs max</AIGenTag>
          {gatedOffFields.length > 0 ? <AIGenTag>{gatedOffFields.length} gated field(s)</AIGenTag> : null}
        </div>
      </header>

      <div className="aiGenAccordion">
        <AIGenSection
          id="prompt"
          title="Prompt"
          subtitle="Describe scene, mentions, guidance and seed"
          open={openSections.prompt}
          onToggle={toggleSection}
        >
          <AIGenField label="Scene description">
            <textarea
              ref={promptRef}
              className="aiGenPromptInput"
              rows={4}
              placeholder="Describe your scene - use @ to add characters & props"
              value={config.prompt.text}
              onChange={(event) => {
                patchConfig({
                  ...config,
                  prompt: {
                    ...config.prompt,
                    text: event.target.value,
                  },
                });
                updatePromptMentionSuggestions();
              }}
              onKeyDown={handlePromptKeyDown}
              onClick={updatePromptMentionSuggestions}
              onKeyUp={updatePromptMentionSuggestions}
            />
            {mentionState && mentionSuggestions.length > 0 ? (
              <div className="aiMentionList" role="listbox" aria-label="Mention suggestions">
                {mentionSuggestions.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`aiMentionItem ${index === mentionIndex ? "activeMention" : ""}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMention(item);
                    }}
                  >
                    <span>@{item.token}</span>
                    <small>
                      {item.label} · {item.kind}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
          </AIGenField>

          <AIGenField
            label="Negative prompt"
            disabled={!engineCapabilities.supportsNegativePrompt}
            title={!engineCapabilities.supportsNegativePrompt ? `${config.engine.engineId}: negative prompt unsupported` : undefined}
          >
            <textarea
              rows={2}
              value={config.prompt.negativeText}
              disabled={!engineCapabilities.supportsNegativePrompt}
              onChange={(event) =>
                patchConfig({
                  ...config,
                  prompt: {
                    ...config.prompt,
                    negativeText: event.target.value,
                  },
                })
              }
            />
          </AIGenField>

          <div className="aiGenGrid twoCols">
            <AIGenField
              label="Prompt adherence"
              disabled={!engineCapabilities.supportsAdherence}
              title={!engineCapabilities.supportsAdherence ? `${config.engine.engineId}: adherence unsupported` : undefined}
            >
              <input
                type="range"
                min={0}
                max={100}
                disabled={!engineCapabilities.supportsAdherence}
                value={config.prompt.adherence}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    prompt: {
                      ...config.prompt,
                      adherence: Number(event.target.value),
                    },
                  })
                }
              />
              <input
                type="number"
                min={0}
                max={100}
                disabled={!engineCapabilities.supportsAdherence}
                value={config.prompt.adherence}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    prompt: {
                      ...config.prompt,
                      adherence: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>

            <AIGenField label="Variation count">
              <input
                type="number"
                min={1}
                max={16}
                value={config.prompt.variationCount}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    prompt: {
                      ...config.prompt,
                      variationCount: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>
          </div>

          <div className="aiGenGrid twoCols">
            <AIGenField label="Seed mode">
              <select
                value={config.prompt.seedMode}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    prompt: {
                      ...config.prompt,
                      seedMode: event.target.value === "fixed" ? "fixed" : "random",
                    },
                  })
                }
              >
                <option value="random">Random</option>
                <option value="fixed" disabled={!engineCapabilities.supportsFixedSeed}>
                  Fixed
                </option>
              </select>
            </AIGenField>
            <AIGenField
              label="Seed"
              disabled={config.prompt.seedMode !== "fixed" || !engineCapabilities.supportsFixedSeed}
              title={!engineCapabilities.supportsFixedSeed ? `${config.engine.engineId}: fixed seed unsupported` : undefined}
            >
              <input
                type="number"
                min={0}
                disabled={config.prompt.seedMode !== "fixed" || !engineCapabilities.supportsFixedSeed}
                value={config.prompt.seed ?? 0}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    prompt: {
                      ...config.prompt,
                      seed: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>
          </div>
        </AIGenSection>

        <AIGenSection id="engine" title="Engine" subtitle="Model selection and capability hints" open={openSections.engine} onToggle={toggleSection}>
          <div className="aiGenModeRow" role="tablist" aria-label="Generation mode">
            <button
              type="button"
              className={config.engine.mode === "image" ? "activeMode" : ""}
              title={engineCapabilities.supportedModes.includes("image") ? "" : `${config.engine.engineId}: image mode unsupported`}
              disabled={!engineCapabilities.supportedModes.includes("image")}
              onClick={() =>
                patchConfig({
                  ...config,
                  engine: {
                    ...config.engine,
                    mode: "image",
                  },
                })
              }
            >
              Image
            </button>
            <button
              type="button"
              className={config.engine.mode === "video" ? "activeMode" : ""}
              title={engineCapabilities.supportedModes.includes("video") ? "" : `${config.engine.engineId}: video mode unsupported`}
              disabled={!engineCapabilities.supportedModes.includes("video")}
              onClick={() =>
                patchConfig({
                  ...config,
                  engine: {
                    ...config.engine,
                    mode: "video",
                  },
                })
              }
            >
              Video
            </button>
          </div>

          <div className="aiGenGrid twoCols">
            <AIGenField label="Engine / Provider">
              <select
                value={config.engine.engineId}
                onChange={(event) => {
                  const nextEngine = event.target.value as AIGenConfig["engine"]["engineId"];
                  const nextModels = ENGINE_MODELS[nextEngine] ?? [];
                  patchConfig({
                    ...config,
                    engine: {
                      ...config.engine,
                      engineId: nextEngine,
                      modelId: nextModels[0] ?? config.engine.modelId,
                    },
                  });
                }}
              >
                <option value="veo">Veo</option>
                <option value="sora">Sora</option>
                <option value="kling">Kling</option>
                <option value="luma">Luma</option>
                <option value="runway">Runway</option>
              </select>
            </AIGenField>
            <AIGenField label="Model">
              <select
                value={config.engine.modelId}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    engine: {
                      ...config.engine,
                      modelId: event.target.value,
                    },
                  })
                }
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </AIGenField>
          </div>

          <div className="aiGenCapsRow">
            <AIGenTag>{engineCapabilities.supportsFps ? "FPS" : "No FPS"}</AIGenTag>
            <AIGenTag>{engineCapabilities.supportsUpscale ? "Upscale" : "No Upscale"}</AIGenTag>
            <AIGenTag>{engineCapabilities.supportsBestOf ? "Best-of" : "No Best-of"}</AIGenTag>
            <AIGenTag>{engineCapabilities.supportsSpeedRampCustom ? "Custom Ramp" : "Preset Ramp"}</AIGenTag>
          </div>
        </AIGenSection>

        <AIGenSection id="output" title="Output" subtitle="Format, resolution and batch setup" open={openSections.output} onToggle={toggleSection}>
          <div className="aiGenGrid twoCols">
            <AIGenField label="Shot mode">
              <select
                value={config.output.shotMode}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      shotMode: event.target.value === "multi" ? "multi" : "single",
                    },
                  })
                }
              >
                <option value="single">Single shot</option>
                <option value="multi" disabled>
                  Multi-shot (coming later)
                </option>
              </select>
            </AIGenField>
            <AIGenField label="Aspect ratio">
              <select
                value={config.output.aspectRatio}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      aspectRatio: event.target.value as AIGenConfig["output"]["aspectRatio"],
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
          </div>

          <div className="aiGenGrid twoCols">
            <AIGenField label="Resolution">
              <select
                value={config.output.resolution}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      resolution: event.target.value as AIGenConfig["output"]["resolution"],
                    },
                  })
                }
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
                <option value="4k">4k</option>
              </select>
            </AIGenField>
            <AIGenField label="Duration (s)">
              <input
                type="number"
                min={1}
                max={30}
                value={config.output.durationSec}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      durationSec: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>
          </div>

          <div className="aiGenGrid twoCols">
            <AIGenField label="Batch count">
              <input
                type="number"
                min={1}
                max={32}
                value={config.output.batchCount}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      batchCount: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>
            <AIGenField
              label="FPS"
              disabled={!engineCapabilities.supportsFps}
              title={!engineCapabilities.supportsFps ? `${config.engine.engineId}: FPS unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsFps}
                value={config.output.fps}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      fps: Number(event.target.value) as AIGenConfig["output"]["fps"],
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
          </div>

          <div className="aiGenGrid twoCols">
            <AIGenField
              label="Upscale"
              disabled={!engineCapabilities.supportsUpscale}
              title={!engineCapabilities.supportsUpscale ? `${config.engine.engineId}: upscale unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsUpscale}
                value={config.output.upscale ? "on" : "off"}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      upscale: event.target.value === "on",
                    },
                  })
                }
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </AIGenField>
            <AIGenField
              label="Best-of"
              disabled={!engineCapabilities.supportsBestOf}
              title={!engineCapabilities.supportsBestOf ? `${config.engine.engineId}: best-of unsupported` : undefined}
            >
              <input
                type="number"
                min={1}
                max={10}
                disabled={!engineCapabilities.supportsBestOf}
                value={config.output.bestOf}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    output: {
                      ...config.output,
                      bestOf: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>
          </div>

          <AIGenField
            label="Export preset"
            disabled={!engineCapabilities.supportsExportPreset}
            title={!engineCapabilities.supportsExportPreset ? `${config.engine.engineId}: export preset unsupported` : undefined}
          >
            <select
              disabled={!engineCapabilities.supportsExportPreset}
              value={config.output.exportPreset}
              onChange={(event) =>
                patchConfig({
                  ...config,
                  output: {
                    ...config.output,
                    exportPreset: event.target.value as AIGenConfig["output"]["exportPreset"],
                  },
                })
              }
            >
              <option value="none">None</option>
              <option value="tiktok">TikTok</option>
              <option value="shorts">Shorts</option>
              <option value="youtube">YouTube</option>
              <option value="ads">Ads</option>
            </select>
          </AIGenField>

          <div className="aiGenGrid twoCols">
            <AIGenField label="Preset library">
              <select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
                <option value="">Select preset...</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </AIGenField>
            <AIGenField label="New preset name">
              <input value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} placeholder="My preset" />
            </AIGenField>
          </div>

          <div className="buttons">
            <button
              type="button"
              className="iconBtn"
              onClick={() => {
                if (!selectedPresetId) return;
                onApplyPreset(selectedPresetId);
              }}
              disabled={!selectedPresetId}
            >
              Apply preset
            </button>
            <button
              type="button"
              className="iconBtn"
              onClick={() => {
                onSavePreset(newPresetName);
                setNewPresetName("");
              }}
            >
              Save preset
            </button>
            <button
              type="button"
              className="iconBtn dangerBtn"
              onClick={() => {
                if (!selectedPresetId) return;
                onDeletePreset(selectedPresetId);
                setSelectedPresetId("");
              }}
              disabled={!selectedPresetId}
            >
              Delete preset
            </button>
          </div>
        </AIGenSection>

        <AIGenSection id="motion" title="Motion" subtitle="Movement, speed ramp and smoothing" open={openSections.motion} onToggle={toggleSection}>
          <div className="aiGenGrid twoCols">
            <AIGenField label="Movement">
              <select
                value={config.motion.movementMode}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    motion: {
                      ...config.motion,
                      movementMode: event.target.value as AIGenConfig["motion"]["movementMode"],
                    },
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="pan" disabled={!engineCapabilities.supportedMovementModes.includes("pan")}>Pan</option>
                <option value="tilt" disabled={!engineCapabilities.supportedMovementModes.includes("tilt")}>Tilt</option>
                <option value="dolly" disabled={!engineCapabilities.supportedMovementModes.includes("dolly")}>Dolly</option>
                <option value="truck" disabled={!engineCapabilities.supportedMovementModes.includes("truck")}>Truck</option>
                <option value="orbit" disabled={!engineCapabilities.supportedMovementModes.includes("orbit")}>Orbit</option>
                <option value="handheld" disabled={!engineCapabilities.supportedMovementModes.includes("handheld")}>Handheld</option>
                <option value="static" disabled={!engineCapabilities.supportedMovementModes.includes("static")}>Static</option>
              </select>
            </AIGenField>
            <AIGenField label="Intensity">
              <input
                type="range"
                min={0}
                max={100}
                value={config.motion.intensity}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    motion: {
                      ...config.motion,
                      intensity: Number(event.target.value),
                    },
                  })
                }
              />
              <input
                type="number"
                min={0}
                max={100}
                value={config.motion.intensity}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    motion: {
                      ...config.motion,
                      intensity: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>
          </div>

          <AIGenField label="Speed ramp">
            <select
              value={config.motion.speedRampPreset}
              onChange={(event) =>
                patchConfig({
                  ...config,
                  motion: {
                    ...config.motion,
                    speedRampPreset: event.target.value as AIGenConfig["motion"]["speedRampPreset"],
                  },
                })
              }
            >
              <option value="none">None</option>
              <option value="linear">Linear</option>
              <option value="ease-in">Ease in</option>
              <option value="ease-out">Ease out</option>
              <option value="ease-in-out">Ease in-out</option>
              <option value="custom" disabled={!engineCapabilities.supportsSpeedRampCustom}>
                Custom
              </option>
            </select>
          </AIGenField>

          {config.motion.speedRampPreset === "custom" ? (
            <div className="aiCurveEditor" aria-label="Custom speed curve editor">
              {config.motion.customCurve.map((point, index) => (
                <label key={`curve-${index}`}>
                  P{index + 1}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(point.y * 100)}
                    disabled={!engineCapabilities.supportsSpeedRampCustom}
                    onChange={(event) => patchConfig(nextCurvePointY(config, index, Number(event.target.value)))}
                  />
                  <small>{Math.round(point.y * 100)}%</small>
                </label>
              ))}
            </div>
          ) : null}

          <div className="aiGenGrid twoCols">
            <AIGenField
              label="Stabilization"
              disabled={!engineCapabilities.supportsStabilization}
              title={!engineCapabilities.supportsStabilization ? `${config.engine.engineId}: stabilization unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsStabilization}
                value={config.motion.stabilization ? "on" : "off"}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    motion: {
                      ...config.motion,
                      stabilization: event.target.value === "on",
                    },
                  })
                }
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </AIGenField>
            <AIGenField
              label="Loopable motion"
              disabled={!engineCapabilities.supportsLoopable}
              title={!engineCapabilities.supportsLoopable ? `${config.engine.engineId}: loopable unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsLoopable}
                value={config.motion.loopable ? "on" : "off"}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    motion: {
                      ...config.motion,
                      loopable: event.target.value === "on",
                    },
                  })
                }
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </AIGenField>
          </div>
        </AIGenSection>

        <AIGenSection id="frames" title="Frames" subtitle="Start/end frame constraints" open={openSections.frames} onToggle={toggleSection}>
          <AIGenField label="Frame mode">
            <select
              value={config.frames.mode}
              onChange={(event) =>
                patchConfig({
                  ...config,
                  frames: {
                    ...config.frames,
                    mode: event.target.value as AIGenConfig["frames"]["mode"],
                  },
                })
              }
            >
              <option value="none">None</option>
              <option value="start-only">Start only</option>
              <option value="end-only">End only</option>
              <option value="start-end">Start + End</option>
            </select>
          </AIGenField>

          <div className="buttons">
            <button type="button" className="iconBtn" onClick={() => setFrame("start", "source-monitor")}>Set Start (Source)</button>
            <button type="button" className="iconBtn" onClick={() => setFrame("end", "source-monitor")}>Set End (Source)</button>
            <button type="button" className="iconBtn" onClick={() => setFrame("start", "timeline-program")}>Set Start (Timeline)</button>
            <button type="button" className="iconBtn" onClick={() => setFrame("end", "timeline-program")}>Set End (Timeline)</button>
          </div>

          <div className="aiFrameSummary">
            <div>
              <strong>Start:</strong>{" "}
              {config.frames.startFrame
                ? `${config.frames.startFrame.assetLabel} @ ${formatTimeLabel(config.frames.startFrame.timeMs)}`
                : "Not set"}
            </div>
            <div>
              <strong>End:</strong>{" "}
              {config.frames.endFrame
                ? `${config.frames.endFrame.assetLabel} @ ${formatTimeLabel(config.frames.endFrame.timeMs)}`
                : "Not set"}
            </div>
          </div>

          <div className="aiGenGrid twoCols">
            <AIGenField
              label="Frame locking"
              disabled={!engineCapabilities.supportsFrameLocking}
              title={!engineCapabilities.supportsFrameLocking ? `${config.engine.engineId}: frame locking unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsFrameLocking}
                value={config.frames.frameLocking}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    frames: {
                      ...config.frames,
                      frameLocking: event.target.value as AIGenConfig["frames"]["frameLocking"],
                    },
                  })
                }
              >
                <option value="none">None</option>
                <option value="soft">Soft</option>
                <option value="hard">Hard</option>
              </select>
            </AIGenField>
            <AIGenField
              label="Interpolation style"
              disabled={!engineCapabilities.supportsInterpolationStyle}
              title={!engineCapabilities.supportsInterpolationStyle ? `${config.engine.engineId}: interpolation style unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsInterpolationStyle}
                value={config.frames.interpolationStyle}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    frames: {
                      ...config.frames,
                      interpolationStyle: event.target.value as AIGenConfig["frames"]["interpolationStyle"],
                    },
                  })
                }
              >
                <option value="default">Default</option>
                <option value="morph">Morph</option>
                <option value="blend">Blend</option>
                <option value="direct">Direct</option>
              </select>
            </AIGenField>
          </div>
        </AIGenSection>

        <AIGenSection id="references" title="References" subtitle="Multi-reference guidance" open={openSections.references} onToggle={toggleSection}>
          <div className="aiGenGrid twoCols">
            <AIGenField label="Role for next reference">
              <select value={newRefRole} onChange={(event) => setNewRefRole(event.target.value as AIGenReferenceRole)}>
                <option value="style">Style</option>
                <option value="character">Character</option>
                <option value="environment">Environment</option>
                <option value="other">Other</option>
              </select>
            </AIGenField>
            <AIGenField label="Capacity">
              <input type="text" readOnly value={`${referencesCount}/${engineCapabilities.maxReferences}`} />
            </AIGenField>
          </div>

          <div className="buttons">
            <button type="button" className="iconBtn" onClick={() => refUploadInputRef.current?.click()} disabled={referencesRemaining <= 0}>
              Upload ref
            </button>
            <button
              type="button"
              className="iconBtn"
              onClick={() => addFrameReference("source-monitor")}
              disabled={referencesRemaining <= 0 || !sourceContext.sourceAssetId}
            >
              Use source frame
            </button>
            <button
              type="button"
              className="iconBtn"
              onClick={() => addFrameReference("timeline-program")}
              disabled={referencesRemaining <= 0 || !sourceContext.timelineAssetId}
            >
              Use timeline frame
            </button>
          </div>

          <input
            ref={refUploadInputRef}
            className="mediaUploadInput"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              const currentItems = [...config.references.items];
              for (const file of files) {
                if (currentItems.length >= engineCapabilities.maxReferences) break;
                const kind = file.type.startsWith("video/") ? "video" : "image";
                if (!engineCapabilities.supportedReferenceKinds.includes(kind)) continue;
                const url = URL.createObjectURL(file);
                currentItems.push({
                  id: crypto.randomUUID(),
                  role: newRefRole,
                  kind,
                  source: "upload",
                  weight: 70,
                  locked: false,
                  url,
                  label: file.name,
                });
              }
              patchConfig({
                ...config,
                references: {
                  items: currentItems.slice(0, engineCapabilities.maxReferences),
                },
              });
              event.currentTarget.value = "";
            }}
          />

          <div className="aiReferenceList">
            {config.references.items.length === 0 ? <p className="hint">No references added yet.</p> : null}
            {config.references.items.map((ref) => (
              <article key={ref.id} className="aiReferenceItem">
                <div className="aiReferenceItemMeta">
                  <strong>{ref.label}</strong>
                  <small>
                    {ref.kind} · {ref.source}
                  </small>
                </div>
                <div className="aiReferenceItemControls">
                  <select
                    value={ref.role}
                    onChange={(event) =>
                      patchConfig({
                        ...config,
                        references: {
                          items: config.references.items.map((item) =>
                            item.id === ref.id ? { ...item, role: event.target.value as AIGenReferenceRole } : item,
                          ),
                        },
                      })
                    }
                  >
                    <option value="style">Style</option>
                    <option value="character">Character</option>
                    <option value="environment">Environment</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={ref.weight}
                    onChange={(event) =>
                      patchConfig({
                        ...config,
                        references: {
                          items: config.references.items.map((item) =>
                            item.id === ref.id ? { ...item, weight: Number(event.target.value) } : item,
                          ),
                        },
                      })
                    }
                  />
                  <button
                    type="button"
                    className={`iconBtn tiny ${ref.locked ? "activeTool" : ""}`}
                    onClick={() =>
                      patchConfig({
                        ...config,
                        references: {
                          items: config.references.items.map((item) =>
                            item.id === ref.id ? { ...item, locked: !item.locked } : item,
                          ),
                        },
                      })
                    }
                  >
                    {ref.locked ? "🔒" : "🔓"}
                  </button>
                  <button
                    type="button"
                    className="iconBtn tiny dangerBtn"
                    onClick={() =>
                      patchConfig({
                        ...config,
                        references: {
                          items: config.references.items.filter((item) => item.id !== ref.id),
                        },
                      })
                    }
                  >
                    ✕
                  </button>
                </div>
              </article>
            ))}
          </div>
        </AIGenSection>

        <AIGenSection id="advanced" title="Advanced" subtitle="Director macros, camera and legacy tools" open={openSections.advanced} onToggle={toggleSection}>
          <fieldset
            className="aiGenFieldset"
            disabled={!engineCapabilities.supportsDirectorPanel}
            title={!engineCapabilities.supportsDirectorPanel ? `${config.engine.engineId}: director controls unsupported` : undefined}
          >
            <legend>Director Panel</legend>
            <div className="aiGenGrid twoCols">
              <AIGenField label="Genre">
                <select
                  value={config.director.genre}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        genre: event.target.value as AIGenConfig["director"]["genre"],
                      },
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="action">Action</option>
                  <option value="drama">Drama</option>
                  <option value="comedy">Comedy</option>
                  <option value="sci-fi">Sci-fi</option>
                  <option value="horror">Horror</option>
                </select>
              </AIGenField>
              <AIGenField label="Mood">
                <select
                  value={config.director.mood}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        mood: event.target.value as AIGenConfig["director"]["mood"],
                      },
                    })
                  }
                >
                  <option value="neutral">Neutral</option>
                  <option value="warm">Warm</option>
                  <option value="dark">Dark</option>
                  <option value="dreamy">Dreamy</option>
                  <option value="tense">Tense</option>
                </select>
              </AIGenField>
            </div>

            <div className="aiGenGrid twoCols">
              <AIGenField label="Lock identity">
                <select
                  value={config.director.lockIdentity ? "on" : "off"}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        lockIdentity: event.target.value === "on",
                      },
                    })
                  }
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </AIGenField>
              <AIGenField label="Camera intent">
                <select
                  value={config.director.cameraIntent}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        cameraIntent: event.target.value as AIGenConfig["director"]["cameraIntent"],
                      },
                    })
                  }
                >
                  <option value="cinematic">Cinematic</option>
                  <option value="handheld">Handheld</option>
                  <option value="locked">Locked</option>
                  <option value="documentary">Documentary</option>
                </select>
              </AIGenField>
            </div>

            <div className="aiGenGrid threeCols">
              <AIGenField label="Scene flow">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.director.sceneFlow}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        sceneFlow: Number(event.target.value),
                      },
                    })
                  }
                />
              </AIGenField>
              <AIGenField label="Action level">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.director.actionLevel}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        actionLevel: Number(event.target.value),
                      },
                    })
                  }
                />
              </AIGenField>
              <AIGenField label="Chaos level">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.director.chaosLevel}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        chaosLevel: Number(event.target.value),
                      },
                    })
                  }
                />
              </AIGenField>
              <AIGenField label="Emotion level">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.director.emotionLevel}
                  onChange={(event) =>
                    patchConfig({
                      ...config,
                      director: {
                        ...config.director,
                        emotionLevel: Number(event.target.value),
                      },
                    })
                  }
                />
              </AIGenField>
            </div>

            <AIGenField label="Shot continuity">
              <select
                value={config.director.continuity ? "on" : "off"}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    director: {
                      ...config.director,
                      continuity: event.target.value === "on",
                    },
                  })
                }
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </AIGenField>
          </fieldset>

          <div className="aiGenGrid twoCols">
            <AIGenField
              label="Lens preset"
              disabled={!engineCapabilities.supportsLensControls}
              title={!engineCapabilities.supportsLensControls ? `${config.engine.engineId}: lens metadata unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsLensControls}
                value={config.advanced.lensPreset}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    advanced: {
                      ...config.advanced,
                      lensPreset: event.target.value as AIGenConfig["advanced"]["lensPreset"],
                    },
                  })
                }
              >
                <option value="none">None</option>
                <option value="premium-modern-prime">Premium Modern Prime</option>
                <option value="classic-anamorphic">Classic Anamorphic</option>
                <option value="vintage-spherical">Vintage Spherical</option>
              </select>
            </AIGenField>

            <AIGenField
              label="Camera preset"
              disabled={!engineCapabilities.supportsCameraPreset}
              title={!engineCapabilities.supportsCameraPreset ? `${config.engine.engineId}: camera preset unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsCameraPreset}
                value={config.advanced.cameraPreset}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    advanced: {
                      ...config.advanced,
                      cameraPreset: event.target.value as AIGenConfig["advanced"]["cameraPreset"],
                    },
                  })
                }
              >
                <option value="neutral">Neutral</option>
                <option value="cinematic">Cinematic</option>
                <option value="action">Action</option>
                <option value="documentary">Documentary</option>
              </select>
            </AIGenField>
          </div>

          <div className="aiGenGrid twoCols">
            <AIGenField
              label="Focal length (mm)"
              disabled={!engineCapabilities.supportsLensControls}
              title={!engineCapabilities.supportsLensControls ? `${config.engine.engineId}: lens metadata unsupported` : undefined}
            >
              <input
                type="number"
                min={10}
                max={200}
                disabled={!engineCapabilities.supportsLensControls}
                value={config.advanced.focalLengthMm}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    advanced: {
                      ...config.advanced,
                      focalLengthMm: Number(event.target.value),
                    },
                  })
                }
              />
            </AIGenField>
            <AIGenField
              label="Aperture"
              disabled={!engineCapabilities.supportsLensControls}
              title={!engineCapabilities.supportsLensControls ? `${config.engine.engineId}: lens metadata unsupported` : undefined}
            >
              <select
                disabled={!engineCapabilities.supportsLensControls}
                value={config.advanced.aperture}
                onChange={(event) =>
                  patchConfig({
                    ...config,
                    advanced: {
                      ...config.advanced,
                      aperture: event.target.value as AIGenConfig["advanced"]["aperture"],
                    },
                  })
                }
              >
                <option value="f/1.4">f/1.4</option>
                <option value="f/2">f/2</option>
                <option value="f/2.8">f/2.8</option>
                <option value="f/4">f/4</option>
                <option value="f/8">f/8</option>
                <option value="f/11">f/11</option>
              </select>
            </AIGenField>
          </div>

          <div className="aiLegacyTools">
            <h3>Legacy Tools</h3>
            <p className="hint">Silence-cut plugin remains available here while engine mapping is pending.</p>
            <div className="aiStatusRow">
              <span className={`aiStatusTag status-${legacySilenceCut.status}`}>{legacySilenceCut.status}</span>
              <span className="hint">{legacySilenceCut.suggestionCount} suggestion(s)</span>
            </div>
            <div className="buttons">
              <button type="button" className="iconBtn" onClick={onRunLegacySilenceCut} disabled={legacySilenceCut.status === "running"}>
                Run Silence Cut
              </button>
              <button
                type="button"
                className="iconBtn"
                onClick={onApplyLegacySilenceCut}
                disabled={!legacySilenceCut.canApply || legacySilenceCut.status === "running"}
              >
                Apply Silence Cut
              </button>
            </div>
            {legacySilenceCut.summary ? <p className="hint">{legacySilenceCut.summary}</p> : null}
          </div>
        </AIGenSection>
      </div>

      <footer className="aiGenStickyFooter">
        <div className="aiGenFooterMeta">
          <span>{history.length} generation request(s)</span>
          <span>{promptVersions.length} prompt version(s)</span>
        </div>
        <button type="button" className="aiGenerateBtn" disabled={!canGenerate} onClick={onGenerate}>
          GENERATE ({config.output.batchCount})
        </button>
        {!modeSupported ? <p className="hint">Selected engine does not support the current mode.</p> : null}
        {!canGenerate && config.prompt.text.trim().length === 0 ? (
          <p className="hint">Add a scene prompt before generating.</p>
        ) : null}
      </footer>
    </div>
  );
}
