# Effort Estimate (MVP vs CapCut-like v1)

## Assumptions
- Team: 4 full-time engineers + part-time QA/PM.
- Scope: desktop web first.

## MVP
Target: 8-12 weeks.

Includes:
- timeline core (trim/split/move/snap/zoom)
- 1-track decode + overlays
- deterministic save/load
- server MP4 export path
- one AI plugin feature

## CapCut-like v1
Target: 8-12 months after MVP.

Major buckets (engineer-months):
- timeline/editor depth + UX polish: 10-14
- preview/render performance hardening: 8-12
- export reliability + queue + observability: 6-9
- project/asset platform features: 4-6
- AI plugin ecosystem (2-3 production features): 4-8
- QA/compliance/device hardening: 6-10

## Staffing guidance
- FE1 + FE2: timeline and preview/compositor
- BE1: platform APIs and persistence
- BE2: render-worker and job system
- AI1 (part-time if needed): plugin contracts and first AI feature
- QA/PM: acceptance matrix and release criteria
