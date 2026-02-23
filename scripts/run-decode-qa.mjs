#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runCommand(command, commandArgs, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(null);
        return;
      }
      reject(new Error(`${command} ${commandArgs.join(" ")} exited with code ${code ?? "null"}`));
    });
  });
}

async function waitForUrl(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return;
    } catch {
      // wait and retry
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function normalizeStamp(iso) {
  return iso.replaceAll(":", "-").replaceAll(".", "-");
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toOutlierCandidates(record) {
  const scenarios = Array.isArray(record?.scenarios) ? record.scenarios : [];
  const source = record?.diagnostics?.source ?? {};
  const codec = source.codec ?? null;
  const codedWidth = numberOrNull(source.codedWidth);
  const codedHeight = numberOrNull(source.codedHeight);
  const avcCLen = numberOrNull(source.descriptionLength);
  const codedWxH =
    codedWidth != null && codedHeight != null ? `${codedWidth}x${codedHeight}` : "unknown";

  return scenarios
    .filter((scenario) => scenario && scenario.timestampUs != null && scenario.driftFrames != null)
    .map((scenario) => ({
      scenarioId:
        typeof scenario.scenarioId === "number"
          ? `${record.profile}-${scenario.scenarioId}`
          : `${record.profile}-${String(scenario.scenarioId ?? "unknown")}`,
      targetUs: numberOrNull(scenario.targetUs),
      decodedUs: numberOrNull(scenario.timestampUs),
      driftUs: numberOrNull(scenario.driftUs),
      driftFrames: Number(scenario.driftFrames),
      profile: record.profile,
      path: record.mediaPath,
      cacheHit: Boolean(scenario.fromCache),
      idrSkipCount: numberOrNull(scenario.skippedToIdrSamples) ?? 0,
      keyframeStartUs: numberOrNull(scenario.keyframeStartUs),
      config: {
        codec,
        codedWxH,
        avcCLen,
      },
    }));
}

function evaluateThreshold(metric, thresholds) {
  if (!metric) return { pass: false, reasons: ["missing-metric"] };
  const reasons = [];

  if (metric.seek_success_pct < thresholds.seek_success_pct) {
    reasons.push(
      `seek_success_pct=${metric.seek_success_pct.toFixed(2)} < ${thresholds.seek_success_pct}`,
    );
  }
  if (metric.drift_within_1frame_pct < thresholds.drift_within_1frame_pct) {
    reasons.push(
      `drift_within_1frame_pct=${metric.drift_within_1frame_pct.toFixed(2)} < ${thresholds.drift_within_1frame_pct}`,
    );
  }
  if (metric.decode_errors !== thresholds.decode_errors) {
    reasons.push(`decode_errors=${metric.decode_errors} != ${thresholds.decode_errors}`);
  }

  return { pass: reasons.length === 0, reasons };
}

async function retry(action, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(500);
    }
  }
  throw lastError;
}

