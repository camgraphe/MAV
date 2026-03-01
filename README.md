# MAV

MAV is a monorepo for AI-assisted video editing experiments connected to `maxvideoai.com`.

## Repository Structure

- `apps/desktop`: desktop editor app (React + Vite).
- `apps/api`: Node/Express API bridge for AI-related actions.
- `packages/shared`: shared project types (including `.mavproj` contract).
- `poc/editor-web`: browser-based editor PoC.
- `poc/render-worker`: server-side render worker PoC.

## Quick Start

```bash
pnpm install
cp .env.example .env
```

Run the legacy app stack:

```bash
pnpm dev:api
pnpm dev:desktop
```

Run the PoC stack:

```bash
pnpm dev:poc:web
pnpm dev:poc:render
```

Or run all workspace `dev` scripts in parallel:

```bash
pnpm dev
```

Default local URLs:
- Desktop app: `http://localhost:5173`
- API: `http://localhost:8787`
- PoC web editor: `http://localhost:5174`
- PoC render worker: `http://localhost:8790`

## Environment Variables

- `PORT`: API port (default `8787`).
- `MAXVIDEOAI_BASE_URL`: target API base URL.
- `MAXVIDEOAI_API_KEY`: API key.
- `ALLOW_MOCK`: if `true`, allows local mock responses when API key is missing.
- `VITE_API_URL`: API URL consumed by frontend apps.

## Useful Scripts

- `pnpm build`: build all workspaces.
- `pnpm typecheck`: run TypeScript checks for all workspaces.
- `pnpm license:check`: run dependency license validation.
- `pnpm deps:report`: generate dependency report.
- `pnpm sbom:generate`: generate SBOM.

## API Endpoints (MVP)

- `GET /health`
- `POST /api/ai/subtitles`
- `POST /api/ai/voiceover`
- `POST /api/projects/sync`

## Near-Term Roadmap

1. Connect production endpoints from `maxvideoai.com`.
2. Generate `.mavproj` directly from timeline state.
3. Add XML/EDL export for Premiere workflows.

## License

This repository is proprietary ("All rights reserved").  
See `/LICENSE`.
