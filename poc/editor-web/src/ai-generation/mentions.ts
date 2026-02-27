import type { MentionAssetSource, MentionCandidate } from "./types";

const SEEDED_MENTIONS: MentionCandidate[] = [
  { id: "char-ava", label: "Ava", token: "ava", kind: "character", tags: ["hero", "female"] },
  { id: "char-noah", label: "Noah", token: "noah", kind: "character", tags: ["hero", "male"] },
  { id: "char-sage", label: "Sage", token: "sage", kind: "character", tags: ["mentor"] },
  { id: "prop-drone", label: "Drone", token: "drone", kind: "prop", tags: ["tech", "flying"] },
  { id: "prop-vintage-car", label: "Vintage Car", token: "vintage-car", kind: "prop", tags: ["car", "retro"] },
  { id: "env-neon-city", label: "Neon City", token: "neon-city", kind: "environment", tags: ["night", "urban"] },
  { id: "env-desert", label: "Desert Canyon", token: "desert-canyon", kind: "environment", tags: ["sunset"] },
  { id: "style-cinematic", label: "Cinematic", token: "cinematic", kind: "style", tags: ["film", "high-contrast"] },
  { id: "style-analog", label: "Analog Film", token: "analog-film", kind: "style", tags: ["grain"] },
  { id: "ref-golden-hour", label: "Golden Hour", token: "golden-hour", kind: "reference", tags: ["lighting"] },
];

function sanitizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function buildMentionCandidates(projectAssets: MentionAssetSource[]): MentionCandidate[] {
  const assetCandidates: MentionCandidate[] = projectAssets
    .filter((asset) => asset.kind !== "audio")
    .map((asset) => {
      const rawLabel = asset.name?.trim() || asset.id;
      const token = sanitizeToken(rawLabel) || sanitizeToken(asset.id) || `asset-${asset.id}`;
      return {
        id: `asset-${asset.id}`,
        label: rawLabel,
        token,
        kind: "asset",
        tags: [asset.kind, "project"],
      };
    });

  const merged = [...SEEDED_MENTIONS, ...assetCandidates];
  const dedup = new Map<string, MentionCandidate>();
  for (const item of merged) {
    dedup.set(item.id, item);
  }
  return [...dedup.values()];
}

export function findMentionSuggestions(
  query: string,
  candidates: MentionCandidate[],
  limit = 8,
): MentionCandidate[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return candidates.slice(0, limit);

  return candidates
    .filter((candidate) => {
      const haystack = `${candidate.label} ${candidate.token} ${candidate.tags.join(" ")}`.toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, limit);
}
