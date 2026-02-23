import cors from "cors";
import express from "express";
import { z } from "zod";

type JobStatus = "queued" | "running" | "completed" | "failed" | "canceled";
type ExportPreset = "720p" | "1080p";
type ExportFps = 24 | 30 | 60;

type RenderOptions = {
  preset: ExportPreset;
  fps: ExportFps;
  format: "mp4";
};

type RenderJob = {
  id: string;
  status: JobStatus;
  progress: number;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
  error?: string;
  renderOptions: RenderOptions;
  sourceAssetCount: number;
  timer?: NodeJS.Timeout;
};

const PORT = Number(process.env.POC_RENDER_PORT ?? 8790);
const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

const jobs = new Map<string, RenderJob>();

const createJobSchema = z.object({
  projectJson: z.record(z.any()),
  assetUrls: z.array(z.string().url()),
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

function startSimulation(job: RenderJob) {
  if (job.timer) {
    clearInterval(job.timer);
  }

  job.status = "running";
  job.updatedAt = nowIso();

  job.timer = setInterval(() => {
    const current = jobs.get(job.id);
    if (!current) return;
    if (current.status !== "running") {
      if (current.timer) clearInterval(current.timer);
      return;
    }

    const speedBoost = current.renderOptions.preset === "720p" ? 2 : 0;
    const fpsBoost = current.renderOptions.fps === 24 ? 2 : current.renderOptions.fps === 60 ? -1 : 0;
    const step = Math.max(5, 10 + speedBoost + fpsBoost);
    current.progress = Math.min(100, current.progress + step);
    current.updatedAt = nowIso();

    if (current.progress >= 100) {
      current.status = "completed";
      current.outputUrl = `https://example.invalid/renders/${current.id}.mp4`;
      current.updatedAt = nowIso();
      if (current.timer) clearInterval(current.timer);
    }
  }, 700);
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "@mav/poc-render-worker",
    now: nowIso(),
    policy: "ffmpeg-lgpl-only",
  });
});

app.post("/api/render/jobs", (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const job: RenderJob = {
    id: nextJobId(),
    status: "queued",
    progress: 0,
    attempts: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    renderOptions: parsed.data.renderOptions,
    sourceAssetCount: parsed.data.assetUrls.length,
  };

  jobs.set(job.id, job);
  startSimulation(job);

  return res.status(202).json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    renderOptions: job.renderOptions,
    sourceAssetCount: job.sourceAssetCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

app.get("/api/render/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "job_not_found" });
  }

  return res.json({
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
  });
});

app.post("/api/render/jobs/:jobId/cancel", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "job_not_found" });
  }

  if (job.timer) clearInterval(job.timer);
  job.status = "canceled";
  job.updatedAt = nowIso();
  return res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    renderOptions: job.renderOptions,
    sourceAssetCount: job.sourceAssetCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
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
  job.attempts += 1;
  job.status = "queued";
  job.updatedAt = nowIso();
  startSimulation(job);

  return res.status(202).json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    renderOptions: job.renderOptions,
    sourceAssetCount: job.sourceAssetCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

app.listen(PORT, () => {
  console.log(`@mav/poc-render-worker listening on http://localhost:${PORT}`);
});
