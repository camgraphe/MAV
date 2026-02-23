#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const WORKSPACES = [
  { name: "root-aggregate", path: "." },
  { name: "apps-api", path: "apps/api" },
  { name: "apps-desktop", path: "apps/desktop" },
  { name: "packages-shared", path: "packages/shared" },
  { name: "poc-editor-web", path: "poc/editor-web" },
  { name: "poc-render-worker", path: "poc/render-worker" },
];

const OUT_DIR = "docs/sbom";
mkdirSync(OUT_DIR, { recursive: true });

for (const workspace of WORKSPACES) {
  const outFile = `${OUT_DIR}/${workspace.name}.cdx.json`;
  const args = [
    "exec",
    "cdxgen",
    "-t",
    "npm",
    "--no-install-deps",
    "--spec-version",
    "1.6",
    "--profile",
    "license-compliance",
    "--json-pretty",
    "-o",
    outFile,
    workspace.path,
  ];

  execFileSync("pnpm", args, { stdio: "inherit" });
  console.log(`Wrote ${outFile}`);
}
