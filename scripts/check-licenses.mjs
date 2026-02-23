#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const WORKSPACES = [
  {
    path: "apps/api",
    tier: "core",
    enforceLgplBan: true,
    forbidFfmpegPackages: true,
  },
  {
    path: "apps/desktop",
    tier: "core",
    enforceLgplBan: true,
    forbidFfmpegPackages: true,
  },
  {
    path: "packages/shared",
    tier: "core",
    enforceLgplBan: true,
    forbidFfmpegPackages: true,
  },
  {
    path: "poc/editor-web",
    tier: "editor-poc",
    enforceLgplBan: true,
    forbidFfmpegPackages: true,
  },
  {
    path: "poc/render-worker",
    tier: "render-service",
    enforceLgplBan: false,
    forbidFfmpegPackages: false,
  },
];

const options = {
  report: process.argv.includes("--report"),
  json: process.argv.includes("--json"),
};

const ALLOWLIST = [
  /^MIT$/i,
  /^BSD(?:-?\d-Clause)?$/i,
  /^Apache-2\.0$/i,
  /^ISC$/i,
  /^0BSD$/i,
  /^Unlicense$/i,
  /^CC0-1\.0$/i,
  /^Python-2\.0$/i,
  /^Zlib$/i,
];

const GLOBAL_BLOCKLIST = [
  /AGPL/i,
  /\bGPL\b/i,
  /SSPL/i,
  /BUSL/i,
  /Commons Clause/i,
  /Elastic License/i,
  /PolyForm/i,
  /EUPL/i,
  /RPL/i,
];

const CORE_ONLY_BLOCKLIST = [/LGPL/i];

const REVIEW_LICENSES = [
  /MPL/i,
  /CDDL/i,
  /EPL/i,
  /MS-PL/i,
  /MS-RL/i,
];

const CORE_FORBIDDEN_PACKAGES = [
  /^@ffmpeg\//,
  /^ffmpeg(?:$|-)/,
  /^fluent-ffmpeg$/,
  /^ffmpeg-static$/,
];

function normalizeToken(token) {
  return token
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .replace(/\*$/g, "")
    .trim();
}

function splitExpression(expression) {
  if (!expression || typeof expression !== "string") return [];
  return expression
    .replace(/\s+/g, " ")
    .split(/\s+(?:OR|AND|WITH)\s+|\/|,/i)
    .map(normalizeToken)
    .filter(Boolean);
}

function packageNameFromKey(pkgKey) {
  if (!pkgKey.includes("@")) return pkgKey;
  if (pkgKey.startsWith("@")) {
    const secondAt = pkgKey.indexOf("@", 1);
    return secondAt === -1 ? pkgKey : pkgKey.slice(0, secondAt);
  }
  return pkgKey.split("@")[0];
}

function runWorkspaceScan(workspacePath) {
  const raw = execFileSync(
    "pnpm",
    [
      "exec",
      "license-checker-rseidelsohn",
      "--production",
      "--excludePrivatePackages",
      "--json",
      "--start",
      workspacePath,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(raw);
}

function classifyToken(token, workspace) {
  if (!token) return "unknown";
  if (/^LicenseRef-/i.test(token)) return "custom";

  if (GLOBAL_BLOCKLIST.some((pattern) => pattern.test(token))) {
    return "blocked";
  }

  if (workspace.enforceLgplBan && CORE_ONLY_BLOCKLIST.some((pattern) => pattern.test(token))) {
    return "blocked";
  }

  if (ALLOWLIST.some((pattern) => pattern.test(token))) {
    return "allowed";
  }

  if (REVIEW_LICENSES.some((pattern) => pattern.test(token))) {
    return "review";
  }

  return "review";
}

function evaluateDependency(workspace, pkgKey, licenseValue) {
  const pkgName = packageNameFromKey(pkgKey);
  if (
    workspace.forbidFfmpegPackages &&
    CORE_FORBIDDEN_PACKAGES.some((pattern) => pattern.test(pkgName))
  ) {
    return {
      status: "fail",
      reason: "ffmpeg-package-forbidden-in-core",
      expression: String(licenseValue || ""),
      tokens: [],
      packageName: pkgName,
    };
  }

  const expression = Array.isArray(licenseValue)
    ? licenseValue.join(" OR ")
    : String(licenseValue || "").trim();

  if (!expression || /unknown|unlicensed|see license in/i.test(expression)) {
    return {
      status: "fail",
      reason: "unknown-or-unlicensed",
      expression: expression || "UNKNOWN",
      tokens: [],
      packageName: pkgName,
    };
  }

  const tokens = splitExpression(expression);
  if (!tokens.length) {
    return {
      status: "fail",
      reason: "unparseable",
      expression,
      tokens: [],
      packageName: pkgName,
    };
  }

  let hasReview = false;
  for (const token of tokens) {
    const cls = classifyToken(token, workspace);
    if (cls === "blocked" || cls === "custom" || cls === "unknown") {
      return {
        status: "fail",
        reason: cls === "blocked" ? "forbidden-license" : "custom-or-unknown-license",
        expression,
        tokens,
        packageName: pkgName,
      };
    }

    if (cls === "review") {
      hasReview = true;
    }
  }

  return {
    status: hasReview ? "review" : "pass",
    reason: hasReview ? "review-required" : "allowlisted",
    expression,
    tokens,
    packageName: pkgName,
  };
}

const rows = [];
for (const workspace of WORKSPACES) {
  const results = runWorkspaceScan(workspace.path);
  for (const [pkg, meta] of Object.entries(results)) {
    const evaluated = evaluateDependency(workspace, pkg, meta?.licenses);
    rows.push({
      workspace: workspace.path,
      tier: workspace.tier,
      package: pkg,
      packageName: evaluated.packageName,
      license: evaluated.expression,
      ...evaluated,
    });
  }
}

rows.sort((a, b) => a.package.localeCompare(b.package));

if (options.json) {
  const summary = {
    generatedAt: new Date().toISOString(),
    workspaces: WORKSPACES,
    counts: {
      pass: rows.filter((row) => row.status === "pass").length,
      review: rows.filter((row) => row.status === "review").length,
      fail: rows.filter((row) => row.status === "fail").length,
    },
    rows,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.counts.fail > 0 ? 1 : 0);
}

if (options.report) {
  console.log("workspace\ttier\tpackage\tlicense\tstatus\treason");
  for (const row of rows) {
    console.log(
      `${row.workspace}\t${row.tier}\t${row.package}\t${row.license}\t${row.status.toUpperCase()}\t${row.reason}`,
    );
  }
  const failCount = rows.filter((row) => row.status === "fail").length;
  process.exit(failCount > 0 ? 1 : 0);
}

const failures = rows.filter((row) => row.status === "fail");
if (failures.length > 0) {
  console.error("License policy violations found:\n");
  for (const row of failures) {
    console.error(`- [${row.workspace}] ${row.package} -> ${row.license} (${row.reason})`);
  }
  process.exit(1);
}

const reviewRows = rows.filter((row) => row.status === "review");
console.log(
  `License check passed for ${rows.length} package entries across ${WORKSPACES.length} workspaces.`,
);
if (reviewRows.length > 0) {
  console.log(`Review-required packages: ${reviewRows.length}`);
  for (const row of reviewRows) {
    console.log(`- [${row.workspace}] ${row.package} -> ${row.license}`);
  }
}

const totals = new Map();
for (const row of rows) {
  totals.set(row.license, (totals.get(row.license) || 0) + 1);
}
for (const [license, count] of [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`- ${license}: ${count}`);
}
