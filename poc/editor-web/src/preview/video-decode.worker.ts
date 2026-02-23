/// <reference lib="webworker" />

import { DataStream, createFile } from "mp4box";
import type { DecodeWorkerInMessage, DecodeWorkerOutMessage } from "./protocol";

type DemuxedSample = {
  sampleIndex: number;
  timestampUs: number;
  durationUs: number;
  isKey: boolean;
  isIdr: boolean | null;
  data: Uint8Array;
};

type TimestampAuditSample = {
  index: number;
  timestampUs: number;
  durationUs: number;
  isKey: boolean;
  isIdr: boolean | null;
};

type TimestampAudit = {
  issueCount: number;
  firstSamples: TimestampAuditSample[];
};

type DecoderConfigSummary = {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  descriptionLength: number;
};

type ChunkSummary = {
  sampleIndex: number;
  isKey: boolean;
  isIdr: boolean | null;
  timestampUs: number;
  durationUs: number;
};

type DemuxResult = {
  codec: string;
  width: number;
  height: number;
  fps: number;
  durationUs: number;
  isFragmented: boolean;
  isH264: boolean;
  nalLengthSize: number | null;
  descriptionLength: number;
  timestampAudit: TimestampAudit;
  config: VideoDecoderConfig;
  samples: DemuxedSample[];
  keyframeIndexes: number[];
};

type SeekRequest = {
  requestId: number;
  targetUs: number;
  reason?: "preview" | "qa";
  token: number;
};

type SeekContext = {
  requestId: number;
  targetUs: number;
  reason?: "preview" | "qa";
  token: number;
  bestBefore: VideoFrame | null;
  bestAfter: VideoFrame | null;
};

type FrameCacheEntry = {
  timestampUs: number;
  frame: VideoFrame;
  lastUsed: number;
};

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const CACHE_BACKWARD_US = 250_000;
const CACHE_FORWARD_US = 500_000;
const CACHE_MAX_FRAMES = 24;
const DECODE_FORWARD_US = 500_000;
const FEED_YIELD_INTERVAL = 4;

let demux: DemuxResult | null = null;
let decoder: VideoDecoder | null = null;
let activeSeek: SeekContext | null = null;
let pendingSeek: SeekRequest | null = null;

let processingSeek = false;
let seekTokenCounter = 0;
let decoderNeedsRecreate = false;
let lastDecoderMessage: string | null = null;
let currentConfigSummary: DecoderConfigSummary | null = null;
let lastChunkSummary: ChunkSummary | null = null;

const frameCache = new Map<number, FrameCacheEntry>();

function post(message: DecodeWorkerOutMessage, transfer?: Transferable[]) {
  ctx.postMessage(message, transfer ?? []);
}

function log(message: string) {
  post({ type: "log", message });
}

function closeFrame(frame: VideoFrame | null | undefined) {
  if (frame) {
    frame.close();
  }
}

function closeSeekFrames(context: SeekContext | null) {
  if (!context) return;
  closeFrame(context.bestBefore);
  closeFrame(context.bestAfter);
}

function clearCache() {
  for (const entry of frameCache.values()) {
    entry.frame.close();
  }
  frameCache.clear();
}

function trimCacheByWindow(targetUs: number) {
  for (const [timestampUs, entry] of frameCache.entries()) {
    if (timestampUs < targetUs - CACHE_BACKWARD_US || timestampUs > targetUs + CACHE_FORWARD_US) {
      entry.frame.close();
      frameCache.delete(timestampUs);
    }
  }
}

function enforceCacheLimit() {
  if (frameCache.size <= CACHE_MAX_FRAMES) return;
  const entries = [...frameCache.values()].sort((a, b) => a.lastUsed - b.lastUsed);
  const toRemove = frameCache.size - CACHE_MAX_FRAMES;
  for (let i = 0; i < toRemove; i += 1) {
    const entry = entries[i];
    if (!entry) break;
    frameCache.get(entry.timestampUs)?.frame.close();
    frameCache.delete(entry.timestampUs);
  }
}

