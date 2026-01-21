export type AnimeEntry = {
  animeId: number;
  title: string;
  animeType: string | null;
  episodes: number | null;
  watchedEpisodes: number | null;
  status: string | null;
  myScore: number | null;
};

export type MALExport = {
  userId: number | null;
  userName: string | null;
  anime: AnimeEntry[];
};

export type Rating = {
  value: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
};

export type EloState = {
  ratings: Map<number, Rating>;
  comparisons: number;
  skips: number;
  pairHistory: Set<string>;
  kFactor: number;
  initialRating: number;
};

export type NormalFit = {
  mu: number;
  sigma: number;
};

export type AnimeResult = {
  rank: number;
  animeId: number;
  title: string;
  status: string | null;
  myScore: number | null;
  elo: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  percentile: number;
  score1to10: number;
};

export type AnimeMedia = {
  titleEnglish: string | null;
  imageUrl: string | null;
};
