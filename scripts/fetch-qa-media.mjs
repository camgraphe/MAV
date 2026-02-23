#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const mediaDir = path.join(rootDir, "poc/editor-web/.qa-media");
const manifestPath = path.join(mediaDir, "manifest.json");
const useForce = process.argv.includes("--force");

const downloads = [
  {
    id: "testvideos_bbb_h264_360p_10s",
    filename: "bbb_h264_testvideos_360p_10s.mp4",
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
    source: "test-videos.co.uk",
    notes: "Big Buck Bunny H.264 seed clip.",
  },
  {
    id: "vms_bbb_480p_30s",
    filename: "bbb_vms_480p_30s.mp4",
    url: "https://raw.githubusercontent.com/chthomos/video-media-samples/master/big-buck-bunny-480p-30sec.mp4",
    source: "video-media-samples",
    notes: "Big Buck Bunny 480p source clip.",
  },
  {
    id: "vms_bbb_1080p_30s",
    filename: "bbb_vms_1080p_30s.mp4",
    url: "https://raw.githubusercontent.com/chthomos/video-media-samples/master/big-buck-bunny-1080p-30sec.mp4",
    source: "video-media-samples",
    notes: "Big Buck Bunny 1080p source clip.",
  },
  {
    id: "vms_bbb_1080p_60fps_30s",
    filename: "bbb_vms_1080p_60fps_30s.mp4",
    url: "https://raw.githubusercontent.com/chthomos/video-media-samples/master/big-buck-bunny-1080p-60fps-30sec.mp4",
    source: "video-media-samples",
    notes: "Big Buck Bunny 1080p60 source clip.",
  },
  {
    id: "chromium_bear_h264",
    filename: "chromium_bear.mp4",
    url: "https://raw.githubusercontent.com/chromium/chromium/main/media/test/data/bear.mp4",
    source: "chromium/media/test/data",
    notes: "Small Chromium MP4 sample.",
  },
  {
    id: "chromium_bear_h264_1280x720",
    filename: "chromium_bear_1280x720.mp4",
    url: "https://raw.githubusercontent.com/chromium/chromium/main/media/test/data/bear-1280x720.mp4",
    source: "chromium/media/test/data",
    notes: "Chromium 720p MP4 sample.",
  },
  {
    id: "chromium_bear_no_audio",
    filename: "chromium_bear_silent.mp4",
    url: "https://raw.githubusercontent.com/chromium/chromium/main/media/test/data/bear_silent.mp4",
    source: "chromium/media/test/data",
    notes: "No-audio MP4 sample.",
    qaProfile: "no-audio",
  },
  {
    id: "chromium_bear_fmp4",
    filename: "chromium_bear_640x360_av_frag_fmp4.mp4",
    url: "https://raw.githubusercontent.com/chromium/chromium/main/media/test/data/bear-640x360-av_frag.mp4",
    source: "chromium/media/test/data",
    notes: "Fragmented MP4 sample (fMP4).",
    qaProfile: "fmp4",
    fragmented: true,
  },
];

const generatedProfiles = [
  {
    id: "baseline_short_gop_aac",
    filename: "qa_h264_baseline_short_gop_aac.mp4",
    inputFilename: "bbb_vms_480p_30s.mp4",
    qaProfile: "baseline-short-gop",
    args: [
      "-t",
      "10",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level:v",
      "3.0",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "30",
      "-keyint_min",
      "30",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
    ],
    notes: "Generated H.264 Baseline profile with short GOP and AAC audio.",
  },
  {
    id: "main_long_gop_aac",
    filename: "qa_h264_main_long_gop_aac.mp4",
    inputFilename: "bbb_vms_480p_30s.mp4",
    qaProfile: "main-long-gop",
    args: [
      "-t",
      "10",
      "-c:v",
      "libx264",
      "-profile:v",
      "main",
      "-level:v",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "120",
      "-keyint_min",
      "120",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
    ],
    notes: "Generated H.264 Main profile with long GOP and AAC audio.",
  },
  {
    id: "high_long_gop_aac",
    filename: "qa_h264_high_long_gop_aac.mp4",
    inputFilename: "bbb_vms_480p_30s.mp4",
    qaProfile: "high-long-gop",
    args: [
      "-t",
      "10",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-level:v",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "120",
      "-keyint_min",
      "120",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
    ],
    notes: "Generated H.264 High profile with long GOP and AAC audio.",
  },
];

