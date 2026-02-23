# PoC Scaffold

This folder contains a practical scaffold for a 2-week feasibility PoC of a CapCut-like online editor.

Structure:
- `editor-web/`: browser editor contracts and architecture notes
- `render-worker/`: server MP4 render service scaffold + FFmpeg LGPL recipe
- `implementation-plan.md`: work breakdown with ownership

Quick start:
- `pnpm dev:poc:web` (runs editor web on `http://localhost:5174`)
- `pnpm dev:poc:render` (runs render-worker on `http://localhost:8790`)

Validation commands:
- `pnpm --filter @mav/poc-editor-web typecheck`
- `pnpm --filter @mav/poc-render-worker typecheck`
- `pnpm license:check`
- `pnpm deps:report`
