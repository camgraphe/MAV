# FFmpeg Render-Worker Recipe (LGPL-only)

This recipe defines an isolated server-side render service for reliable MP4 export.

## Service contract
Input:
- project JSON
- signed asset URLs
- preset: `mp4-h264-aac`

Output:
- MP4 file URL
- thumbnails
- progress events

## Build policy
Required FFmpeg configure flags:
- `--disable-gpl`
- `--disable-nonfree`

Must not enable:
- `libx264`
- `libx265`
- `libfdk-aac`

Distribution/legal alignment (LGPL path):
- Preserve FFmpeg copyright and license notices in distribution artifacts.
- Provide access to the exact FFmpeg source corresponding to shipped binaries.
- Preserve and publish build configuration / scripts used for those binaries.
- Keep FFmpeg confined to isolated render-worker deployment units.
- Do not ship FFmpeg binaries in editor/client bundles.

Reference scaffold:
- `/Users/adrienmillot/Desktop/MAV/poc/render-worker/Dockerfile.ffmpeg-lgpl`

## Compliance checks
Run on built image:
- `ffmpeg -version`
- `ffmpeg -buildconf`
- `ffmpeg -encoders`

Store outputs in CI artifacts with image digest and release identifier.

## Operational controls
- queue with idempotency key
- retries with capped backoff
- cancel support
- progress reporting every N frames/segments


## PoC implementation note
- Current PoC render-worker executes real FFmpeg jobs and serves downloadable MP4 outputs via `/api/render/jobs/:jobId/output`.
- Current encoder path may use non-final PoC codecs (`mpeg4` + `aac`) to maximize local portability.
- Production target remains MP4 H.264/AAC under the LGPL-only build policy defined above.
