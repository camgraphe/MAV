import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import cors from "cors";
import express, { type Request } from "express";
import { z } from "zod";

type JobStatus = "queued" | "running" | "completed" | "failed" | "canceled";
type ExportPreset = "720p" | "1080p";
type ExportFps = 24 | 30 | 60;

type RenderOptions = {
  preset: ExportPreset;
  fps: ExportFps;
  format: "mp4";
};

type AssetPayload = {
  assetId: string;
  filename?: string;
  mimeType?: string;
  base64Data: string;
};

type JobRequestPayload = {
  projectJson: unknown;
  assetUrls: string[];
  preset: "mp4-h264-aac";
  renderOptions: RenderOptions;
  idempotencyKey?: string;
  assetPayloads: AssetPayload[];
};

type ProjectAsset = {
  id: string;
  url: string;
};

type ProjectClipPlan = {
  assetId: string;
  inMs: number;
  durationMs: number;
};

type RenderJob = {
  id: string;
  status: JobStatus;
  progress: number;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
  outputPath?: string;
  error?: string;
  renderOptions: RenderOptions;
  sourceAssetCount: number;
  request: JobRequestPayload;
  process?: ChildProcess;
  tempDir?: string;
};

const PORT = Number(process.env.POC_RENDER_PORT ?? 8790);
const FFMPEG_BIN = process.env.POC_RENDER_FFMPEG_BIN ?? "ffmpeg";
const TMP_ROOT = process.env.POC_RENDER_TMP_ROOT ?? path.join(os.tmpdir(), "mav-render-worker");
const DOWNLOAD_TIMEOUT_MS = Number(process.env.POC_RENDER_DOWNLOAD_TIMEOUT_MS ?? 60_000);

const app = express();
app.use(cors());
app.use(express.json({ limit: "250mb" }));

const jobs = new Map<string, RenderJob>();
const jobsByIdempotencyKey = new Map<string, string>();
const queue: string[] = [];
let queueRunning = false;

const assetPayloadSchema = z.object({
  assetId: z.string().min(1),
  filename: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  base64Data: z.string().min(1),
});

const createJobSchema = z.object({
  projectJson: z.unknown(),
  assetUrls: z.array(z.string().url()).default([]),
  preset: z.enum(["mp4-h264-aac"]).default("mp4-h264-aac"),
  renderOptions: z
    .object({
      preset: z.enum(["720p", "1080p"]).default("1080p"),
      fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
      format: z.literal("mp4").default("mp4"),
    })
    .default({
      preset: "1080p",
      fps: 30,
      format: "mp4",
    }),
  idempotencyKey: z.string().min(1).optional(),
  assetPayloads: z.array(assetPayloadSchema).default([]),
});

const retrySchema = z.object({
  jobId: z.string().min(1),
});

function nowIso() {
  return new Date().toISOString();
}

function nextJobId() {
  return `render_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeBase64Data(value: string) {
  const marker = "base64,";
  const index = value.indexOf(marker);
  if (index === -1) return value.trim();
  return value.slice(index + marker.length).trim();
}

function fileExtensionForAsset(payload: AssetPayload) {
  const fromName = payload.filename?.trim();
  if (fromName) {
    const ext = path.extname(fromName);
    if (ext) return ext;
  }

  const mime = payload.mimeType?.toLowerCase() ?? "";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("quicktime") || mime.includes("mov")) return ".mov";
  if (mime.includes("mpeg")) return ".mpg";
  return ".bin";
}

function ffmpegPresetSize(preset: ExportPreset) {
  if (preset === "720p") {
    return { width: 1280, height: 720 };
  }
  return { width: 1920, height: 1080 };
}

function getBaseUrl(req: Request) {
  const host = req.get("host") ?? `localhost:${PORT}`;
  return `${req.protocol}://${host}`;
}

