# Feasibility Brief: CapCut-like Online Video Editor

Date: 2026-02-23

## Executive Recommendation
Choose **hybrid architecture** now:
- Client-side realtime preview/editing (WebCodecs + Canvas/WebGL/WebGPU fallback)
- Server-side export (LGPL-only FFmpeg microservice)

Reason: this is the fastest path to a reliable MVP export while keeping the editor responsive and license-safe.

## 1) Decision Matrix
Scoring: 1 (poor) to 5 (best)

| Option | Preview UX | Export reliability | Browser coverage | Infra cost | Dev complexity | License risk | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Client-only | 5 | 2 | 2 | 5 | 3 | 3 | 20 |
| Hybrid (client preview + server export) | 5 | 5 | 5 | 3 | 4 | 4 | **26** |
| Server-heavy | 2 | 5 | 5 | 2 | 2 | 4 | 20 |

Recommendation: **Hybrid**.

## 2) Reference Project Architecture Notes

### Omniclip (`omni-media/omniclip`)
- Timeline model:
  - Strong typed model with `effects[]`, `tracks[]`, per-effect timing (`start_at_position`, `start`, `end`), and historical/non-historical state split.
  - See: `s/context/types.ts`, `s/context/controllers/timeline/controller.ts`.
- Preview pipeline:
  - PIXI compositor, track-based z-ordering, per-timecode effect activation.
  - See: `s/context/controllers/compositor/controller.ts`.
- Export pipeline:
  - Decodes frames in workers, encodes via WebCodecs worker, then muxes audio/video with FFmpeg wasm helper.
  - See: `s/context/controllers/video-export/controller.ts`, `.../decoder.ts`, `.../encoder.ts`, `.../encode_worker.ts`, `.../FFmpegHelper/helper.ts`.
- Performance patterns:
  - Worker-based decode/encode, frame queue polling, timebase normalization.

Notes:
- Repo `LICENSE` is MIT, but `package.json` says `ISC` (metadata inconsistency).
- Uses `@ffmpeg/core` transitively in app flow; this needs strict license review before reuse.

### OpenReel Video (`Augani/openreel-video`)
- Timeline model:
  - Rich immutable schema (`tracks`, `clips`, `effects`, `keyframes`, transitions/subtitles/markers).
  - See: `packages/core/src/types/timeline.ts`.
- UI timeline state:
  - Dedicated Zustand timeline store for playhead/scrub/zoom/loop/expansion state.
  - See: `apps/web/src/stores/timeline-store.ts`.
- Preview pipeline:
  - Video engine with frame cache, parallel decode workers, ring buffer, renderer factory (WebGPU first, Canvas2D fallback).
  - See: `packages/core/src/video/video-engine.ts`, `parallel-frame-decoder.ts`, `frame-ring-buffer.ts`, `renderer-factory.ts`.
- Export pipeline:
  - MediaBunny-based muxing/encoding path plus worker export and FFmpeg fallback path.
  - See: `packages/core/src/export/export-engine.ts`, `export-worker.ts`, `packages/core/src/media/ffmpeg-fallback.ts`.
- Performance patterns:
  - LRU-like frame caches, decode worker pool, in-flight frame backpressure, periodic micro/major flushes during export.

Notes:
- Repo license MIT, but includes dependencies with non-permissive licenses (notably MPL-2.0 in `mediabunny`) and FFmpeg wasm paths requiring stricter compliance review.

### free-react-video-editor (`reactvideoeditor/free-react-video-editor`)
- Timeline model:
  - Very simple arrays (`clips`, `textOverlays`) with frame-based start/duration.
  - See: `components/react-video-editor.tsx`, `types/types.ts`.
- Preview/export:
  - Remotion Player composition for preview; no serious production export architecture.
- Value:
  - Good as a UI teaching sample only.

Critical license risk:
- README declares proprietary/commercial licensing requirements and references Remotion licensing terms.
- Repo has contradictory `LICENSE.md` (MIT template text).
- Treat as **not safe to reuse in core** until legal clarity is explicit.

