export interface TimelineClip {
  id: string;
  assetId: string;
  startSec: number;
  endSec: number;
}

export interface TimelineTrack {
  id: string;
  kind: "video" | "audio" | "subtitle";
  clips: TimelineClip[];
}

export interface MavAsset {
  id: string;
  type: "video" | "audio" | "image";
  name: string;
  src: string;
  durationSec?: number;
}

export interface MavProject {
  version: "1.0";
  id: string;
  name: string;
  fps: number;
  resolution: "1920x1080" | "1080x1920" | "1080x1080" | "3840x2160";
  assets: MavAsset[];
  tracks: TimelineTrack[];
}

export const createEmptyProject = (name: string): MavProject => ({
  version: "1.0",
  id: crypto.randomUUID(),
  name,
  fps: 30,
  resolution: "1920x1080",
  assets: [],
  tracks: [
    { id: crypto.randomUUID(), kind: "video", clips: [] },
    { id: crypto.randomUUID(), kind: "audio", clips: [] }
  ]
});

