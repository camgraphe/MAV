# PoC Workspace

This directory contains the 2-week feasibility PoC for a CapCut-like web editor.

## Structure

- `editor-web/`: browser editor PoC (UI, timeline, AI panel, contracts).
- `render-worker/`: server-side MP4 render worker PoC (FFmpeg LGPL-only path).
- `implementation-plan.md`: task breakdown and ownership.

## Quick Start

- `pnpm dev:poc:web` (starts the editor at `http://localhost:5174`)
- `pnpm dev:poc:render` (starts the render worker at `http://localhost:8790`)

## Validation Commands

- `pnpm --filter @mav/poc-editor-web typecheck`
- `pnpm --filter @mav/poc-render-worker typecheck`
- `pnpm license:check`
- `pnpm deps:report`