function cachePutClone(frame: VideoFrame, timestampUs?: number) {
  const ts = timestampUs ?? Number(frame.timestamp);
  const existing = frameCache.get(ts);
  if (existing) {
    existing.frame.close();
    frameCache.delete(ts);
  }

  frameCache.set(ts, {
    timestampUs: ts,
    frame: frame.clone(),
    lastUsed: performance.now(),
  });

  enforceCacheLimit();
}

function pickCachedFrame(targetUs: number): { timestampUs: number; frame: VideoFrame } | null {
  let best: { score: number; drift: number; timestampUs: number; entry: FrameCacheEntry } | null = null;

  for (const entry of frameCache.values()) {
    if (entry.timestampUs < targetUs - CACHE_BACKWARD_US) continue;
    if (entry.timestampUs > targetUs + CACHE_FORWARD_US) continue;

    const drift = Math.abs(entry.timestampUs - targetUs);
    const behindPenalty = entry.timestampUs < targetUs ? 0.1 : 0;
    const score = drift + behindPenalty;

    if (!best || score < best.score) {
      best = { score, drift, timestampUs: entry.timestampUs, entry };
    }
  }

  if (!best) return null;
  const frameIntervalUs = Math.max(1, Math.round(1_000_000 / Math.max(1, demux?.fps ?? 30)));
  const maxAllowedDriftUs = frameIntervalUs;
  if (best.drift > maxAllowedDriftUs) {
    return null;
  }
  best.entry.lastUsed = performance.now();
  return { timestampUs: best.timestampUs, frame: best.entry.frame.clone() };
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: error.stack,
    };
  }

  const value = String(error);
  return {
    name: "UnknownError",
    message: value,
    stack: undefined,
  };
}

function postDecoderError(error: unknown, requestId: number | null, token: number | null) {
  const detail = serializeError(error);
  lastDecoderMessage = `${detail.name}: ${detail.message}`;

  post({
    type: "decoderError",
    requestId,
    token,
    name: detail.name,
    message: detail.message,
    stack: detail.stack,
    config: currentConfigSummary,
    lastChunk: lastChunkSummary,
  });
}

function closeDecoder() {
  if (decoder && decoder.state !== "closed") {
    try {
      decoder.close();
    } catch {
      // no-op
    }
  }
  decoder = null;
}

function currentToken() {
  return seekTokenCounter;
}

function isCancelled(token: number) {
  return token !== currentToken();
}

function frameOutput(frame: VideoFrame) {
  if (!activeSeek) {
    frame.close();
    return;
  }

  const timestampUs = Number(frame.timestamp);

  if (timestampUs >= activeSeek.targetUs - CACHE_BACKWARD_US && timestampUs <= activeSeek.targetUs + CACHE_FORWARD_US) {
    cachePutClone(frame, timestampUs);
  }

  if (timestampUs <= activeSeek.targetUs) {
    closeFrame(activeSeek.bestBefore);
    activeSeek.bestBefore = frame;
    return;
  }

  if (!activeSeek.bestAfter) {
    activeSeek.bestAfter = frame;
    return;
  }

  frame.close();
}

function ensureDecoder(config: VideoDecoderConfig) {
  if (!decoder || decoder.state === "closed" || decoderNeedsRecreate) {
    closeDecoder();

    decoder = new VideoDecoder({
      output: frameOutput,
      error: (error) => {
        decoderNeedsRecreate = true;
        postDecoderError(error, activeSeek?.requestId ?? null, activeSeek?.token ?? null);
      },
    });
    decoderNeedsRecreate = false;
  }

  decoder.reset();
  decoder.configure(config);

  currentConfigSummary = {
    codec: config.codec,
    codedWidth: config.codedWidth ?? 0,
    codedHeight: config.codedHeight ?? 0,
    descriptionLength: config.description ? config.description.byteLength : 0,
  };
}

function toUs(value: number, timescale: number): number {
  return Math.round((value / timescale) * 1_000_000);
}

function getVideoSampleEntry(mp4boxFile: any, trackId: number): any {
  const trak = mp4boxFile.getTrackById(trackId);
  return trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
}

