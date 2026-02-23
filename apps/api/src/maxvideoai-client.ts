import { config } from "./config.js";

export interface SubtitleRequest {
  mediaUrl: string;
  language?: string;
}

export interface VoiceoverRequest {
  script: string;
  voice?: string;
  language?: string;
}

export interface ProjectSyncRequest {
  projectId: string;
  title: string;
  exportPreset: "tiktok" | "reels" | "youtube_shorts" | "youtube";
}

const authHeaders = (): Record<string, string> => {
  if (!config.maxvideoaiApiKey) return {};
  return { Authorization: `Bearer ${config.maxvideoaiApiKey}` };
};

async function postJson<TBody extends object, TResponse>(
  path: string,
  body: TBody,
  mockResponse: TResponse
): Promise<TResponse> {
  if (!config.maxvideoaiApiKey && config.allowMock) {
    return mockResponse;
  }

  const response = await fetch(`${config.maxvideoaiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`maxvideoai error (${response.status}): ${details}`);
  }

  return (await response.json()) as TResponse;
}

export const maxvideoaiClient = {
  requestSubtitles: (body: SubtitleRequest) =>
    postJson("/api/ai/subtitles", body, {
      provider: "mock",
      jobId: `sub_${Date.now()}`,
      status: "queued"
    }),

  requestVoiceover: (body: VoiceoverRequest) =>
    postJson("/api/ai/voiceover", body, {
      provider: "mock",
      jobId: `tts_${Date.now()}`,
      status: "queued"
    }),

  syncProject: (body: ProjectSyncRequest) =>
    postJson("/api/projects/sync", body, {
      provider: "mock",
      syncId: `sync_${Date.now()}`,
      status: "accepted"
    })
};
