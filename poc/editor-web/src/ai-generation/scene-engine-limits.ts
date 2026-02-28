// Centralized scene duration constraints. Make this engine-dependent in a follow-up
// once per-block engine selection is introduced.
export const SCENE_BLOCK_DURATION_MIN_SEC = 3;
export const SCENE_BLOCK_DURATION_MAX_SEC = 15;

export const SCENE_BLOCK_DURATION_OPTIONS_SEC = Array.from(
  { length: SCENE_BLOCK_DURATION_MAX_SEC - SCENE_BLOCK_DURATION_MIN_SEC + 1 },
  (_, index) => SCENE_BLOCK_DURATION_MIN_SEC + index,
);

export function clampSceneBlockDurationSec(durationSec: number): number {
  const rounded = Math.round(durationSec);
  return Math.min(SCENE_BLOCK_DURATION_MAX_SEC, Math.max(SCENE_BLOCK_DURATION_MIN_SEC, rounded));
}

export function sceneBlockDurationSecFromMsCeil(durationMs: number): number {
  const seconds = Math.ceil(Math.max(1, durationMs) / 1000);
  return clampSceneBlockDurationSec(seconds);
}