### react-video-editor-timeline (`akshay-092/react-video-editor-timeline`)
- Timeline model:
  - Minimal video/audio time indicators synced to media elements.
  - See: `src/components/VideoEditorTimeline.js`.
- Preview/export:
  - No compositor, no multi-track editing engine, no export pipeline.
- Value:
  - Useful only for small UI patterns, not for CapCut-style architecture.

## 3) Library Shortlist (Permissive-focused)

### Canvas / overlays
- `pixi.js` (MIT): strongest realtime compositing path.
- `konva` (MIT): easier 2D transform/text tooling.
- `fabric` (MIT): robust object editing; slower for heavy video compositing.

### Timeline UI
- Build custom timeline +:
  - `@dnd-kit/core` (MIT) for drag/resize interactions
  - `@tanstack/react-virtual` (MIT) for long timeline virtualization
- Optional reference component:
  - `react-calendar-timeline` (MIT)

### Muxing / container
- `webm-muxer` (MIT) for client WebM output.
- `mp4box` (BSD-3-Clause) for MP4 container operations (if needed for client utilities).
- Server fallback: isolated FFmpeg service (LGPL-only build policy in `docs/license-policy.md`).

## 4) 2-Week PoC Plan

### Week 1
- Day 1-2:
  - Project schema v0 (`tracks/clips/effects/keyframes` JSON).
  - Timeline UI with multi-track lanes, zoom, snapping, split/trim/move.
- Day 3:
  - WebCodecs decode + frame-accurate scrubbing for 1 video track.
- Day 4:
  - Overlay layer (text + image stickers) with transform handles.
- Day 5:
  - Save/load projects and deterministic playback timing loop.

### Week 2
- Day 6-7:
  - Server export path (recommended first): project JSON + signed assets -> MP4.
  - Progress, retries, cancel.
- Day 8:
  - AI plugin contract + 1 plugin (`auto-captions` or `silence-cut suggestions`).
- Day 9:
  - Performance pass: frame cache, decode worker offload, waveform generation worker.
- Day 10:
  - End-to-end validation: 60s/5min projects, sync checks, regression checklist.

PoC success criteria:
- Smooth scrub and playback on desktop Chrome/Edge.
- Reliable export completion for sample projects.
- Load/save deterministic project state.
- One AI plugin modifies timeline artifacts predictably.

## 5) License Audit Snapshot

### Current MAV repository (today)
- Automated scan added:
  - Script: `scripts/check-licenses.mjs`
  - CI workflow: `.github/workflows/license-compliance.yml`
  - Policy doc: `docs/license-policy.md`
- Current production deps in this repo are permissive (MIT/BSD).
- Private workspace packages are excluded from third-party enforcement.

### FFmpeg compliance path
- Enforce isolated server render service.
- Enforce `--disable-gpl --disable-nonfree` and ban GPL codec libs (`libx264`, `libx265`, `libfdk-aac`).
- Keep FFmpeg binaries out of web/desktop core bundles.

## 6) Rough Effort to Reach “CapCut-like” v1
Assumption: desktop-first web, small team with strong TS/media expertise.

### Team
- 2 frontend/video engineers
- 1 media/render/backend engineer
- 1 full-stack engineer
- 1 part-time QA/PM

### Timeline
- MVP (your defined scope): 8-12 weeks
- v1 CapCut-like baseline (collab-lite, robust export, templates, effects, captions, reliability hardening): **8-12 months**

### Major effort buckets
- Timeline/editor core + UX polish: 10-14 engineer-months
- Render/preview performance + sync correctness: 8-12 engineer-months
- Export reliability + queue + observability: 6-9 engineer-months
- Assets/storage/project revisioning: 4-6 engineer-months
- AI plugin framework + 2-3 production features: 4-8 engineer-months
- QA, compatibility, hardening, support tooling: 6-10 engineer-months

## 7) Product Questions (recommended defaults)
- Must-have export for MVP: **MP4 required** (WebM optional).
- Max project length for v1: **5 minutes** target, 15 minutes as stretch after perf hardening.
- Devices: **desktop-first only** for v1.
- Offline/local-first: **not required initially**; signed-upload flow is acceptable.

