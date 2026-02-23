import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 8787),
  allowMock: String(process.env.ALLOW_MOCK ?? "true").toLowerCase() === "true",
  maxvideoaiBaseUrl: process.env.MAXVIDEOAI_BASE_URL ?? "https://maxvideoai.com",
  maxvideoaiApiKey: process.env.MAXVIDEOAI_API_KEY ?? ""
};

