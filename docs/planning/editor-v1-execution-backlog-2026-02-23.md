# Editor v1 Execution Backlog (2026-02-23)

## Goal
Move MAV from "working PoC" to "usable desktop editor":
- Import media -> edit on timeline -> reliable MP4 export.
- Keep deterministic decode QA and CI gates.
- Keep license-safe architecture (permissive in editor, FFmpeg isolated).

## Current Baseline
- Editor shell is in place (Media / Preview / Inspector / Timeline).
- Decode worker + QA harness + decode-qa CI are in place.
- Timeline interactions exist (drag, split, delete, snapping, playhead drag).
- Export modal exists, but render-worker is still simulated (no real FFmpeg render).

## Non-Negotiables During This Backlog
- Do not regress `decode-qa` gate.
- Keep diagnostics hidden behind `?dev=1` and `localStorage.mavDev=1`.
- No GPL/AGPL deps in editor/core.
- Keep FFmpeg confined to render-worker service only.

## PR Plan

### PR1 - Program Monitor Becomes Timeline-Aware (P0)
Problem:
- Program preview currently draws from a single `videoUrl`, not from timeline clip composition.

Scope:
- Build playhead -> active clip resolver on video track.
- Map timeline time to source media time with `inMs/outMs/startMs`.
- Drive Program monitor from selected active clip source at current playhead.
- Keep Source monitor behavior unchanged.
- Keep WebCodecs seek path for paused scrubbing and fallback HTMLVideo path.

Files:
- `poc/editor-web/src/App.tsx`
- `poc/editor-web/src/components/Preview/PreviewPanel.tsx`
- `poc/editor-web/src/components/Timeline/TimelinePanel.tsx` (if selection plumbing updates needed)

Acceptance:
- Two clips from different assets on main video track preview correctly at expected times.
- Split/move/trim immediately affect Program preview mapping.
- Playback no longer "sticks" to last loaded asset only.
- `pnpm --filter @mav/poc-editor-web typecheck` passes.
- `pnpm --filter @mav/poc-editor-web build` passes.
- `pnpm qa:decode:gate -- --profiles baseline-short-gop --start-server --port 4174` passes.

### PR2 - Real Render Worker (FFmpeg) Replaces Simulation (P0)
Problem:
- `poc/render-worker/src/index.ts` currently simulates progress/output.

Scope:
- Replace fake interval job with real queued render execution:
  - consume project JSON + asset URLs
  - generate MP4 output file
  - expose progress/status/error
- Keep existing API contract shape (`/api/render/jobs`, `status`, `cancel`, `retry`).
- Add job artifact storage path for local/dev mode (filesystem is acceptable for now).
- Keep cancel/retry behavior deterministic.

Files:
- `poc/render-worker/src/index.ts`
- `poc/render-worker/README.md`
- `docs/ffmpeg/lgpl-render-worker-recipe.md`
- `poc/render-worker/compliance-checklist.md`

Acceptance:
- Export modal reaches `completed` with real downloadable MP4 for a sample project.
- Cancel stops active job.
- Retry restarts failed/canceled jobs.
- `pnpm --filter @mav/poc-render-worker typecheck` passes.
- Compliance checklist updated with actual build/runtime verification steps.

### PR3 - Real Thumbnails + Real Waveforms (P1)
Problem:
- `media-analysis.worker.ts` generates synthetic SVG thumbnails and byte-derived pseudo-waveforms.

Scope:
- Replace synthetic thumbnail generation with sampled video frames from actual media.
- Replace pseudo-waveform with decoded audio-envelope summary.
- Keep worker off-main-thread.
- Keep caching behavior (in-memory + localStorage metadata).
- Add fallback behavior when audio track is absent.

Files:
- `poc/editor-web/src/preview/media-analysis.worker.ts`
- `poc/editor-web/src/App.tsx`
- `poc/editor-web/src/components/MediaBin/MediaBinPanel.tsx`
- `poc/editor-web/src/components/Timeline/TimelinePanel.tsx`

Acceptance:
- Media bin thumbnails correspond to actual clip content.
- Audio clips show stable waveform envelopes.
- Timeline filmstrip tiles use real frames.
- No major UI thread jank during analysis.

### PR4 - Track Semantics Become Functional (P1)
Problem:
- Track controls are partly visual; mute/visibility do not fully affect output behavior.

Scope:
- Implement track state model in project/editor state:
  - mute/solo/lock/visibility
- Enforce behavior:
  - `lock`: block edit operations for clips on locked track
  - `visibility`: hide clips from Program output composition
  - `mute`: remove track contribution from audio mix path (or mark for export service contract)
- Preserve current UX controls and labels.

Files:
- `poc/editor-web/src/App.tsx`
- `poc/editor-web/src/components/Timeline/TimelinePanel.tsx`
- `poc/editor-web/src/components/Inspector/InspectorPanel.tsx` (if exposing track state)

Acceptance:
- Track lock blocks drag/resize/split/delete on that track.
- Hidden tracks are not rendered in Program preview.
- Mute state persists in save/load and is transmitted in export payload.

### PR5 - First Real AI Plugin (P1)
Problem:
- AI tab is currently placeholder-only.

Scope:
- Implement one production-shaped plugin flow:
  - option A: auto captions (VTT + burn-in toggle)
  - option B: silence-cut suggestions that can be applied to timeline
- Define stable plugin contract:
  - input: project JSON + asset refs + params
  - output: deterministic timeline artifacts
- Add explicit job status feedback in UI.

Files:
- `poc/editor-web/src/App.tsx`
- `poc/editor-web/src/components/MediaBin/LibraryPanel.tsx`
- new plugin contract module under `poc/editor-web/src` (or shared package)

Acceptance:
- User can run plugin from AI tab and apply result to timeline.
- Re-running with same inputs produces deterministic output.
- Plugin action appears in undo/redo history.

## Cross-PR Validation Checklist
- `pnpm -r --if-present typecheck`
- `pnpm --filter @mav/poc-editor-web build`
- `pnpm qa:decode:gate -- --profiles baseline-short-gop --start-server --port 4174`
- `pnpm license:check`

## Recommended Order
1. PR1
2. PR2
3. PR3
4. PR4
5. PR5

Rationale:
- PR1 and PR2 remove the two biggest product gaps (true preview mapping + true export).
- PR3/PR4 upgrade editing fidelity and trust.
- PR5 proves extensibility with a real AI feature.

## Notes From Reference Editors
- Use OpenCut and FreeCut patterns for timeline UX and editing affordances.
- Use OpenReel-style separation between UI shell and media engine responsibilities.
- Keep Omniclip-style modular boundaries when extracting reusable editor components.
