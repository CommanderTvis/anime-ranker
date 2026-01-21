# Anime Ranker

[![CI](https://github.com/CommanderTvis/anime-ranker/actions/workflows/ci.yml/badge.svg)](https://github.com/CommanderTvis/anime-ranker/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/CommanderTvis/anime-ranker/actions/workflows/deploy.yml/badge.svg)](https://github.com/CommanderTvis/anime-ranker/actions/workflows/deploy.yml)

Local React app to rank anime from MyAnimeList exports or Shikimori profiles using Elo-style pairwise comparisons.

**[Try it live →](https://commandertvis.github.io/anime-ranker/)**

## Features

- Import from MyAnimeList XML exports (`.xml` or `.xml.gz`) or fetch directly from Shikimori by username
- Rank anime via "A vs B" comparisons with keyboard hotkeys
- Fits a Normal distribution to Elo ratings
- Converts Elo percentiles to discretized 1–10 scores
- Blends Elo-derived scores with original scores based on completion ratio and score normality
- Optional: place dropped anime below completed and skip cross-status comparisons
- Export results as CSV or JSON
- Fetches posters and English titles via Jikan API

## Run locally

```bash
bun install
bun run dev
```

Opens at http://localhost:5173

## Testing

```bash
bun run test        # Watch mode
bun run test:run    # Single run
```

## How scoring works

1. Pairwise comparisons update Elo ratings
2. A Normal distribution `(μ, σ)` is fitted to all Elo values
3. Each anime's percentile is computed via `NormalCDF((elo - μ) / σ)`
4. Percentiles map to decile buckets 1–10
5. Final scores blend Elo-derived and original scores using:
   - `eloWeight = completionRatio^(1 + (1 - malNormality))`
   - Higher score normality → trust original scores more
   - Fewer comparisons → trust original scores more
