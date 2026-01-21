import { describe, it, expect } from "vitest";
import {
  fitNormal,
  normalCdf,
  percentile,
  score10FromPercentile,
  score10FromValue,
} from "./scoring";

describe("fitNormal", () => {
  it("returns zero mu and sigma for empty array", () => {
    const result = fitNormal([]);
    expect(result.mu).toBe(0);
    expect(result.sigma).toBe(0);
  });

  it("returns correct mu and zero sigma for single value", () => {
    const result = fitNormal([5]);
    expect(result.mu).toBe(5);
    expect(result.sigma).toBe(0);
  });

  it("calculates mean correctly", () => {
    const result = fitNormal([2, 4, 6, 8, 10]);
    expect(result.mu).toBe(6);
  });

  it("calculates standard deviation correctly", () => {
    // For [1, 2, 3, 4, 5]: mean = 3, variance = 2, sigma ≈ 1.414
    const result = fitNormal([1, 2, 3, 4, 5]);
    expect(result.mu).toBe(3);
    expect(result.sigma).toBeCloseTo(Math.sqrt(2), 5);
  });

  it("handles negative values", () => {
    const result = fitNormal([-10, 0, 10]);
    expect(result.mu).toBe(0);
  });

  it("handles large numbers", () => {
    const result = fitNormal([1500, 1500, 1500]);
    expect(result.mu).toBe(1500);
    expect(result.sigma).toBe(0);
  });

  it("calculates population standard deviation (not sample)", () => {
    // Sample std would divide by n-1, population by n
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const result = fitNormal(values);
    // Mean = 5, population variance = 4, sigma = 2
    expect(result.mu).toBe(5);
    expect(result.sigma).toBe(2);
  });
});

describe("normalCdf", () => {
  it("returns 0.5 at z=0", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
  });

  it("returns ~0.8413 at z=1", () => {
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
  });

  it("returns ~0.1587 at z=-1", () => {
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it("returns ~0.9772 at z=2", () => {
    expect(normalCdf(2)).toBeCloseTo(0.9772, 3);
  });

  it("returns ~0.0228 at z=-2", () => {
    expect(normalCdf(-2)).toBeCloseTo(0.0228, 3);
  });

  it("approaches 1 for large positive z", () => {
    expect(normalCdf(5)).toBeGreaterThan(0.999);
  });

  it("approaches 0 for large negative z", () => {
    expect(normalCdf(-5)).toBeLessThan(0.001);
  });

  it("is symmetric around 0.5", () => {
    expect(normalCdf(1) + normalCdf(-1)).toBeCloseTo(1, 5);
    expect(normalCdf(2) + normalCdf(-2)).toBeCloseTo(1, 5);
  });
});

describe("percentile", () => {
  it("returns 0.5 for value at mean", () => {
    const fit = { mu: 1500, sigma: 100 };
    expect(percentile(1500, fit)).toBeCloseTo(0.5, 5);
  });

  it("returns higher percentile for value above mean", () => {
    const fit = { mu: 1500, sigma: 100 };
    expect(percentile(1600, fit)).toBeGreaterThan(0.5);
  });

  it("returns lower percentile for value below mean", () => {
    const fit = { mu: 1500, sigma: 100 };
    expect(percentile(1400, fit)).toBeLessThan(0.5);
  });

  it("returns 0.5 when sigma is zero", () => {
    const fit = { mu: 1500, sigma: 0 };
    expect(percentile(1600, fit)).toBe(0.5);
    expect(percentile(1400, fit)).toBe(0.5);
  });

  it("returns 0.5 when sigma is negative", () => {
    const fit = { mu: 1500, sigma: -100 };
    expect(percentile(1600, fit)).toBe(0.5);
  });

  it("clamps result to [0, 1]", () => {
    const fit = { mu: 1500, sigma: 10 };
    expect(percentile(2000, fit)).toBeLessThanOrEqual(1);
    expect(percentile(1000, fit)).toBeGreaterThanOrEqual(0);
  });

  it("returns ~0.84 for value at mu + sigma", () => {
    const fit = { mu: 1500, sigma: 100 };
    expect(percentile(1600, fit)).toBeCloseTo(0.8413, 2);
  });

  it("returns ~0.16 for value at mu - sigma", () => {
    const fit = { mu: 1500, sigma: 100 };
    expect(percentile(1400, fit)).toBeCloseTo(0.1587, 2);
  });
});

describe("score10FromPercentile", () => {
  it("returns 1 for percentile 0", () => {
    expect(score10FromPercentile(0)).toBe(1);
  });

  it("returns 1 for negative percentile", () => {
    expect(score10FromPercentile(-0.1)).toBe(1);
  });

  it("returns 10 for percentile 1", () => {
    expect(score10FromPercentile(1)).toBe(10);
  });

  it("returns 10 for percentile > 1", () => {
    expect(score10FromPercentile(1.5)).toBe(10);
  });

  it("maps percentiles to correct deciles", () => {
    expect(score10FromPercentile(0.05)).toBe(1);
    expect(score10FromPercentile(0.15)).toBe(2);
    expect(score10FromPercentile(0.25)).toBe(3);
    expect(score10FromPercentile(0.35)).toBe(4);
    expect(score10FromPercentile(0.45)).toBe(5);
    expect(score10FromPercentile(0.55)).toBe(6);
    expect(score10FromPercentile(0.65)).toBe(7);
    expect(score10FromPercentile(0.75)).toBe(8);
    expect(score10FromPercentile(0.85)).toBe(9);
    expect(score10FromPercentile(0.95)).toBe(10);
  });

  it("uses ceiling for bucket boundaries", () => {
    expect(score10FromPercentile(0.1)).toBe(1);
    expect(score10FromPercentile(0.11)).toBe(2);
    expect(score10FromPercentile(0.2)).toBe(2);
    expect(score10FromPercentile(0.21)).toBe(3);
  });

  it("returns 5 or 6 for middle percentiles", () => {
    expect(score10FromPercentile(0.5)).toBe(5);
    expect(score10FromPercentile(0.51)).toBe(6);
  });
});

describe("score10FromValue", () => {
  it("combines percentile and score conversion", () => {
    const fit = { mu: 1500, sigma: 100 };

    // Value at mean has percentile ~0.5, which maps to score 5 or 6
    // (ceil(0.5*10) = 5, but floating point may cause slight variation)
    const meanScore = score10FromValue(1500, fit);
    expect(meanScore).toBeGreaterThanOrEqual(5);
    expect(meanScore).toBeLessThanOrEqual(6);

    // Value well above mean should be high
    expect(score10FromValue(1700, fit)).toBeGreaterThanOrEqual(9);

    // Value well below mean should be low
    expect(score10FromValue(1300, fit)).toBeLessThanOrEqual(2);
  });

  it("returns 5 when sigma is zero", () => {
    const fit = { mu: 1500, sigma: 0 };
    expect(score10FromValue(1600, fit)).toBe(5);
    expect(score10FromValue(1400, fit)).toBe(5);
  });
});
