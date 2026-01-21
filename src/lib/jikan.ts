import { AnimeMedia } from "./types";

export const fetchAnimeMedia = async (
  animeId: number
): Promise<AnimeMedia | null> => {
  const url = `https://api.jikan.moe/v4/anime/${animeId}`;
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!resp.ok) {
      return null;
    }
    const payload = await resp.json();
    const data = payload?.data;
    if (!data) {
      return null;
    }
    let titleEnglish = data.title_english ?? null;
    if (!titleEnglish && Array.isArray(data.titles)) {
      const english = data.titles.find(
        (entry: { type?: string; title?: string }) =>
          entry.type === "English" && entry.title
      );
      titleEnglish = english?.title ?? null;
    }
    const images = data.images?.jpg ?? {};
    const imageUrl = images.large_image_url ?? images.image_url ?? null;
    return {
      titleEnglish,
      imageUrl
    };
  } catch (err) {
    return null;
  }
};