const fallbackProfilesWithoutTranscode = [
  {
    id: "baseline_short_gop_aac_fallback",
    filename: "bbb_h264_testvideos_360p_10s.mp4",
    qaProfile: "baseline-short-gop",
    notes:
      "Fallback profile mapping when ffmpeg is unavailable: using downloaded 360p H.264 sample.",
  },
  {
    id: "main_long_gop_aac_fallback",
    filename: "chromium_bear_1280x720.mp4",
    qaProfile: "main-long-gop",
    notes:
      "Fallback profile mapping when ffmpeg is unavailable: using downloaded Chromium 720p H.264 sample.",
  },
  {
    id: "high_long_gop_aac_fallback",
    filename: "bbb_vms_1080p_30s.mp4",
    qaProfile: "high-long-gop",
    notes:
      "Fallback profile mapping when ffmpeg is unavailable: using downloaded 1080p H.264 sample.",
  },
];

function hasCommand(command) {
  const probe = spawnSync(command, ["-version"], { stdio: "ignore" });
  return probe.status === 0;
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const body = Readable.fromWeb(response.body);
  await pipeline(body, createWriteStream(outputPath));
}

function runFfmpeg(inputPath, outputPath, args) {
  const commandArgs = ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, ...args, outputPath];
  const result = spawnSync("ffmpeg", commandArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${path.basename(outputPath)}.`);
  }
}

function probeFile(filePath) {
  if (!hasCommand("ffprobe")) return null;

  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=index,codec_type,codec_name,profile,avg_frame_rate",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(mediaDir, { recursive: true });

  console.log(`QA media directory: ${mediaDir}`);
  console.log(`Force mode: ${useForce ? "enabled" : "disabled"}`);

  const manifestEntries = [];

  for (const item of downloads) {
    const outputPath = path.join(mediaDir, item.filename);
    const exists = await fileExists(outputPath);

    if (!exists || useForce) {
      console.log(`Downloading ${item.filename} ...`);
      await downloadFile(item.url, outputPath);
    } else {
      console.log(`Skip existing ${item.filename}`);
    }

    manifestEntries.push({
      id: item.id,
      filename: item.filename,
      path: `poc/editor-web/.qa-media/${item.filename}`,
      source: item.source,
      sourceUrl: item.url,
      notes: item.notes,
      qaProfile: item.qaProfile ?? null,
      fragmented: item.fragmented ?? false,
      probe: probeFile(outputPath),
    });
  }

  const canTranscode = hasCommand("ffmpeg");
  if (!canTranscode) {
    console.warn("ffmpeg not found. Using fallback profile mapping for Baseline/Main/High clips.");
    for (const item of fallbackProfilesWithoutTranscode) {
      const fallbackPath = path.join(mediaDir, item.filename);
      manifestEntries.push({
        id: item.id,
        filename: item.filename,
        path: `poc/editor-web/.qa-media/${item.filename}`,
        source: "fallback-from-downloaded-sample",
        sourceUrl: null,
        notes: item.notes,
        qaProfile: item.qaProfile,
        fragmented: false,
        probe: probeFile(fallbackPath),
      });
    }
  } else {
    for (const item of generatedProfiles) {
      const inputPath = path.join(mediaDir, item.inputFilename);
      const outputPath = path.join(mediaDir, item.filename);
      const exists = await fileExists(outputPath);

      if (!exists || useForce) {
        console.log(`Generating ${item.filename} ...`);
        runFfmpeg(inputPath, outputPath, item.args);
      } else {
        console.log(`Skip existing generated file ${item.filename}`);
      }

      manifestEntries.push({
        id: item.id,
        filename: item.filename,
        path: `poc/editor-web/.qa-media/${item.filename}`,
        source: "generated-from-vms_bbb_480p_30s",
        sourceUrl: null,
        notes: item.notes,
        qaProfile: item.qaProfile,
        fragmented: false,
        probe: probeFile(outputPath),
      });
    }
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    directory: "poc/editor-web/.qa-media",
    entries: manifestEntries,
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Manifest written: ${manifestPath}`);
  console.log(
    `Profiles ready: ${manifestEntries
      .filter((item) => item.qaProfile)
      .map((item) => `${item.qaProfile}=>${item.filename}`)
      .join(", ")}`,
  );
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  try {
    const previous = await readFile(manifestPath, "utf8");
    if (previous) {
      console.error("Existing manifest kept.");
    }
  } catch {
    // no-op
  }
  process.exitCode = 1;
});