function extractDescriptionFromEntry(entry: any): Uint8Array | undefined {
  try {
    if (!entry) return undefined;
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (!box) return undefined;

    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
    box.write(stream);
    return new Uint8Array(stream.buffer, 8);
  } catch {
    return undefined;
  }
}

function parseAvcNalLengthSize(description: Uint8Array | undefined): number | null {
  if (!description || description.byteLength < 5) return null;
  return (description[4] & 0x03) + 1;
}

function detectIdrAnnexB(data: Uint8Array): boolean {
  for (let i = 0; i + 4 < data.byteLength; i += 1) {
    const threeByteStartCode = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1;
    const fourByteStartCode = threeByteStartCode && data[i - 1] === 0;

    if (!threeByteStartCode && !fourByteStartCode) continue;
    const nalOffset = threeByteStartCode ? i + 3 : i + 4;
    const nalType = data[nalOffset] & 0x1f;
    if (nalType === 5) return true;
  }
  return false;
}

function detectIdrFromAvcSample(data: Uint8Array, nalLengthSize: number | null): boolean {
  if (!nalLengthSize || nalLengthSize < 1 || nalLengthSize > 4) {
    return detectIdrAnnexB(data);
  }

  let offset = 0;
  while (offset + nalLengthSize <= data.byteLength) {
    let nalLength = 0;
    for (let i = 0; i < nalLengthSize; i += 1) {
      nalLength = (nalLength << 8) | data[offset + i];
    }

    offset += nalLengthSize;
    if (nalLength <= 0 || offset + nalLength > data.byteLength) {
      break;
    }

    const nalType = data[offset] & 0x1f;
    if (nalType === 5) {
      return true;
    }

    offset += nalLength;
  }

  return false;
}

async function demuxMp4(buffer: ArrayBuffer, auditSamples: number): Promise<DemuxResult> {
  return new Promise((resolve, reject) => {
    const file = createFile();
    const samples: DemuxedSample[] = [];
    const keyframeIndexes: number[] = [];

    let readyInfo: any = null;
    let readyTrack: any = null;
    let trackEntry: any = null;
    let trackId = -1;
    let description: Uint8Array | undefined;
    let prevTimestampUs = -1;
    let issueCount = 0;
    const firstSamples: TimestampAuditSample[] = [];

    file.onError = (error: unknown) => {
      reject(new Error(String(error)));
    };

    file.onReady = (info: any) => {
      const track = info?.videoTracks?.[0];
      if (!track) {
        reject(new Error("No video track found in MP4."));
        return;
      }

      readyInfo = info;
      readyTrack = track;
      trackId = track.id;
      trackEntry = getVideoSampleEntry(file, trackId);
      description = extractDescriptionFromEntry(trackEntry);

      file.setExtractionOptions(trackId, null, {
        nbSamples: Number.MAX_SAFE_INTEGER,
        rapAlignment: false,
      });
      file.start();
    };

    file.onSamples = (_trackId: number, _user: unknown, mp4Samples: any[]) => {
      const codec = String(readyTrack?.codec ?? "");
      const isH264 = /(avc1|avc3|h264)/i.test(codec);
      const nalLengthSize = parseAvcNalLengthSize(description);

      for (const sample of mp4Samples) {
        const sampleIndex = samples.length;
        const timestampUs = toUs(sample.cts ?? sample.dts, sample.timescale);
        const rawDurationUs = toUs(sample.duration ?? 0, sample.timescale);
        const durationUs = Math.max(1, rawDurationUs);
        const isKey = Boolean(sample.is_sync);
        const isIdr = isH264 ? detectIdrFromAvcSample(sample.data, nalLengthSize) : null;

        if (!Number.isFinite(timestampUs) || !Number.isFinite(durationUs)) {
          issueCount += 1;
        }
        if (rawDurationUs <= 0) {
          issueCount += 1;
        }
        if (prevTimestampUs > timestampUs) {
          issueCount += 1;
        }
        prevTimestampUs = timestampUs;

        const sampleRecord: DemuxedSample = {
          sampleIndex,
          timestampUs,
          durationUs,
          isKey,
          isIdr,
          data: sample.data,
        };
        samples.push(sampleRecord);

        if (firstSamples.length < auditSamples) {
          firstSamples.push({
            index: sampleIndex,
            timestampUs,
            durationUs,
            isKey,
            isIdr,
          });
        }

        if (isKey) {
          keyframeIndexes.push(sampleIndex);
        }
      }
    };

    const data = buffer as ArrayBuffer & { fileStart?: number };
    data.fileStart = 0;
    file.appendBuffer(data);
    file.flush();

    setTimeout(() => {
      if (!readyTrack || samples.length === 0) {
        reject(new Error("No decodable samples extracted from MP4."));
        return;
      }

      const codec = String(readyTrack.codec ?? "unknown");
      const isH264 = /(avc1|avc3|h264)/i.test(codec);
      const descriptionLength = description?.byteLength ?? 0;
      const nalLengthSize = parseAvcNalLengthSize(description);

      if (isH264 && descriptionLength === 0) {
        reject(new Error("Missing avcC description for H.264 track."));
        return;
      }

      const last = samples[samples.length - 1];
      const durationUs = last.timestampUs + last.durationUs;

      const entryWidth = Number(trackEntry?.width ?? 0);
      const entryHeight = Number(trackEntry?.height ?? 0);
      const fallbackWidth = Number(readyTrack.video?.width ?? readyTrack.track_width ?? 0);
      const fallbackHeight = Number(readyTrack.video?.height ?? readyTrack.track_height ?? 0);
      const codedWidth = entryWidth > 0 ? entryWidth : fallbackWidth;
      const codedHeight = entryHeight > 0 ? entryHeight : fallbackHeight;

      const fps = Number(
        readyTrack.nb_samples && readyTrack.duration
          ? readyTrack.nb_samples / (readyTrack.duration / readyTrack.timescale)
          : 30,
      );

      const isFragmented = Boolean(
        readyInfo?.isFragmented ??
          readyInfo?.is_fragmented ??
          readyInfo?.fragment_duration ??
          readyInfo?.fragmented,
      );

      const config: VideoDecoderConfig = {
        codec,
        codedWidth,
        codedHeight,
      };

      if (description && description.byteLength > 0) {
        config.description = description;
      }

      resolve({
        codec,
        width: codedWidth,
        height: codedHeight,
        fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
        durationUs,
        isFragmented,
        isH264,
        nalLengthSize,
        descriptionLength,
        timestampAudit: {
          issueCount,
          firstSamples,
        },
        config,
        samples,
        keyframeIndexes,
      });
    }, 0);
  });
}

