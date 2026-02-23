# Risk Register (v2)

## R1: WebCodecs capability gaps
- Impact: client decode/export inconsistency across browsers/devices.
- Likelihood: medium.
- Mitigation: detect capabilities at runtime, route export to server MP4 path by default.

## R2: Safari/mobile constraints
- Impact: reduced performance and API support differences.
- Likelihood: high for mobile Safari.
- Mitigation: desktop-first scope for MVP; explicit fallback behavior for unsupported features.

## R3: A/V sync drift
- Impact: poor export quality and playback mismatch.
- Likelihood: medium.
- Mitigation: single source timeline clock, deterministic frame timebase, sync regression suite (60s/5min).

## R4: Memory pressure on long timelines
- Impact: tab crashes, GC stalls, poor scrub UX.
- Likelihood: medium-high.
- Mitigation: bounded frame cache, worker pools, aggressive bitmap/frame disposal, proxy strategy.

## R5: License regression from new deps
- Impact: legal/commercial blocker.
- Likelihood: medium.
- Mitigation: CI gate (`pnpm license:check`), manual review for MPL/review licenses, block GPL/AGPL/LGPL in core.

## R6: Render service cost/latency spikes
- Impact: poor UX and infrastructure spend.
- Likelihood: medium.
- Mitigation: queue controls, preset limits, timeout policies, per-job observability.
