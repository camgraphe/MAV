# MAV License Policy (v2)

## Non-negotiable Rules
- Core/editor bundles must use permissive licenses only (MIT, BSD, Apache-2.0 class).
- GPL/AGPL are hard-fail forbidden in all workspaces (direct and transitive).
- FFmpeg is allowed only in an isolated server render service and must be configured LGPL-only.
- LGPL is not allowed in core bundles. It is allowed only in isolated services with compliance review.

Workspace scope:
- Core/editor workspaces (`apps/api`, `apps/desktop`, `packages/shared`, `poc/editor-web`): LGPL hard-fail.
- Isolated render service workspace (`poc/render-worker`): LGPL allowed with strict isolation/compliance controls.

## Core Allowlist (default)
- MIT
- BSD-2-Clause
- BSD-3-Clause
- Apache-2.0
- ISC
- 0BSD
- Unlicense
- CC0-1.0 (non-code assets/utilities)

## Blocklist (hard fail in CI)
- AGPL (all versions)
- GPL (all versions)
- LGPL in core workspaces
- SSPL, BUSL, Commons Clause, PolyForm, or other source-available restrictions
- Unknown/custom licenses (`LicenseRef-*`, `SEE LICENSE IN ...`, unknown/unlicensed)

## MPL Exception Note
- MPL-2.0 components can be used only with explicit review and tracking.
- Preferred approach: consume MPL dependencies as-is and avoid modifying MPL-covered files.
- If MPL-covered files are modified, those file-level changes must be distributable per MPL terms.
- CI marks MPL as "REVIEW" status (non-blocking), never auto-approved.

## FFmpeg Isolated Service Policy (LGPL-only)
Required build constraints:
- `--disable-gpl`
- `--disable-nonfree`

Do not enable GPL/nonfree codec libs in service builds:
- `libx264`
- `libx265`
- `libfdk-aac`

Verification checklist per release:
- Capture `ffmpeg -version` and `ffmpeg -buildconf` in build artifacts.
- Confirm buildconf does not include `--enable-gpl` or `--enable-nonfree`.
- Confirm encoders list does not rely on banned external GPL/nonfree libs.
- Attach SBOM and image digest for the render-worker image.

## CI Enforcement
- `pnpm license:check` runs on every push/PR.
- Hard-fail only on blocked/unknown/custom licenses.
- `pnpm license:report` and dependency report artifacts are generated for audit.

## Patent Reminder
Open-source license compliance is separate from codec patent obligations (for example H.264/AAC).
