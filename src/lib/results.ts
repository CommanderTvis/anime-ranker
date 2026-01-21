import { AnimeEntry, AnimeResult, EloState, NormalFit } from "./types";
import { percentile, score10FromPercentile } from "./scoring";

export type BlendingParams = {
  malNormality: number;
  completionRatio: number;
  malFit: NormalFit;
  totalComparisons: number;
  itemCount: number;
};

/**
 * Compute how much to weight Elo vs MAL scores.
 *
 * Formula: eloWeight = completionRatio^(1 + (1 - malNormality))
 *
 * - When completionRatio is low → eloWeight is low (trust MAL more)
 * - When malNormality is high → exponent closer to 1, eloWeight rises faster
 * - When malNormality is low → exponent higher, need more comparisons to trust Elo
 *
 * At completionRatio=1 (target reached), eloWeight=1 regardless of normality.
 * This ensures smooth transition as users complete more comparisons.
 */
export const computeEloWeight = (
  completionRatio: number,
  malNormality: number,
): number => {
  const ratio = Math.max(0, Math.min(1, completionRatio));
  const normality = Math.max(0, Math.min(1, malNormality));
  const exponent = 1 + (1 - normality);
  return Math.pow(ratio, exponent);
};

/**
 * Convert a MAL score (1-10) to a percentile (0-1).
 * Uses the MAL fit distribution to determine where this score falls.
 */
const malScoreToPercentile = (score: number, malFit: NormalFit): number => {
  if (malFit.sigma <= 0) {
    return (score - 1) / 9;
  }
  return percentile(score, malFit);
};

/**
 * Compute per-item Elo confidence based on games played.
 * Items with more games have more reliable Elo ratings.
 *
 * Uses a soft curve: confidence = 1 - e^(-games / expectedGames)
 * This gives ~63% confidence at expectedGames, ~86% at 2x, ~95% at 3x
 */
const computeItemConfidence = (
  games: number,
  expectedGames: number,
): number => {
  if (expectedGames <= 0 || games <= 0) return 0;
  return 1 - Math.exp(-games / expectedGames);
};

export const buildResults = (
  animeById: Map<number, AnimeEntry>,
  elo: EloState,
  fit: NormalFit,
  statusTier?: Record<string, number>,
  percentileShift = 0,
  blending?: BlendingParams,
): AnimeResult[] => {
  const globalEloWeight = blending
    ? computeEloWeight(blending.completionRatio, blending.malNormality)
    : 1;

  // Expected games per item: total comparisons * 2 (each comparison involves 2 items) / item count
  const expectedGamesPerItem =
    blending && blending.itemCount > 0
      ? (blending.totalComparisons * 2) / blending.itemCount
      : 2;

  // First pass: compute blended percentiles for all entries
  const entries = Array.from(elo.ratings.entries()).map(([animeId, rating]) => {
    const anime = animeById.get(animeId) as AnimeEntry;
    const eloPercentile = percentile(rating.value, fit);

    let blendedPercentile: number;
    if (blending && anime.myScore && anime.myScore > 0) {
      const malPercentile = malScoreToPercentile(
        anime.myScore,
        blending.malFit,
      );

      // Per-item confidence: how much do we trust THIS item's Elo?
      const itemConfidence = computeItemConfidence(
        rating.games,
        expectedGamesPerItem,
      );

      // Effective Elo weight for this item = global weight * item confidence
      // If item has 0 games, effectiveEloWeight = 0, so we use pure MAL
      const effectiveEloWeight = globalEloWeight * itemConfidence;
      const effectiveMalWeight = 1 - effectiveEloWeight;

      blendedPercentile =
        effectiveEloWeight * eloPercentile + effectiveMalWeight * malPercentile;
    } else {
      // No MAL score available, use pure Elo
      blendedPercentile = eloPercentile;
    }

    const p = Math.min(1, Math.max(0, blendedPercentile + percentileShift));
    return { animeId, anime, rating, percentile: p };
  });

  // Sort by status tier first, then by blended percentile
  entries.sort((left, right) => {
    const leftTier = statusTier
      ? (statusTier[left.anime.status || ""] ?? 0)
      : 0;
    const rightTier = statusTier
      ? (statusTier[right.anime.status || ""] ?? 0)
      : 0;
    if (leftTier !== rightTier) {
      return rightTier - leftTier;
    }
    return right.percentile - left.percentile;
  });

  // Second pass: build final results with ranks
  return entries.map((entry, index) => ({
    rank: index + 1,
    animeId: entry.animeId,
    title: entry.anime.title,
    status: entry.anime.status,
    myScore: entry.anime.myScore,
    elo: entry.rating.value,
    games: entry.rating.games,
    wins: entry.rating.wins,
    losses: entry.rating.losses,
    ties: entry.rating.ties,
    percentile: entry.percentile,
    score1to10: score10FromPercentile(entry.percentile),
  }));
};

const escapeCsv = (value: string): string => {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const resultsToCsv = (results: AnimeResult[]): string => {
  const header = [
    "rank",
    "anime_id",
    "title",
    "status",
    "my_score",
    "elo",
    "games",
    "wins",
    "losses",
    "ties",
    "percentile",
    "score_1_10",
  ];
  const lines = [header.join(",")];
  results.forEach((r) => {
    const row = [
      r.rank.toString(),
      r.animeId.toString(),
      escapeCsv(r.title),
      escapeCsv(r.status ?? ""),
      r.myScore === null ? "" : r.myScore.toString(),
      r.elo.toFixed(4),
      r.games.toString(),
      r.wins.toString(),
      r.losses.toString(),
      r.ties.toString(),
      r.percentile.toFixed(8),
      r.score1to10.toString(),
    ];
    lines.push(row.join(","));
  });
  return lines.join("\n");
};

export const resultsToJson = (
  metadata: Record<string, unknown>,
  results: AnimeResult[],
): string => {
  return JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      metadata,
      results,
    },
    null,
    2,
  );
};
