import { describe, it, expect, vi } from "vitest";
import {
  computeEloWeight,
  buildResults,
  resultsToCsv,
  resultsToJson,
} from "./results";
import { AnimeEntry, EloState, Rating } from "./types";

const createAnimeEntry = (id: number, overrides: Partial<AnimeEntry> = {}): AnimeEntry => ({
  animeId: id,
  title: `Anime ${id}`,
  animeType: "TV",
  episodes: 12,
  watchedEpisodes: 12,
  status: "Completed",
  myScore: 7,
  ...overrides,
});

const createRating = (overrides: Partial<Rating> = {}): Rating => ({
  value: 1500,
  games: 5,
  wins: 2,
  losses: 2,
  ties: 1,
  ...overrides,
});

const createEloState = (ratings: Map<number, Rating>): EloState => ({
  ratings,
  comparisons: 10,
  skips: 0,
  pairHistory: new Set(),
  kFactor: 32,
  initialRating: 1500,
});

describe("computeEloWeight", () => {
  it("returns 0 when completionRatio is 0", () => {
    expect(computeEloWeight(0, 0.5)).toBe(0);
    expect(computeEloWeight(0, 1)).toBe(0);
  });

  it("returns 1 when completionRatio is 1", () => {
    expect(computeEloWeight(1, 0)).toBe(1);
    expect(computeEloWeight(1, 0.5)).toBe(1);
    expect(computeEloWeight(1, 1)).toBe(1);
  });

  it("returns higher weight for higher normality at same completion", () => {
    const lowNormality = computeEloWeight(0.5, 0.2);
    const highNormality = computeEloWeight(0.5, 0.8);

    expect(highNormality).toBeGreaterThan(lowNormality);
  });

  it("weight increases as completion increases", () => {
    const low = computeEloWeight(0.25, 0.5);
    const mid = computeEloWeight(0.5, 0.5);
    const high = computeEloWeight(0.75, 0.5);

    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("clamps completion ratio to [0, 1]", () => {
    expect(computeEloWeight(-0.5, 0.5)).toBe(computeEloWeight(0, 0.5));
    expect(computeEloWeight(1.5, 0.5)).toBe(computeEloWeight(1, 0.5));
  });

  it("clamps normality to [0, 1]", () => {
    expect(computeEloWeight(0.5, -0.5)).toBe(computeEloWeight(0.5, 0));
    expect(computeEloWeight(0.5, 1.5)).toBe(computeEloWeight(0.5, 1));
  });

  it("exponent is 2 when normality is 0", () => {
    // ratio^2
    expect(computeEloWeight(0.5, 0)).toBeCloseTo(0.25, 5);
  });

  it("exponent is 1 when normality is 1", () => {
    // ratio^1
    expect(computeEloWeight(0.5, 1)).toBeCloseTo(0.5, 5);
  });
});

describe("buildResults", () => {
  it("returns results for all anime in elo state", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1)],
      [2, createAnimeEntry(2)],
    ]);
    const ratings = new Map([
      [1, createRating({ value: 1600 })],
      [2, createRating({ value: 1400 })],
    ]);
    const elo = createEloState(ratings);
    const fit = { mu: 1500, sigma: 100 };

    const results = buildResults(animeById, elo, fit);

    expect(results).toHaveLength(2);
  });

  it("ranks by percentile (highest first)", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1)],
      [2, createAnimeEntry(2)],
      [3, createAnimeEntry(3)],
    ]);
    const ratings = new Map([
      [1, createRating({ value: 1400 })],
      [2, createRating({ value: 1600 })],
      [3, createRating({ value: 1500 })],
    ]);
    const elo = createEloState(ratings);
    const fit = { mu: 1500, sigma: 100 };

    const results = buildResults(animeById, elo, fit);

    expect(results[0].animeId).toBe(2); // Highest rating
    expect(results[1].animeId).toBe(3);
    expect(results[2].animeId).toBe(1); // Lowest rating
  });

  it("assigns sequential ranks starting at 1", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1)],
      [2, createAnimeEntry(2)],
    ]);
    const ratings = new Map([
      [1, createRating()],
      [2, createRating()],
    ]);
    const elo = createEloState(ratings);
    const fit = { mu: 1500, sigma: 100 };

    const results = buildResults(animeById, elo, fit);

    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
  });

  it("applies status tier sorting", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1, { status: "Completed" })],
      [2, createAnimeEntry(2, { status: "Dropped" })],
    ]);
    const ratings = new Map([
      [1, createRating({ value: 1400 })], // Lower rating but Completed
      [2, createRating({ value: 1600 })], // Higher rating but Dropped
    ]);
    const elo = createEloState(ratings);
    const fit = { mu: 1500, sigma: 100 };
    const statusTier = { Dropped: -1 };

    const results = buildResults(animeById, elo, fit, statusTier);

    expect(results[0].animeId).toBe(1); // Completed comes first despite lower rating
    expect(results[1].animeId).toBe(2);
  });

  it("applies percentile shift", () => {
    const animeById = new Map([[1, createAnimeEntry(1)]]);
    const ratings = new Map([[1, createRating({ value: 1500 })]]);
    const elo = createEloState(ratings);
    const fit = { mu: 1500, sigma: 100 };

    const resultsNoShift = buildResults(animeById, elo, fit, undefined, 0);
    const resultsWithShift = buildResults(animeById, elo, fit, undefined, 0.2);

    expect(resultsWithShift[0].percentile).toBeGreaterThan(
      resultsNoShift[0].percentile
    );
  });

  it("includes all result fields", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1, { title: "Test Anime", status: "Completed", myScore: 8 })],
    ]);
    const ratings = new Map([
      [1, createRating({ value: 1550, games: 10, wins: 6, losses: 3, ties: 1 })],
    ]);
    const elo = createEloState(ratings);
    const fit = { mu: 1500, sigma: 100 };

    const results = buildResults(animeById, elo, fit);

    expect(results[0]).toMatchObject({
      rank: 1,
      animeId: 1,
      title: "Test Anime",
      status: "Completed",
      myScore: 8,
      elo: 1550,
      games: 10,
      wins: 6,
      losses: 3,
      ties: 1,
    });
    expect(results[0].percentile).toBeGreaterThan(0);
    expect(results[0].score1to10).toBeGreaterThanOrEqual(1);
    expect(results[0].score1to10).toBeLessThanOrEqual(10);
  });

  it("blends MAL and Elo scores when blending params provided", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1, { myScore: 10 })], // High MAL score
    ]);
    const ratings = new Map([
      [1, createRating({ value: 1300, games: 1 })], // Low Elo, few games
    ]);
    const elo = createEloState(ratings);
    const fit = { mu: 1500, sigma: 100 };
    const malFit = { mu: 7, sigma: 1.5 };

    // Without blending - pure Elo
    const resultsNoBlend = buildResults(animeById, elo, fit);

    // With blending - should pull toward MAL score
    const resultsBlend = buildResults(animeById, elo, fit, undefined, 0, {
      malNormality: 0.5,
      completionRatio: 0.1, // Low completion = trust MAL more
      malFit,
      totalComparisons: 10,
      itemCount: 10,
    });

    expect(resultsBlend[0].percentile).toBeGreaterThan(resultsNoBlend[0].percentile);
  });
});

