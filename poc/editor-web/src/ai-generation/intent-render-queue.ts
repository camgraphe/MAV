import type { IntentContract } from "./types";

type QueueStatus = "queued" | "generating" | "ready" | "failed";

export type IntentRenderQueueUpdate = {
  clipId: string;
  versionId: string;
  status: QueueStatus;
  progressPct: number;
  error?: string;
  thumbnailUrl?: string | null;
  outputAssetId?: string | null;
};

type QueueJob = {
  clipId: string;
  versionId: string;
  contractSnapshot: IntentContract;
};

type QueueListener = (update: IntentRenderQueueUpdate) => void;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function generateGradientThumbnail(seed: number, label: string): string {
  const random = seededRandom(seed);
  const hueA = Math.floor(random() * 360);
  const hueB = Math.floor((hueA + 45 + random() * 90) % 360);
  const safe = label.replace(/[<>&]/g, "");
  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"360\" viewBox=\"0 0 640 360\"><defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"hsl(${hueA},65%,45%)\"/><stop offset=\"100%\" stop-color=\"hsl(${hueB},72%,36%)\"/></linearGradient></defs><rect width=\"640\" height=\"360\" fill=\"url(#g)\"/><rect x=\"24\" y=\"24\" width=\"592\" height=\"312\" rx=\"18\" fill=\"rgba(15,23,42,0.25)\"/><text x=\"48\" y=\"186\" fill=\"#f8fafc\" font-family=\"ui-sans-serif,system-ui\" font-size=\"30\" font-weight=\"700\">${safe}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export class IntentRenderQueue {
  private readonly maxConcurrency: number;
  private readonly queue: QueueJob[] = [];
  private readonly active = new Map<string, { job: QueueJob; timerId: number; progress: number; willFail: boolean }>();
  private listener: QueueListener;

  constructor(listener: QueueListener, maxConcurrency = 2) {
    this.listener = listener;
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  setListener(listener: QueueListener): void {
    this.listener = listener;
  }

  enqueue(job: QueueJob): void {
    this.queue.push(job);
    this.listener({
      clipId: job.clipId,
      versionId: job.versionId,
      status: "queued",
      progressPct: 0,
    });
    this.pump();
  }

  retry(job: QueueJob): void {
    this.enqueue(job);
  }

  clear(): void {
    for (const current of this.active.values()) {
      window.clearInterval(current.timerId);
    }
    this.active.clear();
    this.queue.splice(0, this.queue.length);
  }

  private pump(): void {
    while (this.active.size < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      this.start(next);
    }
  }

  private start(job: QueueJob): void {
    const seed = hashSeed(`${job.clipId}:${job.versionId}`);
    const random = seededRandom(seed);
    const willFail = random() < 0.16;
    const key = `${job.clipId}:${job.versionId}`;

    this.listener({
      clipId: job.clipId,
      versionId: job.versionId,
      status: "generating",
      progressPct: 4,
    });

    const entry = {
      job,
      timerId: window.setInterval(() => {
        const active = this.active.get(key);
        if (!active) return;
        const increment = Math.max(4, Math.round(8 + random() * 14));
        active.progress = Math.min(100, active.progress + increment);

        if (active.progress < 100) {
          this.listener({
            clipId: active.job.clipId,
            versionId: active.job.versionId,
            status: "generating",
            progressPct: active.progress,
          });
          return;
        }

        window.clearInterval(active.timerId);
        this.active.delete(key);

        if (active.willFail) {
          this.listener({
            clipId: active.job.clipId,
            versionId: active.job.versionId,
            status: "failed",
            progressPct: 100,
            error: "Deterministic simulated failure",
          });
        } else {
          const thumb = generateGradientThumbnail(seed, active.job.contractSnapshot.title || "Intent Render");
          this.listener({
            clipId: active.job.clipId,
            versionId: active.job.versionId,
            status: "ready",
            progressPct: 100,
            thumbnailUrl: thumb,
            outputAssetId: `intent-output-${active.job.versionId}`,
          });
        }

        this.pump();
      }, 280),
      progress: 4,
      willFail,
    };

    this.active.set(key, entry);
  }
}
