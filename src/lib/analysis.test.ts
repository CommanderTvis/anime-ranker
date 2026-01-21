import { describe, it, expect } from "vitest";
import { malScoreSummary, buildNormalityLine } from "./analysis";
import { AnimeEntry } from "./types";

const createEntry = (myScore: number | null): AnimeEntry => ({
  animeId: Math.random() * 10000,
  title: "Test",
  animeType: "TV",
  episodes: 12,
  watchedEpisodes: 12,
  status: "Completed",
  myScore,
});

describe("malScoreSummary", () => {
  it("returns 0.5 normality for empty array", () => {
    const result = malScoreSummary([]);
    expect(result.normality).toBe(0.5);
    expect(result.scores).toHaveLength(0);
  });

  it("returns 0.5 normality for fewer than 10 scores", () => {
    const entries = Array.from({ length: 9 }, (_, i) => createEntry(i + 1));
    const result = malScoreSummary(entries);
    expect(result.normality).toBe(0.5);
  });

  it("filters out null and zero scores", () => {
    const entries = [
      createEntry(null),
      createEntry(0),
      createEntry(5),
      createEntry(7),
    ];
    const result = malScoreSummary(entries);
    expect(result.scores).toHaveLength(2);
    expect(result.scores).toContain(5);
    expect(result.scores).toContain(7);
  });

  it("calculates fit for valid scores", () => {
    const entries = Array.from({ length: 20 }, () => createEntry(7));
    const result = malScoreSummary(entries);
    expect(result.fit.mu).toBe(7);
    expect(result.fit.sigma).toBe(0);
  });

  it("returns 0 normality when all scores are same (sigma=0)", () => {
    const entries = Array.from({ length: 20 }, () => createEntry(5));
    const result = malScoreSummary(entries);
    expect(result.normality).toBe(0);
  });

  it("returns high normality for normally distributed scores", () => {
    // Create scores that roughly follow normal distribution
    const scores = [5, 5, 6, 6, 6, 7, 7, 7, 7, 7, 8, 8, 8, 9, 9];
    const entries = scores.map((s) => createEntry(s));
    const result = malScoreSummary(entries);

    // Should have reasonably high normality
    expect(result.normality).toBeGreaterThan(0.3);
    expect(result.normality).toBeLessThanOrEqual(1);
  });

  it("returns lower normality for skewed distributions", () => {
    // All 10s - very skewed
    const entries = Array.from({ length: 15 }, () => createEntry(10));
    // Add a few other scores to avoid sigma=0
    entries.push(createEntry(9), createEntry(9), createEntry(8));

    const result = malScoreSummary(entries);
    expect(result.normality).toBeLessThan(0.8);
  });

  it("normality is between 0 and 1", () => {
    const testCases = [
      Array.from({ length: 50 }, (_, i) => createEntry((i % 10) + 1)),
      Array.from({ length: 30 }, () => createEntry(Math.ceil(Math.random() * 10))),
    ];

    for (const entries of testCases) {
      const result = malScoreSummary(entries);
      expect(result.normality).toBeGreaterThanOrEqual(0);
      expect(result.normality).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildNormalityLine", () => {
  it("returns 91 data points", () => {
    const scores = [5, 6, 7, 8];
    const fit = { mu: 6.5, sigma: 1 };
    const result = buildNormalityLine(scores, fit);
    expect(result).toHaveLength(91);
  });

  it("x values range from 1 to 10", () => {
    const scores = [5, 6, 7];
    const fit = { mu: 6, sigma: 1 };
    const result = buildNormalityLine(scores, fit);

    expect(result[0].x).toBe(1);
    expect(result[result.length - 1].x).toBe(10);
  });

  it("x values increment by 0.1", () => {
    const scores = [5];
    const fit = { mu: 5, sigma: 1 };
    const result = buildNormalityLine(scores, fit);

    expect(result[1].x - result[0].x).toBeCloseTo(0.1, 5);
  });

  it("user and ideal values are normalized to [0, 1]", () => {
    const scores = [4, 5, 6, 7, 8];
    const fit = { mu: 6, sigma: 1.5 };
    const result = buildNormalityLine(scores, fit);

    for (const point of result) {
      expect(point.user).toBeGreaterThanOrEqual(0);
      expect(point.user).toBeLessThanOrEqual(1);
      expect(point.ideal).toBeGreaterThanOrEqual(0);
      expect(point.ideal).toBeLessThanOrEqual(1);
    }
  });

  it("ideal curve peaks at mean", () => {
    const scores = [5, 6, 7];
    const fit = { mu: 6, sigma: 1 };
    const result = buildNormalityLine(scores, fit);

    // Find point closest to mean
    const atMean = result.find((p) => Math.abs(p.x - 6) < 0.05);
    expect(atMean?.ideal).toBeCloseTo(1, 1); // Peak should be ~1 (normalized)
  });

  it("handles empty scores array", () => {
    const scores: number[] = [];
    const fit = { mu: 5, sigma: 1 };
    const result = buildNormalityLine(scores, fit);

    expect(result).toHaveLength(91);
    for (const point of result) {
      expect(point.user).toBe(0);
    }
  });

  it("handles sigma = 0", () => {
    const scores = [5, 5, 5];
    const fit = { mu: 5, sigma: 0 };
    const result = buildNormalityLine(scores, fit);

    expect(result).toHaveLength(91);
    // Should still produce valid output
    for (const point of result) {
      expect(Number.isFinite(point.user)).toBe(true);
      expect(Number.isFinite(point.ideal)).toBe(true);
    }
  });

  it("user curve reflects actual score distribution", () => {
    const scores = [3, 3, 3, 3, 3]; // All scores at 3
    const fit = { mu: 3, sigma: 1 };
    const result = buildNormalityLine(scores, fit);

    // User curve should peak near x=3
    const at3 = result.find((p) => Math.abs(p.x - 3) < 0.05);
    const at7 = result.find((p) => Math.abs(p.x - 7) < 0.05);

    expect(at3!.user).toBeGreaterThan(at7!.user);
  });
});
