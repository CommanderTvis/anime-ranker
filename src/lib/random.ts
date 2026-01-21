export type Rng = {
  nextFloat: () => number;
};

export const createRng = (seed: number): Rng => {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return {
    nextFloat: () => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    }
  };
};

export const weightedChoice = <T>(items: T[], weights: number[], rng: Rng): T => {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    const idx = Math.floor(rng.nextFloat() * items.length);
    return items[Math.max(0, Math.min(items.length - 1, idx))];
  }
  const target = rng.nextFloat() * total;
  let running = 0;
  for (let i = 0; i < items.length; i += 1) {
    running += weights[i];
    if (target <= running) {
      return items[i];
    }
  }
  return items[items.length - 1];
};
