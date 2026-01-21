import { EloState, Rating } from "./types";
import { Rng, weightedChoice } from "./random";

const pairKey = (aId: number, bId: number): string => {
  return aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
};

export const createEloState = (
  animeIds: number[],
  kFactor: number,
  initialRating = 1500,
): EloState => {
  const ratings = new Map<number, Rating>();
  animeIds.forEach((id) => {
    ratings.set(id, {
      value: initialRating,
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
    });
  });
  return {
    ratings,
    comparisons: 0,
    skips: 0,
    pairHistory: new Set<string>(),
    kFactor,
    initialRating,
  };
};

export const expectedScore = (ratingA: number, ratingB: number): number => {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
};

export const recordOutcome = (
  elo: EloState,
  aId: number,
  bId: number,
  outcomeForA: number,
): EloState => {
  if (aId === bId) {
    throw new Error("aId and bId must be different");
  }
  if (![0, 0.5, 1].includes(outcomeForA)) {
    throw new Error("outcomeForA must be 0, 0.5, or 1");
  }

  const ratings = new Map(elo.ratings);
  const ra = { ...(ratings.get(aId) as Rating) };
  const rb = { ...(ratings.get(bId) as Rating) };

  const expectedA = expectedScore(ra.value, rb.value);
  const expectedB = 1 - expectedA;

  const k = elo.kFactor;
  ra.value += k * (outcomeForA - expectedA);
  rb.value += k * (1 - outcomeForA - expectedB);

  ra.games += 1;
  rb.games += 1;
  if (outcomeForA === 1) {
    ra.wins += 1;
    rb.losses += 1;
  } else if (outcomeForA === 0) {
    ra.losses += 1;
    rb.wins += 1;
  } else {
    ra.ties += 1;
    rb.ties += 1;
  }

  ratings.set(aId, ra);
  ratings.set(bId, rb);

  const pairHistory = new Set(elo.pairHistory);
  pairHistory.add(pairKey(aId, bId));

  return {
    ...elo,
    ratings,
    pairHistory,
    comparisons: elo.comparisons + 1,
  };
};

const ratingFor = (elo: EloState, animeId: number): Rating => {
  return elo.ratings.get(animeId) as Rating;
};

export type SelectPairOptions = {
  rng: Rng;
  avoidRepeats?: boolean;
  maxAttempts?: number;
  priorityById?: Map<number, number>;
  priorityBoost?: number;
  scoreById?: Map<number, number | null>;
  sameScoreBoost?: number;
};

export const selectPair = (
  elo: EloState,
  animeIds: number[],
  options: SelectPairOptions,
): [number, number] => {
  if (animeIds.length < 2) {
    throw new Error("Need at least 2 anime to compare");
  }

  const {
    rng,
    avoidRepeats = true,
    maxAttempts = 200,
    priorityById,
    priorityBoost = 0,
    scoreById,
    sameScoreBoost = 0,
  } = options;

  const weight = (animeId: number): number => {
    const base = 1 / (1 + ratingFor(elo, animeId).games);
    if (!priorityById || priorityBoost <= 0) {
      return base;
    }
    const priority = priorityById.get(animeId) ?? 0;
    return base * (1 + priorityBoost * priority);
  };

  const allWeights = animeIds.map((id) => weight(id));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const aId = weightedChoice(animeIds, allWeights, rng);
    const aRating = ratingFor(elo, aId).value;

    const candidates = animeIds
      .filter((id) => id !== aId)
      .sort(
        (left, right) =>
          Math.abs(ratingFor(elo, left).value - aRating) -
          Math.abs(ratingFor(elo, right).value - aRating),
      )
      .slice(0, Math.min(60, animeIds.length - 1));

    const scoreA = scoreById ? scoreById.get(aId) : null;
    const candWeights = candidates.map((id) => {
      const diff = Math.abs(ratingFor(elo, id).value - aRating);
      const closeness = 1 / (1 + diff / 100);
      let candWeight = closeness * weight(id);
      if (
        scoreById &&
        scoreA !== null &&
        scoreA !== undefined &&
        scoreA === scoreById.get(id)
      ) {
        const priority = priorityById?.get(aId) ?? 0;
        candWeight *= 1 + sameScoreBoost * priority;
      }
      return candWeight;
    });

    const bId = weightedChoice(candidates, candWeights, rng);
    const key = pairKey(aId, bId);
    if (avoidRepeats && elo.pairHistory.has(key)) {
      continue;
    }
    return [aId, bId];
  }

  const firstIndex = Math.floor(rng.nextFloat() * animeIds.length);
  let secondIndex = Math.floor(rng.nextFloat() * (animeIds.length - 1));
  if (secondIndex >= firstIndex) {
    secondIndex += 1;
  }
  return [animeIds[firstIndex], animeIds[secondIndex]];
};
