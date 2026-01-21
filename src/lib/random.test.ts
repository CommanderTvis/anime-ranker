import { describe, it, expect } from "vitest";
import { createRng, weightedChoice } from "./random";

describe("createRng", () => {
  it("produces values between 0 and 1", () => {
    const rng = createRng(12345);

    for (let i = 0; i < 100; i++) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("produces deterministic sequence for same seed", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);

    for (let i = 0; i < 10; i++) {
      expect(rng1.nextFloat()).toBe(rng2.nextFloat());
    }
  });

  it("produces different sequences for different seeds", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(43);

    const seq1 = Array.from({ length: 10 }, () => rng1.nextFloat());
    const seq2 = Array.from({ length: 10 }, () => rng2.nextFloat());

    expect(seq1).not.toEqual(seq2);
  });

  it("handles zero seed", () => {
    const rng = createRng(0);
    const value = rng.nextFloat();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("handles negative seed", () => {
    const rng = createRng(-42);
    const value = rng.nextFloat();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("handles very large seed", () => {
    const rng = createRng(9999999999);
    const value = rng.nextFloat();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("produces reasonably uniform distribution", () => {
    const rng = createRng(12345);
    const buckets = Array.from({ length: 10 }, () => 0);
    const n = 10000;

    for (let i = 0; i < n; i++) {
      const value = rng.nextFloat();
      const bucket = Math.min(9, Math.floor(value * 10));
      buckets[bucket]++;
    }

    // Each bucket should have roughly 1000 values (10%)
    // Allow 20% deviation
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });
});

describe("weightedChoice", () => {
  it("returns an item from the array", () => {
    const items = ["a", "b", "c"];
    const weights = [1, 1, 1];
    const rng = createRng(42);

    const result = weightedChoice(items, weights, rng);
    expect(items).toContain(result);
  });

  it("respects weights", () => {
    const items = ["rare", "common"];
    const weights = [1, 99];

    const counts = { rare: 0, common: 0 };
    const rng = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      const result = weightedChoice(items, weights, rng);
      counts[result as keyof typeof counts]++;
    }

    // "common" should be selected much more often (99% expected)
    expect(counts.common).toBeGreaterThan(counts.rare * 10);
  });

  it("handles single item", () => {
    const items = ["only"];
    const weights = [1];
    const rng = createRng(42);

    expect(weightedChoice(items, weights, rng)).toBe("only");
  });

  it("handles zero weights by falling back to uniform", () => {
    const items = ["a", "b", "c"];
    const weights = [0, 0, 0];
    const rng = createRng(42);

    // Should still return something
    const result = weightedChoice(items, weights, rng);
    expect(items).toContain(result);
  });

  it("handles negative total weight by falling back to uniform", () => {
    const items = ["a", "b"];
    const weights = [-5, -5];
    const rng = createRng(42);

    const result = weightedChoice(items, weights, rng);
    expect(items).toContain(result);
  });

  it("with weight of 0 for one item, never selects it", () => {
    const items = ["never", "always"];
    const weights = [0, 1];

    for (let i = 0; i < 100; i++) {
      const rng = createRng(i);
      expect(weightedChoice(items, weights, rng)).toBe("always");
    }
  });

  it("returns last item as fallback", () => {
    const items = ["a", "b", "c"];
    const weights = [1, 1, 1];

    // Create rng that returns exactly 1.0 (edge case)
    const mockRng = {
      nextFloat: () => 0.9999999999,
    };

    const result = weightedChoice(items, weights, mockRng);
    expect(items).toContain(result);
  });

  it("handles numbers as items", () => {
    const items = [1, 2, 3];
    const weights = [1, 2, 3];
    const rng = createRng(42);

    const result = weightedChoice(items, weights, rng);
    expect(items).toContain(result);
  });

  it("handles objects as items", () => {
    const items = [{ id: 1 }, { id: 2 }];
    const weights = [1, 1];
    const rng = createRng(42);

    const result = weightedChoice(items, weights, rng);
    expect(items).toContain(result);
  });

  it("is deterministic with same rng", () => {
    const items = ["a", "b", "c", "d", "e"];
    const weights = [1, 2, 3, 4, 5];

    const results1: string[] = [];
    const results2: string[] = [];

    for (let i = 0; i < 10; i++) {
      results1.push(weightedChoice(items, weights, createRng(i)));
      results2.push(weightedChoice(items, weights, createRng(i)));
    }

    expect(results1).toEqual(results2);
  });
});
