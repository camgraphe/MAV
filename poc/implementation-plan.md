# 2-Week PoC Implementation Plan (Tasks + Ownership)

Current progress:
- Week-1 Task 1 started in `poc/editor-web` (split/trim/move/zoom/snap scaffold implemented).
- Week-1 Task 4 started in `poc/editor-web` (deterministic save/load + JSON export implemented).

Owners:
- FE1: timeline/editor frontend
- FE2: preview/compositor frontend
- BE1: API + project persistence
- BE2: render-worker + queue
- AI1: plugin contract + one plugin
- QA: test matrix, regression list

## Week 1

1. Schema + timeline base (Owner: FE1)
- Create project schema v0.
- Implement track/clip split, trim, move, zoom, and snap.
- Add deterministic project serialization.

2. Preview decode path (Owner: FE2)
- Implement one-track WebCodecs decoding.
- Build a frame-accurate scrubbing loop.
- Add workerized thumbnail and waveform extraction.

3. Overlay layer (Owner: FE2)
- Add text and image overlays.
- Implement transform handles (position/scale/rotation).

4. Save/load + revisions (Owner: BE1)
- Implement project save/load endpoints.
- Add signed URL handling for assets.

## Week 2

5. MP4 export service (Owner: BE2)
- Implement render-worker endpoints (submit/status/cancel).
- Add retries and progress events.
- Produce MP4 output + thumbnails.

6. AI plugin framework (Owner: AI1)
- Define plugin input/output contract.
- Implement auto-captions or silence-cut suggestions.

7. Performance pass (Owner: FE2 + QA)
- Tune frame cache policy.
- Size worker pools.
- Run memory pressure tests on 60s and 5min projects.

8. Validation and exit report (Owner: QA)
- Run A/V sync checks.
- Deliver Chrome/Edge desktop pass/fail report.
- Publish regression list + known limits.
