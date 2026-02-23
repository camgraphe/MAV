import { useEffect, useState } from "react";

type CollisionMode = "no-overlap" | "push" | "allow-overlap";
type RippleMode = "none" | "ripple-delete";

type ProjectSettingsValue = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  snapEnabled: boolean;
  snapMs: number;
  collisionMode: CollisionMode;
  rippleMode: RippleMode;
  magnetEnabled: boolean;
  zoomPps: number;
};

type ProjectSettingsModalProps = {
  open: boolean;
  value: ProjectSettingsValue;
  onClose: () => void;
  onApply: (next: ProjectSettingsValue) => void;
};

type Draft = {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  snapEnabled: boolean;
  snapMs: number;
  collisionMode: CollisionMode;
  rippleMode: RippleMode;
  magnetEnabled: boolean;
  zoomPps: number;
};

function toDraft(value: ProjectSettingsValue): Draft {
  return {
    width: value.width,
    height: value.height,
    fps: value.fps,
    durationSeconds: Math.max(1, Math.round(value.durationMs / 1000)),
    snapEnabled: value.snapEnabled,
    snapMs: value.snapMs,
    collisionMode: value.collisionMode,
    rippleMode: value.rippleMode,
    magnetEnabled: value.magnetEnabled,
    zoomPps: value.zoomPps,
  };
}

export function ProjectSettingsModal({ open, value, onClose, onApply }: ProjectSettingsModalProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(value));
  }, [open, value]);

  if (!open) return null;

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <section
        className="modalCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="panelHeader">
          <h2 id="project-settings-title">Project Settings</h2>
          <p className="hint">Format and timeline behavior</p>
        </header>

        <div className="projectSettingsGrid">
          <label>
            Width
            <input
              type="number"
              min={16}
              max={8192}
              value={draft.width}
              onChange={(event) => setDraft((prev) => ({ ...prev, width: Number(event.target.value) || prev.width }))}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              min={16}
              max={8192}
              value={draft.height}
              onChange={(event) => setDraft((prev) => ({ ...prev, height: Number(event.target.value) || prev.height }))}
            />
          </label>
          <label>
            FPS
            <select
              value={draft.fps}
              onChange={(event) => setDraft((prev) => ({ ...prev, fps: Number(event.target.value) || prev.fps }))}
            >
              <option value={24}>24</option>
              <option value={25}>25</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
          <label>
            Timeline Duration (s)
            <input
              type="number"
              min={1}
              max={21600}
              value={draft.durationSeconds}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, durationSeconds: Number(event.target.value) || prev.durationSeconds }))
              }
            />
          </label>
        </div>

        <div className="projectSettingsGrid">
          <label>
            Snap
            <select
              value={draft.snapEnabled ? "on" : "off"}
              onChange={(event) => setDraft((prev) => ({ ...prev, snapEnabled: event.target.value === "on" }))}
            >
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
          </label>
          <label>
            Snap Strength (ms)
            <input
              type="number"
              min={1}
              max={1000}
              value={draft.snapMs}
              onChange={(event) => setDraft((prev) => ({ ...prev, snapMs: Number(event.target.value) || prev.snapMs }))}
            />
          </label>
          <label>
            Placement Rule
            <select
              value={draft.collisionMode}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  collisionMode: event.target.value as CollisionMode,
                }))
              }
            >
              <option value="no-overlap">No overlap</option>
              <option value="push">Push clips</option>
              <option value="allow-overlap" disabled={draft.magnetEnabled}>
                Allow overlap
              </option>
            </select>
          </label>
          <label>
            Ripple Delete
            <select
              value={draft.rippleMode}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  rippleMode: event.target.value as RippleMode,
                }))
              }
            >
              <option value="none">Off</option>
              <option value="ripple-delete">On</option>
            </select>
          </label>
          <label>
            Main Track Magnet
            <select
              value={draft.magnetEnabled ? "on" : "off"}
              onChange={(event) => {
                const magnetEnabled = event.target.value === "on";
                setDraft((prev) => ({
                  ...prev,
                  magnetEnabled,
                  collisionMode:
                    magnetEnabled && prev.collisionMode === "allow-overlap" ? "no-overlap" : prev.collisionMode,
                }));
              }}
            >
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
          </label>
          <label>
            Timeline Zoom (px/s)
            <input
              type="number"
              min={20}
              max={260}
              value={draft.zoomPps}
              onChange={(event) => setDraft((prev) => ({ ...prev, zoomPps: Number(event.target.value) || prev.zoomPps }))}
            />
          </label>
        </div>

        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primaryBtn"
            onClick={() => {
              onApply({
                width: Math.max(16, Math.round(draft.width)),
                height: Math.max(16, Math.round(draft.height)),
                fps: Math.max(1, Math.round(draft.fps)),
                durationMs: Math.max(1000, Math.round(draft.durationSeconds * 1000)),
                snapEnabled: draft.snapEnabled,
                snapMs: Math.max(1, Math.round(draft.snapMs)),
                collisionMode:
                  draft.magnetEnabled && draft.collisionMode === "allow-overlap" ? "no-overlap" : draft.collisionMode,
                rippleMode: draft.rippleMode,
                magnetEnabled: draft.magnetEnabled,
                zoomPps: Math.max(20, Math.min(260, Math.round(draft.zoomPps))),
              });
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}