function nearestKeyframeIndex(targetUs: number, source: DemuxResult): number {
  if (source.keyframeIndexes.length === 0) return 0;

  let nearest = source.keyframeIndexes[0];
  for (const index of source.keyframeIndexes) {
    const sample = source.samples[index];
    if (!sample) continue;
    if (sample.timestampUs <= targetUs) {
      nearest = index;
      continue;
    }
    break;
  }
  return nearest;
}

function findStartIndexAfterReset(targetUs: number, source: DemuxResult) {
  let startIndex = nearestKeyframeIndex(targetUs, source);
  let skippedToIdrSamples = 0;

  if (!source.isH264) {
    return { startIndex, skippedToIdrSamples };
  }

  while (startIndex < source.samples.length) {
    const sample = source.samples[startIndex];
    if (sample.isIdr === true) {
      break;
    }

    if (sample.isIdr === null && sample.isKey) {
      break;
    }

    startIndex += 1;
    skippedToIdrSamples += 1;
  }

  if (startIndex >= source.samples.length) {
    throw new Error("No IDR sample available after seek reset.");
  }

  return { startIndex, skippedToIdrSamples };
}

function encodeSample(sample: DemuxedSample): EncodedVideoChunk {
  lastChunkSummary = {
    sampleIndex: sample.sampleIndex,
    isKey: sample.isKey,
    isIdr: sample.isIdr,
    timestampUs: sample.timestampUs,
    durationUs: sample.durationUs,
  };

  return new EncodedVideoChunk({
    type: sample.isKey ? "key" : "delta",
    timestamp: sample.timestampUs,
    duration: sample.durationUs,
    data: sample.data,
  });
}