async function main() {
  const startServer = hasFlag("--start-server");
  const serverMode = getArg("--server-mode", "preview");
  const enforceThresholds = hasFlag("--enforce-thresholds");
  const scenarioCount = Number(getArg("--scenarios", "50"));
  const port = Number(getArg("--port", "4174"));
  const defaultUrl = startServer ? `http://127.0.0.1:${port}` : "http://127.0.0.1:5174";
  const appUrl = getArg("--url", defaultUrl);
  const mediaDir = path.resolve(rootDir, getArg("--media-dir", "poc/editor-web/.qa-media"));
  const manifestPath = path.join(mediaDir, "manifest.json");
  const outputDir = path.resolve(rootDir, getArg("--output-dir", "docs/qa/baselines"));
  const profileList = getArg(
    "--profiles",
    "baseline-short-gop,main-long-gop,high-long-gop,no-audio,fmp4",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const thresholds = {
    seek_success_pct: Number(getArg("--min-seek-success", "98")),
    drift_within_1frame_pct: Number(getArg("--min-drift-within-1frame", "95")),
    decode_errors: Number(getArg("--max-decode-errors", "0")),
  };

  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const entriesByProfile = new Map();
  for (const entry of manifest.entries ?? []) {
    if (entry.qaProfile && !entriesByProfile.has(entry.qaProfile)) {
      entriesByProfile.set(entry.qaProfile, entry);
    }
  }

  let serverProcess = null;
  let browser = null;
  let context = null;
  try {
    if (startServer) {
      if (serverMode !== "dev" && serverMode !== "preview") {
        throw new Error(`Unsupported --server-mode value: ${serverMode}`);
      }

      if (serverMode === "preview") {
        await runCommand(
          "pnpm",
          ["--filter", "@mav/poc-editor-web", "build"],
          rootDir,
        );
      }

      const serverArgs =
        serverMode === "preview"
          ? [
              "--filter",
              "@mav/poc-editor-web",
              "exec",
              "vite",
              "preview",
              "--host",
              "127.0.0.1",
              "--port",
              String(port),
              "--strictPort",
            ]
          : [
              "--filter",
              "@mav/poc-editor-web",
              "exec",
              "vite",
              "--host",
              "127.0.0.1",
              "--port",
              String(port),
              "--strictPort",
            ];

      serverProcess = spawn(
        "pnpm",
        serverArgs,
        {
          cwd: rootDir,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      serverProcess.stdout.on("data", (chunk) => {
        process.stdout.write(`[editor-web] ${chunk}`);
      });
      serverProcess.stderr.on("data", (chunk) => {
        process.stderr.write(`[editor-web] ${chunk}`);
      });

      await waitForUrl(appUrl, 60_000);
    }

    await mkdir(outputDir, { recursive: true });
    await mkdir(path.join(outputDir, "history"), { recursive: true });

    const browserChannel = process.env.PLAYWRIGHT_CHANNEL?.trim() || null;
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
      ...(browserChannel ? { channel: browserChannel } : {}),
    });

    context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);

    // Warm-up navigation to absorb Vite dependency optimization reloads in fresh CI runners.
    await retry(async () => {
      await page.goto(appUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(window.__MAV_DECODE_QA__));
      await sleep(1200);
    }, 2);

    const outputs = [];
    const outlierCandidates = [];

    for (const profile of profileList) {
      const entry = entriesByProfile.get(profile);
      if (!entry) {
        outputs.push({
          profile,
          runAt: new Date().toISOString(),
          status: "missing-media",
          pass: false,
          reasons: [`No media entry found for qaProfile=${profile} in ${manifestPath}`],
          thresholds,
        });
        continue;
      }

      const filePath = path.join(mediaDir, path.basename(entry.filename));
      await retry(async () => {
        await page.goto(appUrl, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(window.__MAV_DECODE_QA__));
        await sleep(200);
      }, 1);

      await retry(async () => {
        await page.setInputFiles("#decode-input-file", filePath);
        await page.waitForFunction(() => {
          const api = window.__MAV_DECODE_QA__;
          if (!api) return false;
          return api.getState().decoderMode !== "none";
        });
      }, 1);

      const state = await retry(
        () => page.evaluate(() => window.__MAV_DECODE_QA__?.getState() ?? null),
        2,
      );
      let record;

      if (profile === "fmp4" || state?.isFmp4Source) {
        record = {
          profile,
          mediaFilename: entry.filename,
          mediaPath: entry.path,
          runAt: new Date().toISOString(),
          status: "skipped-fmp4-fallback-policy",
          pass: true,
          thresholds,
          reasons: ["fMP4 policy active: fallback HTMLVideo preview path (no WebCodecs QA run)."],
          metric: null,
          diagnostics: null,
        };
      } else {
        const runPayload = await retry(
          () =>
            page.evaluate(
              async (payload) => {
                const api = window.__MAV_DECODE_QA__;
                if (!api) return null;
                return api.run(payload);
              },
              { profile, scenarioCount },
            ),
          1,
        );

        const metric = runPayload?.metric ?? null;
        const source = runPayload?.diagnostics?.source ?? null;
        const sourceDecoderMode = source?.decoderMode ?? null;
        const sourceCodec = String(source?.codec ?? "");
        const unsupportedAvcWebCodecs =
          sourceDecoderMode !== "webcodecs" && /(avc1|avc3|h264)/i.test(sourceCodec);

        const thresholdCheck = evaluateThreshold(metric, thresholds);
        if (!metric && unsupportedAvcWebCodecs) {
          record = {
            profile,
            mediaFilename: entry.filename,
            mediaPath: entry.path,
            runAt: new Date().toISOString(),
            status: "skipped-unsupported-webcodecs-codec",
            pass: true,
            thresholds,
            reasons: [
              `WebCodecs unsupported for source codec on this runner: ${sourceCodec || "unknown"}.`,
            ],
            metric: null,
            diagnostics: runPayload?.diagnostics ?? null,
          };
        } else {
          record = {
            profile,
            mediaFilename: entry.filename,
            mediaPath: entry.path,
            runAt: new Date().toISOString(),
            status: thresholdCheck.pass ? "ok" : "threshold-failed",
            pass: thresholdCheck.pass,
            thresholds,
            reasons: thresholdCheck.reasons,
            metric,
            diagnostics: runPayload?.diagnostics ?? null,
          };
        }

        outlierCandidates.push(
          ...toOutlierCandidates({
            profile,
            mediaPath: entry.path,
            scenarios: runPayload?.scenarios ?? [],
            diagnostics: runPayload?.diagnostics ?? null,
          }),
        );
      }

      const stamp = normalizeStamp(record.runAt);
      const latestPath = path.join(outputDir, `${profile}.baseline.json`);
      const historyPath = path.join(outputDir, "history", `${profile}.${stamp}.json`);
      await writeFile(latestPath, JSON.stringify(record, null, 2));
      await writeFile(historyPath, JSON.stringify(record, null, 2));

      outputs.push(record);
      const reasonSuffix =
        Array.isArray(record.reasons) && record.reasons.length > 0
          ? ` reasons=${record.reasons.join(" | ")}`
          : "";
      console.log(
        `${profile}: ${record.status} (${record.pass ? "pass" : "fail"}) -> ${path.relative(rootDir, latestPath)}${reasonSuffix}`,
      );
    }

    const fmp4Outputs = outputs.filter((item) => item.status === "skipped-fmp4-fallback-policy");
    const summary = {
      generatedAt: new Date().toISOString(),
      appUrl,
      scenarioCount,
      thresholds,
      fmp4Policy: {
        expectedStatus: "skipped-fmp4-fallback-policy",
        observedCount: fmp4Outputs.length,
        observedProfiles: fmp4Outputs.map((item) => item.profile),
      },
      outputs,
    };
    const summaryPath = path.join(outputDir, "latest-summary.json");
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));

    outlierCandidates.sort((a, b) => Math.abs(b.driftFrames) - Math.abs(a.driftFrames));

    const runId = normalizeStamp(summary.generatedAt);
    const outlierReport = {
      runId,
      generatedAt: summary.generatedAt,
      appUrl,
      scenarioCount,
      totalCandidates: outlierCandidates.length,
      topCount: Math.min(20, outlierCandidates.length),
      outliers: outlierCandidates.slice(0, 20),
    };
    const outlierPath = path.join(outputDir, "history", `${runId}.outliers.json`);
    await writeFile(outlierPath, JSON.stringify(outlierReport, null, 2));
    console.log(`outliers: wrote ${path.relative(rootDir, outlierPath)}`);

    const failed = outputs.filter((item) => !item.pass);
    if (failed.length > 0) {
      console.error(
        `QA decode failures: ${failed.map((item) => `${item.profile}[${(item.reasons ?? []).join(";")}]`).join(", ")}`,
      );
      if (enforceThresholds) {
        process.exitCode = 1;
      }
    } else {
      console.log("QA decode checks passed.");
    }
  } finally {
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
