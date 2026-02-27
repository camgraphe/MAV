import type { MentionCandidate } from "./types";

type AssetLike = {
  id: string;
  name?: string;
  kind?: "video" | "audio" | "image";
};

type BuildMentionCandidatesInput = {
  assets: AssetLike[];
};

function toToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function buildMentionCandidates(input: BuildMentionCandidatesInput): MentionCandidate[] {
  const result: MentionCandidate[] = [];
  for (const asset of input.assets) {
    const label = asset.name?.trim() || asset.id;
    result.push({
      id: `asset-${asset.id}`,
      label,
      token: toToken(label) || `asset-${result.length + 1}`,
      kind: "asset",
      tags: [asset.kind ?? "media"],
    });
  }
  return result;
}

export function findMentionSuggestions(query: string, candidates: MentionCandidate[], limit: number): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates.slice(0, Math.max(1, limit));
  return candidates
    .filter((candidate) => candidate.token.includes(q) || candidate.label.toLowerCase().includes(q))
    .slice(0, Math.max(1, limit));
}