function serializeJob(job: RenderJob) {
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    renderOptions: job.renderOptions,
    sourceAssetCount: job.sourceAssetCount,
    outputUrl: job.outputUrl,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function extractProjectAssets(projectJson: unknown): ProjectAsset[] {
  const root = toObject(projectJson);
  const assets = Array.isArray(root?.assets) ? root.assets : [];
  const result: ProjectAsset[] = [];
  for (const entry of assets) {
    const asset = toObject(entry);
    if (!asset) continue;
    const id = typeof asset.id === "string" ? asset.id : "";
    const url = typeof asset.url === "string" ? asset.url : "";
    if (!id || !url) continue;
    result.push({ id, url });
  }
  return result;
}

function extractPrimaryClip(projectJson: unknown): ProjectClipPlan {
  const root = toObject(projectJson);
  const timeline = toObject(root?.timeline);
  const tracks = Array.isArray(timeline?.tracks) ? timeline?.tracks : [];
  const videoTrack = tracks.find((entry) => {
    const track = toObject(entry);
    return track?.kind === "video" && Array.isArray(track.clips);
  });

  const trackObj = toObject(videoTrack);
  const clips = Array.isArray(trackObj?.clips) ? trackObj.clips : [];
  if (clips.length === 0) {
    throw new Error("No video clip found in timeline.");
  }

  const parsed = clips
    .map((entry) => {
      const clip = toObject(entry);
      if (!clip) return null;
      const assetId = typeof clip.assetId === "string" ? clip.assetId : "";
      const startMs = toNumber(clip.startMs);
      const inMs = toNumber(clip.inMs);
      const durationMs = toNumber(clip.durationMs);
      const outMs = toNumber(clip.outMs, inMs + durationMs);
      if (!assetId || durationMs <= 0) return null;
      return {
        assetId,
        startMs,
        inMs,
        durationMs,
        outMs,
      };
    })
    .filter((entry): entry is { assetId: string; startMs: number; inMs: number; durationMs: number; outMs: number } => Boolean(entry))
    .sort((a, b) => a.startMs - b.startMs);

  const first = parsed[0];
  if (!first) {
    throw new Error("Unable to derive primary clip for export.");
  }

  const boundedDuration = Math.max(100, Math.min(first.durationMs, Math.max(100, first.outMs - first.inMs)));
  return {
    assetId: first.assetId,
    inMs: Math.max(0, first.inMs),
    durationMs: boundedDuration,
  };
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeAssetPayload(tempDir: string, payload: AssetPayload, index: number) {
  const extension = fileExtensionForAsset(payload);
  const filename = `${String(index).padStart(3, "0")}-${payload.assetId}${extension}`;
  const filePath = path.join(tempDir, filename);
  const normalized = normalizeBase64Data(payload.base64Data);
  const buffer = Buffer.from(normalized, "base64");
  if (buffer.byteLength === 0) {
    throw new Error(`Asset payload for ${payload.assetId} is empty.`);
  }
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function downloadAssetToFile(tempDir: string, assetId: string, assetUrl: string, index: number) {
  const extensionFromUrl = (() => {
    try {
      const pathname = new URL(assetUrl).pathname;
      const ext = path.extname(pathname);
      if (ext) return ext;
    } catch {
      // ignored
    }
    return ".mp4";
  })();

  const filePath = path.join(tempDir, `${String(index).padStart(3, "0")}-${assetId}${extensionFromUrl}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(assetUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Asset download failed (${response.status}) for ${assetId}.`);
    }
    if (!response.body) {
      throw new Error(`Asset response body missing for ${assetId}.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength === 0) {
      throw new Error(`Downloaded asset ${assetId} is empty.`);
    }
    await fs.writeFile(filePath, buffer);
    return filePath;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function materializeAssets(job: RenderJob) {
  const projectAssets = extractProjectAssets(job.request.projectJson);
  const payloadById = new Map(job.request.assetPayloads.map((entry) => [entry.assetId, entry]));
  const resolved = new Map<string, string>();

  const tempDir = path.join(TMP_ROOT, job.id);
  await ensureDir(tempDir);
  job.tempDir = tempDir;

  for (let i = 0; i < projectAssets.length; i += 1) {
    const asset = projectAssets[i];
    const payload = payloadById.get(asset.id);
    if (payload) {
      const filePath = await writeAssetPayload(tempDir, payload, i);
      resolved.set(asset.id, filePath);
      continue;
    }

    if (/^https?:\/\//i.test(asset.url)) {
      const filePath = await downloadAssetToFile(tempDir, asset.id, asset.url, i);
      resolved.set(asset.id, filePath);
      continue;
    }
  }

  return resolved;
}

function setJobFailed(job: RenderJob, message: string) {
  job.status = "failed";
  job.error = message;
  job.updatedAt = nowIso();
}

function isJobCanceled(job: RenderJob) {
  return job.status === "canceled";
}

async function runFfmpegJob(job: RenderJob, inputPath: string, outputPath: string, clip: ProjectClipPlan) {
  const { width, height } = ffmpegPresetSize(job.renderOptions.preset);
  const fps = job.renderOptions.fps;
  const startSeconds = (clip.inMs / 1000).toFixed(3);
  const durationSeconds = (clip.durationMs / 1000).toFixed(3);

  const args = [
    "-y",
    "-ss",
    startSeconds,
    "-t",
    durationSeconds,
    "-i",
    inputPath,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    "-r",
    String(fps),
    "-c:v",
    "mpeg4",
    "-q:v",
    "3",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath,
  ];

  const child = spawn(FFMPEG_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  job.process = child;

  const expectedDurationMs = Math.max(100, clip.durationMs);
  let stderrTail = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("out_time_us=")) {
        const us = Number(line.slice("out_time_us=".length));
        if (Number.isFinite(us)) {
          job.progress = clamp(Math.round((us / 1000 / expectedDurationMs) * 100), 0, 99);
          job.updatedAt = nowIso();
        }
      } else if (line.startsWith("out_time_ms=")) {
        const raw = Number(line.slice("out_time_ms=".length));
        if (Number.isFinite(raw)) {
          const ms = raw > expectedDurationMs * 10 ? raw / 1000 : raw;
          job.progress = clamp(Math.round((ms / expectedDurationMs) * 100), 0, 99);
          job.updatedAt = nowIso();
        }
      } else if (line === "progress=end") {
        job.progress = 100;
        job.updatedAt = nowIso();
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = `${stderrTail}${chunk}`;
    if (stderrTail.length > 12_000) {
      stderrTail = stderrTail.slice(stderrTail.length - 12_000);
    }
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });

  job.process = undefined;

  if (isJobCanceled(job)) {
    return;
  }

  if (exitCode !== 0) {
    const compact = stderrTail.trim().split(/\r?\n/).slice(-8).join(" | ");
    throw new Error(`FFmpeg failed (exit=${exitCode}): ${compact || "no stderr"}`);
  }
}

async function cleanupJobTemp(job: RenderJob) {
  if (!job.tempDir) return;
  const tempDir = job.tempDir;
  job.tempDir = undefined;
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function executeJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job || job.status !== "queued") return;

  job.status = "running";
  job.error = undefined;
  job.progress = 0;
  job.updatedAt = nowIso();

  try {
    await ensureDir(TMP_ROOT);
    const resolvedAssets = await materializeAssets(job);
    const clip = extractPrimaryClip(job.request.projectJson);
    const inputPath = resolvedAssets.get(clip.assetId);
    if (!inputPath) {
      throw new Error(`No local or downloadable source found for asset ${clip.assetId}.`);
    }

    const outputPath = path.join(TMP_ROOT, `${job.id}.mp4`);
    await runFfmpegJob(job, inputPath, outputPath, clip);

    if (isJobCanceled(job)) {
      return;
    }

    job.outputPath = outputPath;
    job.progress = 100;
    job.status = "completed";
    job.updatedAt = nowIso();
  } catch (error) {
    if (!isJobCanceled(job)) {
      const message = error instanceof Error ? error.message : String(error);
      setJobFailed(job, message);
    }
  } finally {
    await cleanupJobTemp(job).catch(() => {
      // Best effort cleanup.
    });
  }
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;

  try {
    while (queue.length > 0) {
      const jobId = queue.shift();
      if (!jobId) continue;
      await executeJob(jobId);
    }
  } finally {
    queueRunning = false;
  }
}

function enqueueJob(jobId: string) {
  if (!queue.includes(jobId)) {
    queue.push(jobId);
  }
  void processQueue();
}

app.get("/health", async (_req, res) => {
  let ffmpegVersion = "unknown";
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(FFMPEG_BIN, ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
      let text = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        text += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg -version failed with ${code ?? "null"}`));
          return;
        }
        resolve(text);
      });
    });
    ffmpegVersion = output.split(/\r?\n/)[0] ?? "unknown";
  } catch {
    ffmpegVersion = "unavailable";
  }

  res.json({
    status: "ok",
    service: "@mav/poc-render-worker",
    now: nowIso(),
    policy: "ffmpeg-lgpl-only",
    ffmpeg: ffmpegVersion,
  });
});

