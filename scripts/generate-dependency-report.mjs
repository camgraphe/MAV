#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const WORKSPACES = [
  { name: "@mav/api", path: "apps/api" },
  { name: "@mav/desktop", path: "apps/desktop" },
  { name: "@mav/shared", path: "packages/shared" },
  { name: "@mav/poc-editor-web", path: "poc/editor-web" },
  { name: "@mav/poc-render-worker", path: "poc/render-worker" },
];

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

function escapeMarkdown(text) {
  return String(text).replace(/\|/g, "\\|");
}

const generatedAt = new Date().toISOString();
const licenseJsonRaw = run("node", ["scripts/check-licenses.mjs", "--json"]);
const licenseData = JSON.parse(licenseJsonRaw);

const reportLines = [];
reportLines.push("# Dependency and License Report (v2)");
reportLines.push("");
reportLines.push(`Generated at: ${generatedAt}`);
reportLines.push("");
reportLines.push("## Policy Gate Summary");
reportLines.push("");
reportLines.push(`- Pass: ${licenseData.counts.pass}`);
reportLines.push(`- Review: ${licenseData.counts.review}`);
reportLines.push(`- Fail: ${licenseData.counts.fail}`);
reportLines.push("");

reportLines.push("## License Inventory (Production Dependencies)");
reportLines.push("");
reportLines.push("| Workspace | Package | License | Status | Reason |");
reportLines.push("|---|---|---|---|---|");
for (const row of licenseData.rows) {
  reportLines.push(
    `| ${escapeMarkdown(row.workspace)} | ${escapeMarkdown(row.package)} | ${escapeMarkdown(row.license)} | ${row.status.toUpperCase()} | ${escapeMarkdown(row.reason)} |`,
  );
}
reportLines.push("");

reportLines.push("## Dependency Trees");
reportLines.push("");
for (const ws of WORKSPACES) {
  let tree = "";
  try {
    tree = run("pnpm", ["--filter", ws.name, "list", "--prod", "--depth", "4"]);
  } catch (error) {
    tree = error.stdout ? String(error.stdout) : String(error.message);
  }

  reportLines.push(`### ${ws.name}`);
  reportLines.push("");
  reportLines.push("```text");
  reportLines.push(tree.trim().length > 0 ? tree.trimEnd() : "(no production dependencies)");
  reportLines.push("```");
  reportLines.push("");
}

reportLines.push("## Notes");
reportLines.push("");
reportLines.push("- CI gate blocks strong copyleft and unknown/custom licenses for core workspaces.");
reportLines.push("- Review status is non-blocking and should be manually approved before production use.");

mkdirSync("docs/reports", { recursive: true });
const outPath = "docs/reports/dependency-license-report-2026-02-23-v2.md";
writeFileSync(outPath, reportLines.join("\n") + "\n", "utf8");
console.log(`Wrote ${outPath}`);