describe("resultsToCsv", () => {
  it("includes header row", () => {
    const results = buildResults(
      new Map([[1, createAnimeEntry(1)]]),
      createEloState(new Map([[1, createRating()]])),
      { mu: 1500, sigma: 100 }
    );

    const csv = resultsToCsv(results);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      "rank,anime_id,title,status,my_score,elo,games,wins,losses,ties,percentile,score_1_10"
    );
  });

  it("escapes titles with commas", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1, { title: "Hello, World" })],
    ]);
    const results = buildResults(
      animeById,
      createEloState(new Map([[1, createRating()]])),
      { mu: 1500, sigma: 100 }
    );

    const csv = resultsToCsv(results);

    expect(csv).toContain('"Hello, World"');
  });

  it("escapes titles with quotes", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1, { title: 'Say "Hello"' })],
    ]);
    const results = buildResults(
      animeById,
      createEloState(new Map([[1, createRating()]])),
      { mu: 1500, sigma: 100 }
    );

    const csv = resultsToCsv(results);

    expect(csv).toContain('"Say ""Hello"""');
  });

  it("handles null myScore", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1, { myScore: null })],
    ]);
    const results = buildResults(
      animeById,
      createEloState(new Map([[1, createRating()]])),
      { mu: 1500, sigma: 100 }
    );

    const csv = resultsToCsv(results);
    const lines = csv.split("\n");
    const dataLine = lines[1].split(",");

    // my_score column (index 4) should be empty
    expect(dataLine[4]).toBe("");
  });

  it("handles null status", () => {
    const animeById = new Map([
      [1, createAnimeEntry(1, { status: null })],
    ]);
    const results = buildResults(
      animeById,
      createEloState(new Map([[1, createRating()]])),
      { mu: 1500, sigma: 100 }
    );

    const csv = resultsToCsv(results);

    // Should not throw and should produce valid CSV
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("formats elo with 4 decimal places", () => {
    const results = buildResults(
      new Map([[1, createAnimeEntry(1)]]),
      createEloState(new Map([[1, createRating({ value: 1500.123456789 })]])),
      { mu: 1500, sigma: 100 }
    );

    const csv = resultsToCsv(results);

    expect(csv).toContain("1500.1235");
  });
});

describe("resultsToJson", () => {
  it("includes generated_at timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    const json = resultsToJson({}, []);
    const parsed = JSON.parse(json);

    expect(parsed.generated_at).toBe("2024-01-15T12:00:00.000Z");

    vi.useRealTimers();
  });

  it("includes metadata", () => {
    const metadata = { userName: "test", comparisons: 100 };
    const json = resultsToJson(metadata, []);
    const parsed = JSON.parse(json);

    expect(parsed.metadata).toEqual(metadata);
  });

  it("includes results array", () => {
    const results = buildResults(
      new Map([[1, createAnimeEntry(1)]]),
      createEloState(new Map([[1, createRating()]])),
      { mu: 1500, sigma: 100 }
    );

    const json = resultsToJson({}, results);
    const parsed = JSON.parse(json);

    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].animeId).toBe(1);
  });

  it("produces valid JSON", () => {
    const results = buildResults(
      new Map([[1, createAnimeEntry(1, { title: 'Test "Anime"' })]]),
      createEloState(new Map([[1, createRating()]])),
      { mu: 1500, sigma: 100 }
    );

    const json = resultsToJson({ test: true }, results);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("pretty prints with 2-space indentation", () => {
    const json = resultsToJson({}, []);

    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });
});
