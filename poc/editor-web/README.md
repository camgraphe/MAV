# editor-web scaffold

Current status (Week-1 continuation):
- MP4 demux path via `mp4box` in a dedicated worker.
- Worker decoding pipeline:
  - `VideoDecoder.isConfigSupported()` probe
  - decoder configure/reset per seek
  - keyframe-index based seek (nearest keyframe <= target)
  - `VideoFrame` transferred to UI and closed after render
- Fallback preview path:
  - hidden `HTMLVideoElement`
  - `requestVideoFrameCallback()` when available
- Timeline interactions:
  - lane-based pointer drag/resize
  - pointer capture + rAF live updates
  - commit to state on pointerup
  - snap guides (playhead + clip edges)
- Shared microsecond timeline values used for decode requests (`playheadUs`).
- Deterministic save/load and JSON export.
- Decode QA harness with timestamped JSON export and automation hooks.
- fMP4 detection policy: force fallback preview (`HTMLVideoElement` + RVFC) with telemetry markers.

Key files:
- `src/preview/video-decode.worker.ts`
- `src/preview/protocol.ts`
- `src/App.tsx`
- `contracts/project.schema.v0.json`
- `contracts/ai-plugin-contract.ts`

## Decode QA workflow

1. Fetch curated media set:
   - `pnpm qa:media:fetch`
2. Start dev server:
   - `pnpm --filter @mav/poc-editor-web dev`
3. In the app:
   - load an MP4 in `Decoded Preview`
   - run `Decode QA Harness`
   - export `Export Last Result JSON`

Automation mode:

- `pnpm qa:decode --start-server`
- Strict thresholds:
  - `pnpm qa:decode:gate --start-server`