function postSeekResult(
  request: SeekRequest,
  result: {
    status: "ok" | "error" | "stale";
    timestampUs: number | null;
    fromCache: boolean;
    decodeMs: number;
    skippedToIdrSamples?: number;
    keyframeStartUs?: number | null;
    message?: string;
  },
) {
  post({
    type: "seekResult",
    requestId: request.requestId,
    targetUs: request.targetUs,
    timestampUs: result.timestampUs,
    status: result.status,
    fromCache: result.fromCache,
    decodeMs: result.decodeMs,
    skippedToIdrSamples: result.skippedToIdrSamples,
    keyframeStartUs: result.keyframeStartUs ?? null,
    reason: request.reason,
    message: result.message,
  });
}

async function executeSeek(request: SeekRequest) {
  const started = performance.now();

  if (!demux) {
    postSeekResult(request, {
      status: "error",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: "Seek failed: no demuxed source.",
    });
    return;
  }

  if (isCancelled(request.token)) {
    postSeekResult(request, {
      status: "stale",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: "Seek cancelled before decode.",
    });
    return;
  }

  const cached = pickCachedFrame(request.targetUs);
  if (cached) {
    post(
      {
        type: "frame",
        requestId: request.requestId,
        timestampUs: cached.timestampUs,
        frame: cached.frame,
      },
      [cached.frame as unknown as Transferable],
    );

    postSeekResult(request, {
      status: "ok",
      timestampUs: cached.timestampUs,
      fromCache: true,
      decodeMs: performance.now() - started,
      skippedToIdrSamples: 0,
    });
    trimCacheByWindow(request.targetUs);
    return;
  }

  try {
    ensureDecoder(demux.config);
  } catch (error) {
    postDecoderError(error, request.requestId, request.token);
    postSeekResult(request, {
      status: "error",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: `Decoder configure failed: ${String(error)}`,
    });
    return;
  }

  if (isCancelled(request.token)) {
    decoder?.reset();
    postSeekResult(request, {
      status: "stale",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: "Seek cancelled after configure.",
    });
    return;
  }

  let startIndex = 0;
  let skippedToIdrSamples = 0;
  let keyframeStartUs: number | null = null;
  try {
    const start = findStartIndexAfterReset(request.targetUs, demux);
    startIndex = start.startIndex;
    skippedToIdrSamples = start.skippedToIdrSamples;
    keyframeStartUs = demux.samples[startIndex]?.timestampUs ?? null;
    if (skippedToIdrSamples > 0) {
      log(`TELEMETRY:seek_skip_to_idr samples=${skippedToIdrSamples}`);
    }
  } catch (error) {
    postSeekResult(request, {
      status: "error",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: String(error),
      skippedToIdrSamples,
      keyframeStartUs,
    });
    return;
  }

  const context: SeekContext = {
    requestId: request.requestId,
    targetUs: request.targetUs,
    reason: request.reason,
    token: request.token,
    bestBefore: null,
    bestAfter: null,
  };
  activeSeek = context;

  const frameIntervalUs = Math.max(1, Math.round(1_000_000 / demux.fps));
  const decodeUntilUs = request.targetUs + DECODE_FORWARD_US + frameIntervalUs * 2;

  try {
    for (let i = startIndex; i < demux.samples.length; i += 1) {
      if (isCancelled(request.token)) {
        decoder?.reset();
        closeSeekFrames(activeSeek);
        activeSeek = null;
        postSeekResult(request, {
          status: "stale",
          timestampUs: null,
          fromCache: false,
          decodeMs: performance.now() - started,
          message: "Seek cancelled during feed loop.",
          skippedToIdrSamples,
          keyframeStartUs,
        });
        return;
      }

      const sample = demux.samples[i];
      if (sample.timestampUs > decodeUntilUs) {
        break;
      }

      decoder!.decode(encodeSample(sample));

      if (i % FEED_YIELD_INTERVAL === 0) {
        await Promise.resolve();
        if (isCancelled(request.token)) {
          decoder?.reset();
          closeSeekFrames(activeSeek);
          activeSeek = null;
          postSeekResult(request, {
            status: "stale",
            timestampUs: null,
            fromCache: false,
            decodeMs: performance.now() - started,
            message: "Seek cancelled after yield.",
            skippedToIdrSamples,
            keyframeStartUs,
          });
          return;
        }
      }
    }

    await decoder!.flush();

    if (isCancelled(request.token)) {
      decoder?.reset();
      closeSeekFrames(activeSeek);
      activeSeek = null;
      postSeekResult(request, {
        status: "stale",
        timestampUs: null,
        fromCache: false,
        decodeMs: performance.now() - started,
        message: "Seek cancelled after flush.",
        skippedToIdrSamples,
        keyframeStartUs,
      });
      return;
    }
  } catch (error) {
    closeSeekFrames(activeSeek);
    activeSeek = null;

    if (isCancelled(request.token)) {
      postSeekResult(request, {
        status: "stale",
        timestampUs: null,
        fromCache: false,
        decodeMs: performance.now() - started,
        message: "Seek cancelled while decoder was flushing.",
        skippedToIdrSamples,
        keyframeStartUs,
      });
      return;
    }

    postDecoderError(error, request.requestId, request.token);
    postSeekResult(request, {
      status: "error",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: `Decoder flush failed: ${String(error)}`,
      skippedToIdrSamples,
      keyframeStartUs,
    });
    return;
  }

  const finishedContext = activeSeek;
  activeSeek = null;

  if (!finishedContext) {
    postSeekResult(request, {
      status: "error",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: "Seek context missing after decode.",
      skippedToIdrSamples,
      keyframeStartUs,
    });
    return;
  }

  let chosen: VideoFrame | null = null;
  let other: VideoFrame | null = null;
  if (finishedContext.bestBefore && finishedContext.bestAfter) {
    const beforeDrift = Math.abs(Number(finishedContext.bestBefore.timestamp) - request.targetUs);
    const afterDrift = Math.abs(Number(finishedContext.bestAfter.timestamp) - request.targetUs);
    if (beforeDrift <= afterDrift) {
      chosen = finishedContext.bestBefore;
      other = finishedContext.bestAfter;
    } else {
      chosen = finishedContext.bestAfter;
      other = finishedContext.bestBefore;
    }
  } else {
    chosen = finishedContext.bestAfter ?? finishedContext.bestBefore;
    other = chosen === finishedContext.bestAfter ? finishedContext.bestBefore : finishedContext.bestAfter;
  }

  if (!chosen) {
    closeFrame(other);
    postSeekResult(request, {
      status: "error",
      timestampUs: null,
      fromCache: false,
      decodeMs: performance.now() - started,
      message: lastDecoderMessage ?? "No frame decoded for requested timestamp.",
      skippedToIdrSamples,
      keyframeStartUs,
    });
    return;
  }

  const chosenTs = Number(chosen.timestamp);
  cachePutClone(chosen, chosenTs);
  trimCacheByWindow(request.targetUs);

  post(
    {
      type: "frame",
      requestId: request.requestId,
      timestampUs: chosenTs,
      frame: chosen,
    },
    [chosen as unknown as Transferable],
  );

  postSeekResult(request, {
    status: "ok",
    timestampUs: chosenTs,
    fromCache: false,
    decodeMs: performance.now() - started,
    skippedToIdrSamples,
    keyframeStartUs,
  });

  closeFrame(other);
}

