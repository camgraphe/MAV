import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { maxvideoaiClient } from "./maxvideoai-client.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "@mav/api",
    now: new Date().toISOString(),
    mode: config.maxvideoaiApiKey ? "live" : "mock"
  });
});

const subtitlesSchema = z.object({
  mediaUrl: z.string().url(),
  language: z.string().default("fr")
});

app.post("/api/ai/subtitles", async (req, res) => {
  const payload = subtitlesSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = await maxvideoaiClient.requestSubtitles(payload.data);
    return res.status(202).json(result);
  } catch (error) {
    return res.status(502).json({ error: String(error) });
  }
});

const voiceoverSchema = z.object({
  script: z.string().min(1),
  voice: z.string().default("default"),
  language: z.string().default("fr")
});

app.post("/api/ai/voiceover", async (req, res) => {
  const payload = voiceoverSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = await maxvideoaiClient.requestVoiceover(payload.data);
    return res.status(202).json(result);
  } catch (error) {
    return res.status(502).json({ error: String(error) });
  }
});

const syncSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  exportPreset: z.enum(["tiktok", "reels", "youtube_shorts", "youtube"])
});

app.post("/api/projects/sync", async (req, res) => {
  const payload = syncSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = await maxvideoaiClient.syncProject(payload.data);
    return res.status(202).json(result);
  } catch (error) {
    return res.status(502).json({ error: String(error) });
  }
});

app.listen(config.port, () => {
  // Keep startup logs minimal in dev.
  console.log(`@mav/api listening on http://localhost:${config.port}`);
});

