import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAnimeMedia } from "./jikan";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

describe("fetchAnimeMedia", () => {
  it("returns media data on successful response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            title_english: "My Anime Title",
            images: {
              jpg: {
                large_image_url: "https://example.com/large.jpg",
                image_url: "https://example.com/normal.jpg",
              },
            },
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result).toEqual({
      titleEnglish: "My Anime Title",
      imageUrl: "https://example.com/large.jpg",
    });
  });

  it("calls correct Jikan API URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await fetchAnimeMedia(5678);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.jikan.moe/v4/anime/5678",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      })
    );
  });

  it("returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await fetchAnimeMedia(9999);

    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchAnimeMedia(1234);

    expect(result).toBeNull();
  });

  it("returns null when data is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result).toBeNull();
  });

  it("returns null when data is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result).toBeNull();
  });

  it("falls back to titles array for English title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            title_english: null,
            titles: [
              { type: "Default", title: "Original Title" },
              { type: "English", title: "English from Array" },
            ],
            images: { jpg: { image_url: "https://example.com/img.jpg" } },
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result?.titleEnglish).toBe("English from Array");
  });

  it("returns null titleEnglish when not available anywhere", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            title_english: null,
            titles: [{ type: "Japanese", title: "日本語タイトル" }],
            images: { jpg: { image_url: "https://example.com/img.jpg" } },
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result?.titleEnglish).toBeNull();
  });

  it("falls back to image_url when large_image_url is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            title_english: "Test",
            images: {
              jpg: {
                image_url: "https://example.com/normal.jpg",
              },
            },
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result?.imageUrl).toBe("https://example.com/normal.jpg");
  });

  it("returns null imageUrl when images.jpg is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            title_english: "Test",
            images: {},
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result?.imageUrl).toBeNull();
  });

  it("returns null imageUrl when images is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            title_english: "Test",
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result?.imageUrl).toBeNull();
  });

  it("handles titles array without English entry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            titles: [],
            images: { jpg: { image_url: "https://example.com/img.jpg" } },
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result?.titleEnglish).toBeNull();
  });

  it("handles malformed titles array entries", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            titles: [
              { type: "English" }, // Missing title
              { title: "No Type" }, // Missing type
            ],
            images: { jpg: { image_url: "https://example.com/img.jpg" } },
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    // Neither entry matches (type === "English" && title) so titleEnglish should be null
    expect(result?.titleEnglish).toBeNull();
  });

  it("prefers title_english over titles array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            title_english: "Primary English",
            titles: [{ type: "English", title: "Secondary English" }],
            images: { jpg: { image_url: "https://example.com/img.jpg" } },
          },
        }),
    });

    const result = await fetchAnimeMedia(1234);

    expect(result?.titleEnglish).toBe("Primary English");
  });
});