app.post("/api/render/jobs", (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload: JobRequestPayload = {
    projectJson: parsed.data.projectJson,
    assetUrls: parsed.data.assetUrls,
    preset: parsed.data.preset,
    renderOptions: parsed.data.renderOptions,
    idempotencyKey: parsed.data.idempotencyKey,
    assetPayloads: parsed.data.assetPayloads,
  };

  if (payload.idempotencyKey) {
    const existingJobId = jobsByIdempotencyKey.get(payload.idempotencyKey);
    if (existingJobId) {
      const existing = jobs.get(existingJobId);
      if (existing) {
        if (existing.status === "completed" && !existing.outputUrl) {
          existing.outputUrl = `${getBaseUrl(req)}/api/render/jobs/${existing.id}/output`;
        }
        return res.status(202).json(serializeJob(existing));
      }
    }
  }

  const job: RenderJob = {
    id: nextJobId(),
    status: "queued",
    progress: 0,
    attempts: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    renderOptions: payload.renderOptions,
    sourceAssetCount: payload.assetPayloads.length || payload.assetUrls.length,
    request: payload,
  };

  if (payload.idempotencyKey) {
    jobsByIdempotencyKey.set(payload.idempotencyKey, job.id);
  }

  jobs.set(job.id, job);
  enqueueJob(job.id);
  return res.status(202).json(serializeJob(job));
});

