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
- create project schema v0
- implement tracks/clips split/trim/move/zoom/snap
- add deterministic project serialization

2. Preview decode path (Owner: FE2)
- implement 1-track WebCodecs decoding
- frame-accurate scrub loop
- workerized thumbnails and waveform extraction

3. Overlay layer (Owner: FE2)
- text + image overlays
- transform handles (position/scale/rotation)

4. Save/load + revisions (Owner: BE1)
- project save/load endpoints
- signed URL handling for assets

## Week 2

5. MP4 export service (Owner: BE2)
- render-worker endpoint (job submit/status/cancel)
- retries + progress events
- output MP4 + thumbnails

6. AI plugin framework (Owner: AI1)
- plugin input/output contract
- implement auto-captions OR silence-cut suggestions

7. Performance pass (Owner: FE2 + QA)
- frame cache policy
- worker pool sizing
- memory pressure tests for 60s and 5min projects

8. Validation and exit report (Owner: QA)
- A/V sync checks
- Chrome/Edge desktop pass/fail report
- regression list + known limits