async function processSeekQueue() {
  if (processingSeek) return;
  processingSeek = true;

  while (pendingSeek) {
    const request = pendingSeek;
    pendingSeek = null;
    await executeSeek(request);
  }

  processingSeek = false;
}

async function handleLoad(buffer: ArrayBuffer, auditSamples: number) {
  clearCache();
  demux = null;
  lastChunkSummary = null;
  lastDecoderMessage = null;

  try {
    demux = await demuxMp4(buffer, Math.max(0, Math.round(auditSamples)));
    log(`Demuxed ${demux.samples.length} samples, keyframes=${demux.keyframeIndexes.length}.`);
    log(`Decode config: codec=${demux.codec}, coded=${demux.width}x${demux.height}, descriptionLength=${demux.descriptionLength}.`);

    if (demux.timestampAudit.firstSamples.length > 0) {
      log(
        `TIMESTAMP_AUDIT: issues=${demux.timestampAudit.issueCount}, firstSamples=${JSON.stringify(
          demux.timestampAudit.firstSamples,
        )}`,
      );
    } else {
      log(`TIMESTAMP_AUDIT: issues=${demux.timestampAudit.issueCount}, firstSamples=[]`);
    }

    if (demux.isFragmented) {
      log("TELEMETRY:fmp4_detected policy=fallback-preview");
    }

    if (typeof VideoDecoder === "undefined") {
      post({
        type: "loaded",
        webCodecs: "unsupported",
        width: demux.width,
        height: demux.height,
        fps: demux.fps,
        durationUs: demux.durationUs,
        keyframeCount: demux.keyframeIndexes.length,
        isFragmented: demux.isFragmented,
        fmp4Policy: "fallback",
        codec: demux.codec,
        codedWidth: demux.width,
        codedHeight: demux.height,
        descriptionLength: demux.descriptionLength,
        timestampAudit: demux.timestampAudit,
      });
      return;
    }

    const support = await VideoDecoder.isConfigSupported(demux.config);
    if (!support.supported) {
      post({
        type: "loaded",
        webCodecs: "unsupported",
        width: demux.width,
        height: demux.height,
        fps: demux.fps,
        durationUs: demux.durationUs,
        keyframeCount: demux.keyframeIndexes.length,
        isFragmented: demux.isFragmented,
        fmp4Policy: "fallback",
        codec: demux.codec,
        codedWidth: demux.width,
        codedHeight: demux.height,
        descriptionLength: demux.descriptionLength,
        timestampAudit: demux.timestampAudit,
      });
      return;
    }

    demux.config = support.config ?? demux.config;
    ensureDecoder(demux.config);

    const fmp4Policy = demux.isFragmented ? "fallback" : "webcodecs";
    post({
      type: "loaded",
      webCodecs: "supported",
      width: demux.width,
      height: demux.height,
      fps: demux.fps,
      durationUs: demux.durationUs,
      keyframeCount: demux.keyframeIndexes.length,
      isFragmented: demux.isFragmented,
      fmp4Policy,
      codec: demux.codec,
      codedWidth: demux.width,
      codedHeight: demux.height,
      descriptionLength: demux.descriptionLength,
      timestampAudit: demux.timestampAudit,
    });
  } catch (error) {
    post({ type: "error", message: `Load failed: ${String(error)}` });
  }
}