app.get("/api/render/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "job_not_found" });
  }

  if (job.status === "completed" && !job.outputUrl) {
    job.outputUrl = `${getBaseUrl(req)}/api/render/jobs/${job.id}/output`;
  }

  return res.json(serializeJob(job));
});

app.get("/api/render/jobs/:jobId/output", async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "job_not_found" });
  }
  if (job.status !== "completed" || !job.outputPath) {
    return res.status(409).json({ error: "job_not_completed" });
  }

  try {
    await fs.access(job.outputPath);
  } catch {
    return res.status(410).json({ error: "output_missing" });
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="${job.id}.mp4"`);
  return res.sendFile(job.outputPath);
});

app.post("/api/render/jobs/:jobId/cancel", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "job_not_found" });
  }

  if (job.status === "completed" || job.status === "failed" || job.status === "canceled") {
    return res.json(serializeJob(job));
  }

  job.status = "canceled";
  job.updatedAt = nowIso();

  if (job.process) {
    job.process.kill("SIGTERM");
    job.process = undefined;
  }

  return res.json(serializeJob(job));
});

app.post("/api/render/jobs/retry", (req, res) => {
  const parsed = retrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const job = jobs.get(parsed.data.jobId);
  if (!job) {
    return res.status(404).json({ error: "job_not_found" });
  }

  if (job.status === "running") {
    return res.status(409).json({ error: "job_already_running" });
  }

  job.progress = 0;
  job.error = undefined;
  job.outputUrl = undefined;
  job.outputPath = undefined;
  job.attempts += 1;
  job.status = "queued";
  job.updatedAt = nowIso();
  enqueueJob(job.id);

  return res.status(202).json(serializeJob(job));
});

app.listen(PORT, () => {
  console.log(`@mav/poc-render-worker listening on http://localhost:${PORT}`);
});
