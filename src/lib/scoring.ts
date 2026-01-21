import { NormalFit } from "./types";

const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const poly =
    (((a5 * t + a4) * t + a3) * t + a2) * t + a1;
  const y = 1 - poly * t * Math.exp(-absX * absX);
  return sign * y;
};

export const fitNormal = (values: number[]): NormalFit => {
  if (!values.length) {
    return { mu: 0, sigma: 0 };
  }
  const mu = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (values.length <= 1) {
    return { mu, sigma: 0 };
  }
  const variance =
    values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / values.length;
  return { mu, sigma: Math.sqrt(variance) };
};

export const normalCdf = (z: number): number => {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
};

export const percentile = (value: number, fit: NormalFit): number => {
  if (fit.sigma <= 0) {
    return 0.5;
  }
  const z = (value - fit.mu) / fit.sigma;
  return Math.min(1, Math.max(0, normalCdf(z)));
};

export const score10FromPercentile = (p: number): number => {
  if (p <= 0) {
    return 1;
  }
  if (p >= 1) {
    return 10;
  }
  return Math.max(1, Math.min(10, Math.ceil(p * 10)));
};

export const score10FromValue = (value: number, fit: NormalFit): number => {
  return score10FromPercentile(percentile(value, fit));
};