ctx.onmessage = (event: MessageEvent<DecodeWorkerInMessage>) => {
  const message = event.data;

  if (message.type === "load") {
    seekTokenCounter += 1;
    pendingSeek = null;
    closeSeekFrames(activeSeek);
    activeSeek = null;
    if (decoder && decoder.state !== "closed") {
      try {
        decoder.reset();
      } catch {
        // no-op
      }
    }
    void handleLoad(message.buffer, message.auditSamples ?? 0);
    return;
  }

  if (message.type === "seek") {
    if (pendingSeek) {
      postSeekResult(pendingSeek, {
        status: "stale",
        timestampUs: null,
        fromCache: false,
        decodeMs: 0,
        skippedToIdrSamples: 0,
        message: "Superseded by newer pending seek.",
      });
    }

    seekTokenCounter += 1;

    pendingSeek = {
      requestId: message.requestId,
      targetUs: message.targetUs,
      reason: message.reason,
      token: seekTokenCounter,
    };

    if (decoder && decoder.state !== "closed") {
      try {
        decoder.reset();
      } catch {
        decoderNeedsRecreate = true;
      }
    }

    closeSeekFrames(activeSeek);
    activeSeek = null;

    void processSeekQueue();
    return;
  }

  if (message.type === "dispose") {
    seekTokenCounter += 1;
    pendingSeek = null;
    closeSeekFrames(activeSeek);
    activeSeek = null;
    closeDecoder();
    decoderNeedsRecreate = false;
    demux = null;
    currentConfigSummary = null;
    lastChunkSummary = null;
    lastDecoderMessage = null;
    clearCache();
  }
};
