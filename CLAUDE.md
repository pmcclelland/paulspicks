# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
pnpm dev              # Start dev server (port 3000)
pnpm build            # Production build (TypeScript check + bundle)
pnpm lint             # ESLint
pnpm db:generate      # Generate Drizzle migration from schema changes
pnpm db:push          # Push schema directly to SQLite
```

After changing `src/lib/db/schema.ts`, run `pnpm db:generate` then delete and recreate the DB (`rm data/paulspicks.db`) since SQLite migrations are applied on startup via `src/lib/db/index.ts`.

## Architecture

March Madness bracket pool app. Next.js 16 App Router, SQLite via Drizzle ORM, NextAuth v5 credentials auth, shadcn/ui + Tailwind v4.

### Data Flow

**Seeding** (`POST /api/admin/seed`): Fetches ESPN scoreboard API for all tournament dates → parses teams/games → creates 63 game rows with standard bracket structure (1v16, 8v9, 5v12...). Falls back to `src/lib/sample-teams.ts` if ESPN has <32 teams. First Four play-in teams stored as JSON in `games.playInTeams`.

**Score Refresh** (`src/lib/refresh-scores.ts`): Shared by admin refresh endpoint AND auto-triggered by bracket API when stale (>2 min). Fetches ESPN → updates scores/status → scores picks → cascades winners to next round via `bracket-utils.getNextGame()` and `getSlotInNextGame()`.

**Bracket Picking** (client-side in `bracket-view.tsx`): `effectiveGames` memo propagates user picks into future round team slots by walking feeder games. Changing a pick clears downstream picks for the deselected team. Picks saved via `POST /api/bracket` (1-63 picks, no strict 63 requirement).

### Bracket Structure (`bracket-utils.ts`)

Games are indexed per-region (gameIndex 0-7 for R1, 0-3 for R2, etc.), not globally. Regions: South, East, Midwest, West. Final Four/Championship use region="Final Four".

- `getFeederGames(round, gameIndex)` → two parent games from previous round
- `getNextGame(round, gameIndex)` → child game in next round
- `getSlotInNextGame(gameIndex)` → even=team1, odd=team2
- Final Four mapping: REGIONS[0] vs [1] = semi 0, REGIONS[2] vs [3] = semi 1

### ESPN Integration (`espn.ts`)

Endpoint: `site.api.espn.com/.../scoreboard?groups=100&dates=YYYYMMDD&limit=100` (no auth). Headlines parsed for round/region — note `ROUND_NAME_MAP` uses 0 for First Four (falsy, must check `!== undefined`). `R1_SEED_TO_INDEX` maps seeds to standard bracket positions.

### Scoring

Points per round: 10, 20, 40, 80, 160, 320 (max 1,920). Defined in `POINTS_PER_ROUND` in `scoring.ts`.

### Auth

NextAuth v5 JWT strategy with credentials provider. Session extended with `id` and `isAdmin` (see `src/types/next-auth.d.ts`). Admin check: `session?.user?.isAdmin`. First user must be manually promoted: `sqlite3 data/paulspicks.db "UPDATE users SET is_admin = 1 WHERE id = 1;"`.

### DB

SQLite at `data/paulspicks.db` (gitignored). Drizzle ORM with `better-sqlite3`. Calls are synchronous (`.all()`, `.run()`). Auto-migrates on import of `src/lib/db/index.ts`. Schema in `src/lib/db/schema.ts`: users, teams, games, picks, appState.

### Desktop Bracket Layout

Left regions (South, Midwest) render LTR (R1→E8). Right regions (East, West) render RTL via `flex-row-reverse` (R1 on outside, E8 toward center). Final Four card centered between quadrants. Mobile uses tab-based region switching.
