# PoC Editor Web

Current status (product sprint kickoff):

- Real editor shell layout (Media Bin / Preview / Right Sidebar / Timeline).
- Right sidebar panels:
  - `AI Generation` (UI-first, engine-agnostic, capability-gated)
  - `Inspector`
- AI Generation currently includes:
  - prompt input + `@mentions` autocomplete (library + project assets)
  - engine/model selector with capability gating
  - output/motion/frames/references/advanced sections
  - local preset save/apply/delete (`mav.ai-generation.presets.v1`)
  - generate action that stores queued payload snapshots (no live engine call yet)
- Legacy silence-cut plugin controls moved to `AI Generation > Advanced > Legacy Tools`.
- MP4 demux path via `mp4box` in a dedicated worker.
- Worker decode pipeline with deterministic seek QA + outlier reporting.
- Fallback preview path:
  - hidden `HTMLVideoElement`
  - `requestVideoFrameCallback()` when available
- Timeline interactions:
  - lane-based drag/resize
  - pointer capture + `requestAnimationFrame` live updates
  - state commit on pointerup
  - snap guides + collision modes
- Media workflow MVP:
  - upload video in Media Bin
  - open asset in preview
  - add asset to timeline
  - edit clip properties in Inspector
- Project normalization emits `mav.project.v2` with `aiGeneration` state.
- Diagnostics are hidden by default and available with `?dev=1`.

## Diagnostics and QA

- Default UX: clean editor shell, no QA controls shown.
- Dev mode: open `/?dev=1` to display the diagnostics panel.
- QA automation API is always exposed through `window.__MAV_DECODE_QA__`.

Useful commands:

- `pnpm qa:media:fetch`
- `pnpm qa:decode --start-server`
- `pnpm qa:decode:gate --start-server`
