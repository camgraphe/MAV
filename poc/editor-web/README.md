# editor-web

See the root `README.md` for repository-wide setup and common scripts.

Current status (Product Sprint kickoff):
- Real editor shell layout (Media Bin / Preview / Inspector / Timeline).
- MP4 demux path via `mp4box` in a dedicated worker.
- Worker decoding pipeline with deterministic seek QA and outlier reporting.
- Fallback preview path:
  - hidden `HTMLVideoElement`
  - `requestVideoFrameCallback()` when available
- Timeline interactions:
  - lane-based pointer drag/resize
  - pointer capture + rAF live updates
  - commit to state on pointerup
  - snap guides + collision modes
- Media workflow MVP:
  - upload video in Media Bin
  - open asset in preview
  - add asset to timeline
  - edit selected clip properties in Inspector
- Diagnostics hidden by default, available with `?dev=1`.

## Diagnostics / QA

- Default UX: clean editor shell, no QA controls.
- Dev mode: open `/?dev=1` to show diagnostics panel.
- QA automation API is always exposed through `window.__MAV_DECODE_QA__`.

Useful commands:
- `pnpm qa:media:fetch`
- `pnpm qa:decode --start-server`
- `pnpm qa:decode:gate --start-server`
