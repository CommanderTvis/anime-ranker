import { describe, it, expect } from "vitest";
import { createEloState, expectedScore, recordOutcome, selectPair } from "./elo";
import { createRng } from "./random";

describe("createEloState", () => {
  it("initializes ratings for all anime IDs", () => {
    const state = createEloState([1, 2, 3], 32);

    expect(state.ratings.size).toBe(3);
    expect(state.ratings.has(1)).toBe(true);
    expect(state.ratings.has(2)).toBe(true);
    expect(state.ratings.has(3)).toBe(true);
  });

  it("sets default initial rating to 1500", () => {
    const state = createEloState([1, 2], 32);

    expect(state.ratings.get(1)?.value).toBe(1500);
    expect(state.ratings.get(2)?.value).toBe(1500);
  });

  it("allows custom initial rating", () => {
    const state = createEloState([1, 2], 32, 2000);

    expect(state.ratings.get(1)?.value).toBe(2000);
    expect(state.initialRating).toBe(2000);
  });

  it("initializes game stats to zero", () => {
    const state = createEloState([1], 32);
    const rating = state.ratings.get(1)!;

    expect(rating.games).toBe(0);
    expect(rating.wins).toBe(0);
    expect(rating.losses).toBe(0);
    expect(rating.ties).toBe(0);
  });

  it("stores kFactor", () => {
    const state = createEloState([1], 64);

    expect(state.kFactor).toBe(64);
  });

  it("initializes empty pair history", () => {
    const state = createEloState([1, 2], 32);

    expect(state.pairHistory.size).toBe(0);
    expect(state.comparisons).toBe(0);
    expect(state.skips).toBe(0);
  });
});

describe("expectedScore", () => {
  it("returns 0.5 for equal ratings", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
  });

  it("returns higher expected score for higher-rated player", () => {
    const result = expectedScore(1600, 1400);
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeCloseTo(0.76, 1);
  });

  it("returns lower expected score for lower-rated player", () => {
    const result = expectedScore(1400, 1600);
    expect(result).toBeLessThan(0.5);
    expect(result).toBeCloseTo(0.24, 1);
  });

  it("is symmetric", () => {
    const scoreA = expectedScore(1600, 1400);
    const scoreB = expectedScore(1400, 1600);
    expect(scoreA + scoreB).toBeCloseTo(1);
  });

  it("returns ~0.91 for 400 point difference", () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 2);
  });
});

describe("recordOutcome", () => {
  it("throws if aId equals bId", () => {
    const state = createEloState([1], 32);
    expect(() => recordOutcome(state, 1, 1, 1)).toThrow("aId and bId must be different");
  });

  it("throws for invalid outcome values", () => {
    const state = createEloState([1, 2], 32);
    expect(() => recordOutcome(state, 1, 2, 0.3)).toThrow("outcomeForA must be 0, 0.5, or 1");
    expect(() => recordOutcome(state, 1, 2, 2)).toThrow("outcomeForA must be 0, 0.5, or 1");
  });

  it("updates ratings when A wins (outcome=1)", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 1);

    expect(newState.ratings.get(1)!.value).toBeGreaterThan(1500);
    expect(newState.ratings.get(2)!.value).toBeLessThan(1500);
  });

  it("updates ratings when A loses (outcome=0)", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 0);

    expect(newState.ratings.get(1)!.value).toBeLessThan(1500);
    expect(newState.ratings.get(2)!.value).toBeGreaterThan(1500);
  });

  it("minimal rating change on tie (outcome=0.5)", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 0.5);

    // With equal ratings, expected is 0.5, so tie should barely change ratings
    expect(newState.ratings.get(1)!.value).toBeCloseTo(1500, 0);
    expect(newState.ratings.get(2)!.value).toBeCloseTo(1500, 0);
  });

  it("increments game counts", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 1);

    expect(newState.ratings.get(1)!.games).toBe(1);
    expect(newState.ratings.get(2)!.games).toBe(1);
  });

  it("tracks wins and losses correctly", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 1);

    expect(newState.ratings.get(1)!.wins).toBe(1);
    expect(newState.ratings.get(1)!.losses).toBe(0);
    expect(newState.ratings.get(2)!.wins).toBe(0);
    expect(newState.ratings.get(2)!.losses).toBe(1);
  });

  it("tracks ties correctly", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 0.5);

    expect(newState.ratings.get(1)!.ties).toBe(1);
    expect(newState.ratings.get(2)!.ties).toBe(1);
  });

  it("adds pair to history", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 1);

    expect(newState.pairHistory.has("1-2")).toBe(true);
  });

  it("normalizes pair key order", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 2, 1, 1);

    expect(newState.pairHistory.has("1-2")).toBe(true);
    expect(newState.pairHistory.has("2-1")).toBe(false);
  });

  it("increments comparison count", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 1);

    expect(newState.comparisons).toBe(1);
  });

  it("returns new state without mutating original", () => {
    const state = createEloState([1, 2], 32);
    const newState = recordOutcome(state, 1, 2, 1);

    expect(state.ratings.get(1)!.value).toBe(1500);
    expect(newState.ratings.get(1)!.value).not.toBe(1500);
    expect(state.comparisons).toBe(0);
    expect(newState.comparisons).toBe(1);
  });

  it("applies kFactor correctly", () => {
    const stateK32 = createEloState([1, 2], 32);
    const stateK64 = createEloState([1, 2], 64);

    const resultK32 = recordOutcome(stateK32, 1, 2, 1);
    const resultK64 = recordOutcome(stateK64, 1, 2, 1);

    const changeK32 = resultK32.ratings.get(1)!.value - 1500;
    const changeK64 = resultK64.ratings.get(1)!.value - 1500;

    expect(changeK64).toBeCloseTo(changeK32 * 2, 0);
  });
});

