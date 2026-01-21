import pako from "pako";
import { AnimeEntry, MALExport } from "./types";

const GZIP_MAGIC = [0x1f, 0x8b];

const safeInt = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const num = Number.parseInt(trimmed, 10);
  return Number.isNaN(num) ? null : num;
};

const maybeDecompress = (
  data: Uint8Array,
  filename?: string
): Uint8Array => {
  const startsWithGzip =
    data.length >= 2 && data[0] === GZIP_MAGIC[0] && data[1] === GZIP_MAGIC[1];
  const looksGzip = filename ? filename.toLowerCase().endsWith(".gz") : false;
  if (startsWithGzip || looksGzip) {
    return pako.ungzip(data);
  }
  return data;
};

const getText = (parent: Element, tag: string): string | null => {
  const node = parent.getElementsByTagName(tag)[0];
  if (!node || !node.textContent) {
    return null;
  }
  return node.textContent;
};

export const parseMalExport = (
  data: Uint8Array,
  filename?: string
): MALExport => {
  const xmlBytes = maybeDecompress(data, filename);
  const decoded = new TextDecoder("utf-8").decode(xmlBytes);
  const sanitized = decoded.replace(
    /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g,
    ""
  );
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/xml");

  const info = doc.getElementsByTagName("myinfo")[0];
  const userId = info ? safeInt(getText(info, "user_id")) : null;
  const rawUserName = info ? getText(info, "user_name") : null;
  const userName = rawUserName ? rawUserName.trim() : null;

  const entries: AnimeEntry[] = [];
  const animeNodes = Array.from(doc.getElementsByTagName("anime"));
  animeNodes.forEach((node) => {
    const animeId = safeInt(getText(node, "series_animedb_id"));
    const title = getText(node, "series_title");
    if (animeId === null || !title) {
      return;
    }
    const entry: AnimeEntry = {
      animeId,
      title: title.trim(),
      animeType: (getText(node, "series_type") || "").trim() || null,
      episodes: safeInt(getText(node, "series_episodes")),
      watchedEpisodes: safeInt(getText(node, "my_watched_episodes")),
      status: (getText(node, "my_status") || "").trim() || null,
      myScore: safeInt(getText(node, "my_score"))
    };
    entries.push(entry);
  });

  entries.sort((a, b) => a.title.localeCompare(b.title));

  return {
    userId,
    userName,
    anime: entries
  };
};
