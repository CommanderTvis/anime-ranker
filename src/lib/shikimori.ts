import { AnimeEntry, AnimeListExport } from "./types";

const API_BASE = "https://shikimori.one/api";
const USER_AGENT = "AnimeRanker";
const RATE_LIMIT_DELAY = 350; // 5rps limit = 200ms minimum, add buffer

type ShikimoriAnimeRate = {
  id: number;
  score: number;
  status: string;
  episodes: number;
  anime: {
    id: number;
    name: string;
    russian?: string;
    kind: string;
    episodes: number;
    episodes_aired: number;
  } | null;
};

type ShikimoriUser = {
  id: number;
  nickname: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mapStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    planned: "Plan to Watch",
    watching: "Watching",
    rewatching: "Watching",
    completed: "Completed",
    on_hold: "On-Hold",
    dropped: "Dropped",
  };
  return statusMap[status] || status;
};

const mapKind = (kind: string): string => {
  const kindMap: Record<string, string> = {
    tv: "TV",
    movie: "Movie",
    ova: "OVA",
    ona: "ONA",
    special: "Special",
    tv_special: "TV Special",
    music: "Music",
    pv: "PV",
    cm: "CM",
  };
  return kindMap[kind] || kind;
};

export const fetchShikimoriUser = async (
  username: string
): Promise<ShikimoriUser | null> => {
  const url = `${API_BASE}/users/${encodeURIComponent(username)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    return {
      id: data.id,
      nickname: data.nickname,
    };
  } catch {
    return null;
  }
};

export const fetchShikimoriAnimeList = async (
  username: string,
  onProgress?: (loaded: number, status: string) => void
): Promise<AnimeListExport | null> => {
  const user = await fetchShikimoriUser(username);
  if (!user) {
    return null;
  }

  const allRates: ShikimoriAnimeRate[] = [];
  const statuses = [
    "planned",
    "watching",
    "rewatching",
    "completed",
    "on_hold",
    "dropped",
  ];

  for (const status of statuses) {
    let page = 1;
    const statusLabel = mapStatus(status);

    while (true) {
      onProgress?.(allRates.length, `Fetching ${statusLabel}...`);

      const url = `${API_BASE}/users/${user.id}/anime_rates?limit=50&page=${page}&status=${status}`;
      try {
        const resp = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
        });

        if (!resp.ok) {
          break;
        }

        const data: ShikimoriAnimeRate[] = await resp.json();
        if (!data || data.length === 0) {
          break;
        }

        allRates.push(...data);
        page += 1;

        // Respect rate limits
        await sleep(RATE_LIMIT_DELAY);

        // API returns max 50 per page
        if (data.length < 50) {
          break;
        }
      } catch {
        break;
      }
    }
  }

  onProgress?.(allRates.length, "Processing...");

  const entries: AnimeEntry[] = [];

  for (const rate of allRates) {
    if (!rate.anime) {
      continue;
    }

    const entry: AnimeEntry = {
      animeId: rate.anime.id,
      title: rate.anime.name,
      animeType: rate.anime.kind ? mapKind(rate.anime.kind) : null,
      episodes: rate.anime.episodes || rate.anime.episodes_aired || null,
      watchedEpisodes: rate.episodes || null,
      status: mapStatus(rate.status),
      myScore: rate.score > 0 ? rate.score : null,
    };

    entries.push(entry);
  }

  entries.sort((a, b) => a.title.localeCompare(b.title));

  return {
    source: "shikimori",
    userId: user.id,
    userName: user.nickname,
    anime: entries,
  };
};