describe("selectPair", () => {
  it("throws if fewer than 2 anime", () => {
    const state = createEloState([1], 32);
    const rng = createRng(42);

    expect(() => selectPair(state, [1], { rng })).toThrow("Need at least 2 anime to compare");
    expect(() => selectPair(state, [], { rng })).toThrow("Need at least 2 anime to compare");
  });

  it("returns two different IDs", () => {
    const state = createEloState([1, 2, 3, 4, 5], 32);
    const rng = createRng(42);

    const [a, b] = selectPair(state, [1, 2, 3, 4, 5], { rng });

    expect(a).not.toBe(b);
    expect([1, 2, 3, 4, 5]).toContain(a);
    expect([1, 2, 3, 4, 5]).toContain(b);
  });

  it("returns deterministic results with same seed", () => {
    const state = createEloState([1, 2, 3, 4, 5], 32);

    const result1 = selectPair(state, [1, 2, 3, 4, 5], { rng: createRng(42) });
    const result2 = selectPair(state, [1, 2, 3, 4, 5], { rng: createRng(42) });

    expect(result1).toEqual(result2);
  });

  it("avoids repeated pairs when avoidRepeats is true", () => {
    let state = createEloState([1, 2], 32);
    // Mark the only possible pair as used
    state = { ...state, pairHistory: new Set(["1-2"]) };

    const rng = createRng(42);
    // With only 2 items and pair already used, should fall back to random
    const [a, b] = selectPair(state, [1, 2], { rng, avoidRepeats: true });

    expect([a, b].sort()).toEqual([1, 2]);
  });

  it("allows repeated pairs when avoidRepeats is false", () => {
    let state = createEloState([1, 2, 3], 32);
    state = { ...state, pairHistory: new Set(["1-2", "1-3", "2-3"]) };

    const rng = createRng(42);
    // Should still return a pair even though all are in history
    const [a, b] = selectPair(state, [1, 2, 3], { rng, avoidRepeats: false });

    expect(a).not.toBe(b);
  });

  it("prefers anime with fewer games", () => {
    let state = createEloState([1, 2, 3, 4, 5], 32);
    // Give anime 1 many games, anime 2 zero games
    const r1 = state.ratings.get(1)!;
    state.ratings.set(1, { ...r1, games: 100 });

    const selections = new Map<number, number>();
    const rng = createRng(42);
    for (let i = 0; i < 500; i++) {
      const [a] = selectPair(state, [1, 2, 3, 4, 5], { rng, avoidRepeats: false });
      selections.set(a, (selections.get(a) ?? 0) + 1);
    }

    // Anime with fewer games should have higher selection weight
    // Weight = 1 / (1 + games), so anime 1 weight ≈ 0.01, others ≈ 1
    const anime1Count = selections.get(1) ?? 0;
    const totalOthers = [2, 3, 4, 5].reduce(
      (sum, id) => sum + (selections.get(id) ?? 0),
      0
    );

    // Anime 1 should be selected much less than the average of others
    expect(anime1Count).toBeLessThan(totalOthers / 4);
  });

  it("handles priorityById boost", () => {
    const state = createEloState([1, 2, 3, 4, 5], 32);
    const priorityById = new Map([[3, 10]]); // High boost for anime 3

    const selections = new Map<number, number>();
    const rng = createRng(42);
    for (let i = 0; i < 500; i++) {
      const [a] = selectPair(state, [1, 2, 3, 4, 5], {
        rng,
        avoidRepeats: false,
        priorityById,
        priorityBoost: 10,
      });
      selections.set(a, (selections.get(a) ?? 0) + 1);
    }

    // Anime 3 should be selected noticeably more often
    const anime3Count = selections.get(3) ?? 0;
    const anime1Count = selections.get(1) ?? 0;
    // With boost, anime 3 weight = 1 * (1 + 10*10) = 101, others = 1
    expect(anime3Count).toBeGreaterThan(anime1Count);
  });
});
