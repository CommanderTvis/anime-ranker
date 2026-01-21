import { describe, it, expect } from "vitest";
import { parseMalExport } from "./mal";

const createMalXml = (entries: string[], userInfo = {}) => {
  const { userId = "12345", userName = "TestUser" } = userInfo as {
    userId?: string;
    userName?: string;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <myinfo>
    <user_id>${userId}</user_id>
    <user_name>${userName}</user_name>
  </myinfo>
  ${entries.join("\n")}
</myanimelist>`;
};

const createAnimeEntry = (overrides: Record<string, string | number> = {}) => {
  const defaults = {
    id: 1,
    title: "Test Anime",
    type: "TV",
    episodes: 12,
    watchedEpisodes: 12,
    status: "Completed",
    score: 8,
  };
  const entry = { ...defaults, ...overrides };
  return `<anime>
    <series_animedb_id>${entry.id}</series_animedb_id>
    <series_title>${entry.title}</series_title>
    <series_type>${entry.type}</series_type>
    <series_episodes>${entry.episodes}</series_episodes>
    <my_watched_episodes>${entry.watchedEpisodes}</my_watched_episodes>
    <my_status>${entry.status}</my_status>
    <my_score>${entry.score}</my_score>
  </anime>`;
};

describe("parseMalExport", () => {
  it("sets source to 'mal'", () => {
    const xml = createMalXml([createAnimeEntry()]);
    const data = new TextEncoder().encode(xml);

    const result = parseMalExport(new Uint8Array(data));

    expect(result.source).toBe("mal");
  });

  it("parses user info correctly", () => {
    const xml = createMalXml([createAnimeEntry()], {
      userId: "99999",
      userName: "MyUser",
    });
    const data = new TextEncoder().encode(xml);

    const result = parseMalExport(new Uint8Array(data));

    expect(result.userId).toBe(99999);
    expect(result.userName).toBe("MyUser");
  });

  it("parses anime entries correctly", () => {
    const xml = createMalXml([
      createAnimeEntry({
        id: 123,
        title: "My Anime",
        type: "Movie",
        episodes: 1,
        watchedEpisodes: 1,
        status: "Completed",
        score: 10,
      }),
    ]);
    const data = new TextEncoder().encode(xml);

    const result = parseMalExport(new Uint8Array(data));

    expect(result.anime).toHaveLength(1);
    expect(result.anime[0]).toEqual({
      animeId: 123,
      title: "My Anime",
      animeType: "Movie",
      episodes: 1,
      watchedEpisodes: 1,
      status: "Completed",
      myScore: 10,
    });
  });

  it("sorts anime alphabetically by title", () => {
    const xml = createMalXml([
      createAnimeEntry({ id: 1, title: "Zebra" }),
      createAnimeEntry({ id: 2, title: "Apple" }),
      createAnimeEntry({ id: 3, title: "Mango" }),
    ]);
    const data = new TextEncoder().encode(xml);

    const result = parseMalExport(new Uint8Array(data));

    expect(result.anime.map((a) => a.title)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("handles missing optional fields", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <myinfo>
    <user_id>123</user_id>
    <user_name>Test</user_name>
  </myinfo>
  <anime>
    <series_animedb_id>1</series_animedb_id>
    <series_title>Test</series_title>
    <series_type></series_type>
    <series_episodes></series_episodes>
    <my_watched_episodes></my_watched_episodes>
    <my_status></my_status>
    <my_score></my_score>
  </anime>
</myanimelist>`;
    const data = new TextEncoder().encode(xml);

    const result = parseMalExport(new Uint8Array(data));

    expect(result.anime[0]).toEqual({
      animeId: 1,
      title: "Test",
      animeType: null,
      episodes: null,
      watchedEpisodes: null,
      status: null,
      myScore: null,
    });
  });

  it("skips entries without animeId or title", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <myinfo>
    <user_id>123</user_id>
    <user_name>Test</user_name>
  </myinfo>
  <anime>
    <series_animedb_id></series_animedb_id>
    <series_title>No ID</series_title>
  </anime>
  <anime>
    <series_animedb_id>1</series_animedb_id>
    <series_title></series_title>
  </anime>
  <anime>
    <series_animedb_id>2</series_animedb_id>
    <series_title>Valid</series_title>
  </anime>
</myanimelist>`;
    const data = new TextEncoder().encode(xml);

    const result = parseMalExport(new Uint8Array(data));

    expect(result.anime).toHaveLength(1);
    expect(result.anime[0].title).toBe("Valid");
  });

  it("handles zero scores correctly", () => {
    const xml = createMalXml([createAnimeEntry({ score: 0 })]);
    const data = new TextEncoder().encode(xml);

    const result = parseMalExport(new Uint8Array(data));

    expect(result.anime[0].myScore).toBe(0);
  });
});
