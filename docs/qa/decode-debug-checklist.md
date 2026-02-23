# Decode Scrubbing Debug Checklist

Use this checklist when scrubbing feels unstable or QA metrics regress.

## Chrome DevTools Media Panel

1. Open DevTools -> `More tools` -> `Media`.
2. Start scrubbing on the timeline in the editor.
3. Check for:
   - large seek bursts that never resolve,
   - repeated decode errors,
   - timestamp jumps larger than one frame around requested seeks,
   - fallback path markers for fMP4 (`TELEMETRY:fmp4_preview_path=fallback_htmlvideo`).

## Worker / UI Verification

1. Confirm `seekResult` events are emitted for each request.
2. Confirm stale seek requests are dropped (`status=stale`) during rapid drag.
3. Confirm cache hits happen around playhead window (faster `decodeMs` on repeated seeks).
4. Confirm `VideoFrame.close()` is always called:
   - after draw path,
   - on stale/ignored frame path,
   - in QA mode when draws are skipped.

## fMP4 Policy

1. Ensure fragmented MP4 is detected in demux (`isFragmented=true`).
2. Ensure preview policy switches to fallback (`fmp4Policy=fallback`).
3. Ensure telemetry marker is present:
   - `TELEMETRY:fmp4_detected policy=fallback-preview`
   - `TELEMETRY:fmp4_preview_path=fallback_htmlvideo`
