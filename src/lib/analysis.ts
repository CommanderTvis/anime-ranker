import { AnimeEntry, NormalFit } from "./types";
import { fitNormal, normalCdf } from "./scoring";

export type MalNormality = {
  scores: number[];
  fit: NormalFit;
  normality: number;
};

export const malScoreSummary = (entries: AnimeEntry[]): MalNormality => {
  const scores = entries
    .map((entry) => entry.myScore)
    .filter((score): score is number => Boolean(score && score > 0));
  const fit = fitNormal(scores);
  if (scores.length < 10) {
    return { scores, fit, normality: 0.5 };
  }
  if (fit.sigma <= 0) {
    return { scores, fit, normality: 0 };
  }

  const total = scores.length;
  const observed = Array.from({ length: 10 }, (_, idx) => {
    const score = idx + 1;
    return scores.filter((s) => s === score).length / total;
  });

  const expected = Array.from({ length: 10 }, (_, idx) => {
    const score = idx + 1;
    const low = score - 0.5;
    const high = score + 0.5;
    return (
      normalCdf((high - fit.mu) / fit.sigma) -
      normalCdf((low - fit.mu) / fit.sigma)
    );
  });

  const l1 = observed.reduce((sum, value, idx) => {
    return sum + Math.abs(value - expected[idx]);
  }, 0);

  return {
    scores,
    fit,
    normality: Math.max(0, Math.min(1, 1 - l1 / 2))
  };
};

export type NormalityLine = {
  x: number;
  user: number;
  ideal: number;
};

export const buildNormalityLine = (
  scores: number[],
  fit: NormalFit
): NormalityLine[] => {
  const xs: number[] = Array.from({ length: 91 }, (_, i) => 1 + i * 0.1);
  const mean =
    scores.length > 0
      ? scores.reduce((sum, value) => sum + value, 0) / scores.length
      : fit.mu;
  let userY: number[] = [];
  if (scores.length) {
    const sigma = fit.sigma;
    let bandwidth = 0.8;
    if (sigma > 0 && scores.length > 1) {
      bandwidth = 1.06 * sigma * scores.length ** -0.2;
    }
    bandwidth = Math.max(0.5, Math.min(1.5, bandwidth));
    const invBw = 1 / (2 * bandwidth * bandwidth);
    userY = xs.map((x) => {
      let total = 0;
      scores.forEach((score) => {
        const d = x - score;
        total += Math.exp(-d * d * invBw);
      });
      return total;
    });
  } else {
    userY = xs.map(() => 0);
  }

  const sigmaChart = fit.sigma > 0 ? fit.sigma : 1;
  const invSig = 1 / (2 * sigmaChart * sigmaChart);
  const idealY = xs.map((x) => Math.exp(-((x - mean) ** 2) * invSig));

  const maxUser = Math.max(...userY, 0);
  const maxIdeal = Math.max(...idealY, 0);
  const scaledUser = maxUser ? userY.map((y) => y / maxUser) : userY;
  const scaledIdeal = maxIdeal ? idealY.map((y) => y / maxIdeal) : idealY;

  return xs.map((x, idx) => ({
    x,
    user: scaledUser[idx],
    ideal: scaledIdeal[idx]
  }));
};
