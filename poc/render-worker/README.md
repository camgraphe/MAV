# PoC Render Worker

Server-side render service used for export jobs.

## Current Behavior

- Real FFmpeg execution (no timer simulation).
- Queue management with progress, cancel, and retry support.
- Job API endpoints:
  - `POST /api/render/jobs`
  - `GET /api/render/jobs/:jobId`
  - `POST /api/render/jobs/:jobId/cancel`
  - `POST /api/render/jobs/retry`
  - `GET /api/render/jobs/:jobId/output`

## Input Contract

`POST /api/render/jobs` accepts:

- `projectJson`
- `assetUrls` (`http`/`https`)
- `assetPayloads` (optional inline base64 for local uploads)
- `renderOptions` (`preset`, `fps`, `format=mp4`)
- `idempotencyKey` (optional)

## Render Scope (PoC)

- Uses the first clip of the first video track as the export source.
- Applies trim using `inMs` + `durationMs`.
- Encodes MP4 with FFmpeg (`mpeg4` video + `aac` audio in this PoC path).

## Notes

- For production and legal compliance, keep FFmpeg isolated in this service.
- See also:
  - `Dockerfile.ffmpeg-lgpl`
  - `compliance-checklist.md`
  - `docs/ffmpeg/lgpl-render-worker-recipe.md`
