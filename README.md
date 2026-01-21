# Anime Ranker

[![Deploy to GitHub Pages](https://github.com/CommanderTvis/anime-ranker/actions/workflows/deploy.yml/badge.svg)](https://github.com/CommanderTvis/anime-ranker/actions/workflows/deploy.yml)

Local React app to rank anime from MyAnimeList exports using Elo-style pairwise comparisons.

**[Try it live →](https://commandertvis.github.io/anime-ranker/)**

## Features

- Load MyAnimeList XML exports (`.xml` or `.xml.gz`, decompressed in-browser)
- Rank anime via "A vs B" comparisons with keyboard hotkeys
- Fits a Normal distribution to Elo ratings
- Converts Elo percentiles to discretized 1–10 scores
- Blends Elo-derived scores with original MAL scores based on completion ratio and MAL score normality
- Optional: place dropped anime below completed and skip cross-status comparisons
- Export results as CSV or JSON
- Fetches posters and English titles via Jikan API (no MAL OAuth required)

## Run locally

```bash
bun install
bun run dev
```

Opens at http://localhost:5173

## Build

```bash
bun run build
bun run preview
```

## How scoring works

1. Pairwise comparisons update Elo ratings
2. A Normal distribution `(μ, σ)` is fitted to all Elo values
3. Each anime's percentile is computed via `NormalCDF((elo - μ) / σ)`
4. Percentiles map to decile buckets 1–10
5. Final scores blend Elo-derived and MAL scores using:
   - `eloWeight = completionRatio^(1 + (1 - malNormality))`
   - Higher MAL normality → trust MAL scores more
   - Fewer comparisons → trust MAL scores more

## License

[MIT](LICENSE) © 2026 Iaroslav (Rick) Postovalov
