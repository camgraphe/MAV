export type PluginInput = {
  projectJson: unknown;
  assetRefs: Array<{ id: string; url: string; kind: "video" | "audio" | "image" }>;
  parameters: Record<string, unknown>;
};

export type TimelinePatch = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

export type PluginOutput = {
  patches: TimelinePatch[];
  artifacts?: Array<{
    kind: "vtt" | "srt" | "json" | "mask" | "thumbnail";
    url: string;
  }>;
  metrics?: Record<string, number>;
};

export interface AiPlugin {
  id: string;
  version: string;
  run(input: PluginInput): Promise<PluginOutput>;
}
