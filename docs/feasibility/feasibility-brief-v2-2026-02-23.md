# Feasibility Brief v2: CapCut-like Online Editor

Date: 2026-02-23

## Architecture decision
Recommended: Hybrid.
- Client: timeline editing + realtime preview.
- Server: reliable MP4 export.

Rationale:
- Browser codec support for MP4 is inconsistent with WebCodecs alone.
- Server render path is the reliability anchor for MVP.

## Licensing stance
- Core/editor: permissive only.
- GPL/AGPL: blocked.
- FFmpeg: isolated render service, LGPL-only configuration.
- MPL: review-required with file-level obligation note.

## Library shortlist (license-aware)
- Compositor: PixiJS (MIT) or Konva (MIT)
- Timeline interactions: dnd-kit (MIT), tanstack/virtual (MIT)
- MP4 utilities: mp4box.js (BSD-3-Clause)
- Optional MPL path: Mediabunny (MPL-2.0) with review tracking

## PoC targets (2 weeks)
- timeline editing and deterministic save/load
- frame-accurate scrub on desktop Chrome/Edge
- server MP4 export with progress/retry/cancel
- one AI plugin producing deterministic timeline changes

## Deliverable map
1. Dependency + license report:
- `/Users/adrienmillot/Desktop/MAV/docs/reports/dependency-license-report-2026-02-23-v2.md`
- `/Users/adrienmillot/Desktop/MAV/scripts/check-licenses.mjs` (workspace policy aware)

2. PoC scaffold + ownership plan:
- `/Users/adrienmillot/Desktop/MAV/poc/README.md`
- `/Users/adrienmillot/Desktop/MAV/poc/implementation-plan.md`

3. FFmpeg recipe + compliance:
- `/Users/adrienmillot/Desktop/MAV/docs/ffmpeg/lgpl-render-worker-recipe.md`
- `/Users/adrienmillot/Desktop/MAV/poc/render-worker/compliance-checklist.md`

4. Risk register:
- `/Users/adrienmillot/Desktop/MAV/docs/risks/video-editor-risk-register-v2.md`

5. Effort estimate:
- `/Users/adrienmillot/Desktop/MAV/docs/planning/effort-estimate-v2.md`

6. Code-based deep scanning (nightly/release):
- `/Users/adrienmillot/Desktop/MAV/.github/workflows/code-license-audit.yml`

7. CycloneDX SBOM generation (release):
- `/Users/adrienmillot/Desktop/MAV/scripts/generate-sbom.mjs`
- `/Users/adrienmillot/Desktop/MAV/.github/workflows/sbom-release.yml`
- `/Users/adrienmillot/Desktop/MAV/docs/sbom/*.cdx.json`
