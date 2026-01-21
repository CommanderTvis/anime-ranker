# CLAUDE.md

## Project Overview

Anime Ranker is a local React application for ranking anime from MyAnimeList (MAL) exports or Shikimori profiles using Elo-style pairwise comparisons. It converts subjective rankings into normalized 1-10 scores using statistical distribution fitting.

## Tech Stack

- **Runtime**: Bun
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Testing**: Vitest
- **Styling**: Plain CSS (`src/styles.css`)

## Commands

```bash
bun install            # Install dependencies
bun run dev            # Start dev server on port 5173
bun run build          # Production build
bun run preview        # Preview production build
bun run test           # Run tests in watch mode
bun run test:run       # Run tests once
bun run test:integration  # Run Shikimori integration tests
```

## Project Structure

```
src/
├── App.tsx          # Main application component (state, UI, hotkeys)
├── main.tsx         # React entry point
├── styles.css       # Application styles
├── vite-env.d.ts    # Vite type declarations
└── lib/
    ├── types.ts     # TypeScript interfaces (AnimeEntry, EloState, etc.)
    ├── mal.ts       # MAL XML export parser
    ├── shikimori.ts # Shikimori API client for fetching user anime lists
    ├── elo.ts       # Elo rating system (createEloState, recordOutcome, selectPair)
    ├── scoring.ts   # Normal distribution fitting and percentile → 1-10 conversion
    ├── analysis.ts  # Statistical analysis (normality line, MAL score summary)
    ├── results.ts   # Result building and CSV/JSON export
    ├── jikan.ts     # Jikan API client for posters/English titles
    ├── random.ts    # Seeded random number generator
    └── *.test.ts    # Unit tests for each module
```

## Key Concepts

- **Elo Rating**: Pairwise "A vs B" comparisons update ratings using the Elo algorithm
- **Score Normalization**: Fits a Normal distribution (mu, sigma) to Elo ratings, then maps each anime's percentile to a 1-10 decile bucket
- **Blended Scoring**: Final scores blend Elo-derived percentiles with original MAL scores based on:
  - `eloWeight = completionRatio^(1 + (1 - malNormality))`
  - Higher MAL normality → trust MAL scores more (exponent closer to 1)
  - Fewer comparisons → trust MAL scores more (lower completionRatio)
  - At 100% completion, eloWeight=1 (pure Elo scoring)
  - See `computeEloWeight()` in `src/lib/results.ts`
- **Dropped Assumption**: Optional setting to place dropped anime below completed ones and skip cross-status comparisons
- **State Persistence**: Session state saved to localStorage under key `anime-ranker-state-v1`

## File Formats

- **Input**: MAL XML exports (`.xml` or `.xml.gz`, decompressed in-browser via pako) or Shikimori username
- **Output**: CSV or JSON results via File System Access API or download
