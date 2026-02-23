export type DecodeWorkerInMessage =
  | {
      type: "load";
      buffer: ArrayBuffer;
      mimeType: string;
      auditSamples?: number;
    }
  | {
      type: "seek";
      requestId: number;
      targetUs: number;
      reason?: "preview" | "qa";
    }
  | {
      type: "dispose";
    };

export type DecodeWorkerOutMessage =
  | {
      type: "loaded";
      webCodecs: "supported" | "unsupported";
      width: number;
      height: number;
      fps: number;
      durationUs: number;
      keyframeCount: number;
      isFragmented: boolean;
      fmp4Policy: "webcodecs" | "fallback";
      codec: string;
      codedWidth: number;
      codedHeight: number;
      descriptionLength: number;
      timestampAudit?: {
        issueCount: number;
        firstSamples: Array<{
          index: number;
          timestampUs: number;
          durationUs: number;
          isKey: boolean;
          isIdr: boolean | null;
        }>;
      };
    }
  | {
      type: "frame";
      requestId: number;
      timestampUs: number;
      frame: VideoFrame;
    }
  | {
      type: "seekResult";
      requestId: number;
      targetUs: number;
      timestampUs: number | null;
      status: "ok" | "error" | "stale";
      fromCache: boolean;
      decodeMs: number;
      skippedToIdrSamples?: number;
      keyframeStartUs?: number | null;
      reason?: "preview" | "qa";
      message?: string;
    }
  | {
      type: "log";
      message: string;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "decoderError";
      requestId: number | null;
      token: number | null;
      name: string;
      message: string;
      stack?: string;
      config: {
        codec: string;
        codedWidth: number;
        codedHeight: number;
        descriptionLength: number;
      } | null;
      lastChunk: {
        sampleIndex: number;
        isKey: boolean;
        isIdr: boolean | null;
        timestampUs: number;
        durationUs: number;
      } | null;
    };
