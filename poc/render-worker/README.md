# render-worker scaffold

Input:
- project JSON
- signed asset URLs
- render preset (mp4/h264/aac)

Output:
- MP4 file
- thumbnails
- progress events

Operational requirements:
- queue + retries + cancel
- deterministic render idempotency key
- strict FFmpeg LGPL-only build

See:
- `Dockerfile.ffmpeg-lgpl`
- `compliance-checklist.md`
