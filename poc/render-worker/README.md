# render-worker (PoC)

Server-side render service for export jobs.

## Current behavior
- Real FFmpeg job execution (no timer simulation).
- Queue + progress + cancel + retry.
- Job status API:
  - `POST /api/render/jobs`
  - `GET /api/render/jobs/:jobId`
  - `POST /api/render/jobs/:jobId/cancel`
  - `POST /api/render/jobs/retry`
  - `GET /api/render/jobs/:jobId/output`

## Input contract
`POST /api/render/jobs` accepts:
- `projectJson`
- `assetUrls` (http/https)
- `assetPayloads` (optional inline base64 for local uploads)
- `renderOptions` (`preset`, `fps`, `format=mp4`)
- `idempotencyKey` (optional)

## Render scope (PoC)
- Uses the first clip from the first video track as export source.
- Applies trim from `inMs` + `durationMs`.
- Encodes MP4 using FFmpeg (`mpeg4` video + `aac` audio in this PoC path).

## Notes
- For production/legal alignment, keep FFmpeg in isolated service only.
- See:
  - `Dockerfile.ffmpeg-lgpl`
  - `compliance-checklist.md`
  - `docs/ffmpeg/lgpl-render-worker-recipe.md`
