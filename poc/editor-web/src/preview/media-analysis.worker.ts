type AnalyzeRequest = {
  type: "analyze";
  assetId: string;
  buffer: ArrayBuffer;
  durationMs: number;
  thumbnailsPerSecond?: number;
};

type AnalyzeResponse = {
  type: "analysis";
  assetId: string;
  waveform: number[];
  thumbnails: string[];
  codecGuess: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toTimeLabel(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function guessCodec(bytes: Uint8Array): string | null {
  const sample = new TextDecoder("ascii", { fatal: false }).decode(bytes.subarray(0, 4096));
  if (sample.includes("av01")) return "AV1";
  if (sample.includes("vp09")) return "VP9";
  if (sample.includes("hvc1") || sample.includes("hev1")) return "HEVC";
  if (sample.includes("avc1")) return "H.264";
  return null;
}

function buildWaveform(bytes: Uint8Array, points = 96): number[] {
  const values: number[] = [];
  const bucketSize = Math.max(1, Math.floor(bytes.length / points));
  for (let i = 0; i < points; i += 1) {
    const start = i * bucketSize;
    const end = Math.min(bytes.length, start + bucketSize);
    if (start >= end) {
      values.push(0.2);
      continue;
    }
    let acc = 0;
    for (let p = start; p < end; p += 8) {
      acc += Math.abs(bytes[p] - 128) / 128;
    }
    const normalized = acc / Math.max(1, Math.ceil((end - start) / 8));
    values.push(clamp(normalized, 0.08, 1));
  }
  return values;
}

function buildThumbnailDataUrl(assetId: string, index: number, atMs: number): string {
  const hash = hashString(`${assetId}-${index}-${atMs}`);
  const hue = hash % 360;
  const label = toTimeLabel(atMs);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hue} 65% 72%)" />
<stop offset="100%" stop-color="hsl(${(hue + 34) % 360} 55% 48%)" />
</linearGradient></defs>
<rect width="160" height="90" fill="url(#g)" rx="8" ry="8" />
<rect x="8" y="8" width="144" height="74" fill="rgba(0,0,0,0.12)" rx="6" ry="6" />
<text x="80" y="48" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="Arial, sans-serif" font-size="16">${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildThumbnails(assetId: string, durationMs: number, thumbnailsPerSecond = 1): string[] {
  void assetId;
  void durationMs;
  void thumbnailsPerSecond;
  return [];
}

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const message = event.data;
  if (message.type !== "analyze") return;

  const bytes = new Uint8Array(message.buffer);
  const response: AnalyzeResponse = {
    type: "analysis",
    assetId: message.assetId,
    waveform: buildWaveform(bytes),
    thumbnails: buildThumbnails(message.assetId, Math.max(0, message.durationMs), message.thumbnailsPerSecond),
    codecGuess: guessCodec(bytes),
  };
  self.postMessage(response);
};
