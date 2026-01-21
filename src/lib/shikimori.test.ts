import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchShikimoriUser, fetchShikimoriAnimeList } from "./shikimori";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  mockFetch.mockReset();
});

describe("fetchShikimoriUser", () => {
  it("returns user data on successful response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 12345, nickname: "TestUser" }),
    });

    const result = await fetchShikimoriUser("TestUser");

    expect(result).toEqual({ id: 12345, nickname: "TestUser" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://shikimori.one/api/users/TestUser",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          "User-Agent": "AnimeRanker",
        }),
      })
    );
  });

  it("returns null on 404 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await fetchShikimoriUser("NonExistentUser");

    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchShikimoriUser("TestUser");

    expect(result).toBeNull();
  });

  it("encodes special characters in username", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, nickname: "Test User" }),
    });

    await fetchShikimoriUser("Test User");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://shikimori.one/api/users/Test%20User",
      expect.any(Object)
    );
  });
});

describe("fetchShikimoriAnimeList", () => {
  const mockUser = { id: 12345, nickname: "TestUser" };

  const createMockAnimeRate = (overrides = {}) => ({
    id: 1,
    score: 8,
    status: "completed",
    episodes: 12,
    anime: {
      id: 100,
      name: "Test Anime",
      kind: "tv",
      episodes: 12,
      episodes_aired: 12,
    },
    ...overrides,
  });

  it("returns null when user is not found", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchShikimoriAnimeList("NonExistentUser");

    expect(result).toBeNull();
  });

  it("fetches and transforms anime list correctly", async () => {
    // Mock user fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    // Mock anime rates for each status (6 statuses, return empty for all except completed)
    const statuses = [
      "planned",
      "watching",
      "rewatching",
      "completed",
      "on_hold",
      "dropped",
    ];
    for (const status of statuses) {
      if (status === "completed") {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              createMockAnimeRate({ status: "completed", score: 9 }),
            ]),
        });
      } else {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
    }

    const resultPromise = fetchShikimoriAnimeList("TestUser");

    // Advance timers for rate limiting
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }

    const result = await resultPromise;

    expect(result).not.toBeNull();
    expect(result?.source).toBe("shikimori");
    expect(result?.userId).toBe(12345);
    expect(result?.userName).toBe("TestUser");
    expect(result?.anime).toHaveLength(1);
    expect(result?.anime[0]).toEqual({
      animeId: 100,
      title: "Test Anime",
      animeType: "TV",
      episodes: 12,
      watchedEpisodes: 12,
      status: "Completed",
      myScore: 9,
    });
  });

  it("maps status values correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const testRates = [
      createMockAnimeRate({
        anime: { id: 1, name: "A", kind: "tv", episodes: 12, episodes_aired: 12 },
        status: "planned",
      }),
      createMockAnimeRate({
        anime: { id: 2, name: "B", kind: "tv", episodes: 12, episodes_aired: 12 },
        status: "watching",
      }),
      createMockAnimeRate({
        anime: { id: 3, name: "C", kind: "tv", episodes: 12, episodes_aired: 12 },
        status: "on_hold",
      }),
      createMockAnimeRate({
        anime: { id: 4, name: "D", kind: "tv", episodes: 12, episodes_aired: 12 },
        status: "dropped",
      }),
    ];

    // First status (planned) returns test rates, rest return empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(testRates),
    });
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    const resultPromise = fetchShikimoriAnimeList("TestUser");
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }
    const result = await resultPromise;

    const statuses = result?.anime.map((a) => a.status);
    expect(statuses).toContain("Plan to Watch");
    expect(statuses).toContain("Watching");
    expect(statuses).toContain("On-Hold");
    expect(statuses).toContain("Dropped");
  });

  it("maps anime type/kind correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const testRates = [
      createMockAnimeRate({
        anime: { id: 1, name: "A", kind: "tv", episodes: 12, episodes_aired: 12 },
      }),
      createMockAnimeRate({
        anime: { id: 2, name: "B", kind: "movie", episodes: 1, episodes_aired: 1 },
      }),
      createMockAnimeRate({
        anime: { id: 3, name: "C", kind: "ova", episodes: 2, episodes_aired: 2 },
      }),
      createMockAnimeRate({
        anime: { id: 4, name: "D", kind: "ona", episodes: 6, episodes_aired: 6 },
      }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(testRates),
    });
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    const resultPromise = fetchShikimoriAnimeList("TestUser");
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }
    const result = await resultPromise;

    const types = result?.anime.map((a) => a.animeType);
    expect(types).toContain("TV");
    expect(types).toContain("Movie");
    expect(types).toContain("OVA");
    expect(types).toContain("ONA");
  });

  it("handles null anime in rate entry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const testRates = [
      createMockAnimeRate(),
      { id: 2, score: 5, status: "completed", episodes: 0, anime: null },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(testRates),
    });
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    const resultPromise = fetchShikimoriAnimeList("TestUser");
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }
    const result = await resultPromise;

    expect(result?.anime).toHaveLength(1);
  });

  it("handles zero score as null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const testRates = [createMockAnimeRate({ score: 0 })];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(testRates),
    });
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    const resultPromise = fetchShikimoriAnimeList("TestUser");
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }
    const result = await resultPromise;

    expect(result?.anime[0].myScore).toBeNull();
  });

  it("calls progress callback during fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([createMockAnimeRate()]),
    });
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    const onProgress = vi.fn();
    const resultPromise = fetchShikimoriAnimeList("TestUser", onProgress);

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }

    await resultPromise;

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
  });

  it("sorts anime alphabetically by title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const testRates = [
      createMockAnimeRate({
        anime: { id: 1, name: "Zebra", kind: "tv", episodes: 12, episodes_aired: 12 },
      }),
      createMockAnimeRate({
        anime: { id: 2, name: "Apple", kind: "tv", episodes: 12, episodes_aired: 12 },
      }),
      createMockAnimeRate({
        anime: { id: 3, name: "Mango", kind: "tv", episodes: 12, episodes_aired: 12 },
      }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(testRates),
    });
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    const resultPromise = fetchShikimoriAnimeList("TestUser");
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }
    const result = await resultPromise;

    expect(result?.anime.map((a) => a.title)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("handles pagination correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    // First page with 50 items (triggers pagination)
    const page1 = Array(50)
      .fill(null)
      .map((_, i) =>
        createMockAnimeRate({
          id: i,
          anime: {
            id: i,
            name: `Anime ${i}`,
            kind: "tv",
            episodes: 12,
            episodes_aired: 12,
          },
        })
      );
    // Second page with 10 items (ends pagination)
    const page2 = Array(10)
      .fill(null)
      .map((_, i) =>
        createMockAnimeRate({
          id: 50 + i,
          anime: {
            id: 50 + i,
            name: `Anime ${50 + i}`,
            kind: "tv",
            episodes: 12,
            episodes_aired: 12,
          },
        })
      );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(page1),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(page2),
    });
    // Remaining statuses return empty
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    const resultPromise = fetchShikimoriAnimeList("TestUser");
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(400);
    }
    const result = await resultPromise;

    expect(result?.anime).toHaveLength(60);
  });
});
