# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
pnpm dev              # Start dev server (port 3000)
pnpm build            # Production build (TypeScript check + bundle)
pnpm lint             # ESLint
pnpm db:generate      # Generate Drizzle migration from schema changes
pnpm db:push          # Push schema directly to Turso
```

After changing `src/lib/db/schema.ts`, run `pnpm db:generate` then `pnpm db:push` to apply to Turso.

## Environment Variables

Required:
- `TURSO_DATABASE_URL` — Turso/LibSQL database URL
- `TURSO_AUTH_TOKEN` — Turso auth token (optional for local dev with file: URLs)
- `ANTHROPIC_API_KEY` — For AI game analysis feature (used by `@anthropic-ai/sdk`)
- `AUTH_SECRET` — NextAuth v5 secret for JWT signing

## Architecture

March Madness bracket pool app. Next.js 16 App Router, Turso (LibSQL) via Drizzle ORM, NextAuth v5 credentials auth, shadcn/ui + Tailwind v4, Anthropic Claude for AI analysis.

### File Structure

```
src/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   ├── bracket/page.tsx, leaderboard/page.tsx, scores/page.tsx
│   ├── login/page.tsx, register/page.tsx, admin/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── register/route.ts, bracket/route.ts
│       ├── scores/route.ts, leaderboard/route.ts
│       ├── analysis/route.ts, kenpom/route.ts
│       └── admin/{seed,refresh,lock,stats,kenpom}/route.ts
├── components/
│   ├── bracket-view.tsx, bracket-region.tsx, bracket-game.tsx
│   ├── final-four.tsx, nav-bar.tsx, score-card.tsx
│   ├── leaderboard-table.tsx, session-provider.tsx
│   └── ui/ (shadcn: button, card, tabs, badge, input, label, table, sonner)
├── lib/
│   ├── db/schema.ts, db/index.ts
│   ├── bracket-utils.ts, scoring.ts, espn.ts, refresh-scores.ts
│   ├── auth.ts, analysis.ts, odds.ts, utils.ts
│   ├── kenpom-data.ts, school-names.ts, sample-teams.ts
└── types/index.ts, types/next-auth.d.ts
```

### Data Flow

**Seeding** (`POST /api/admin/seed`): Fetches ESPN scoreboard API for all tournament dates → parses teams/games → creates 63 game rows with standard bracket structure (1v16, 8v9, 5v12...). Falls back to `src/lib/sample-teams.ts` if ESPN has <32 teams. First Four play-in teams stored as JSON in `games.playInTeams`.

**Score Refresh** (`src/lib/refresh-scores.ts`): Shared by admin refresh endpoint AND auto-triggered by bracket API when stale (>2 min). Fetches ESPN → updates scores/status/odds → scores picks → cascades winners to next round via `bracket-utils.getNextGame()` and `getSlotInNextGame()`.

**Bracket Picking** (client-side in `bracket-view.tsx`): `effectiveGames` memo propagates user picks into future round team slots by walking feeder games. Changing a pick clears downstream picks for the deselected team. Picks saved via `POST /api/bracket` (1-63 picks, no strict 63 requirement).

**AI Analysis** (`src/lib/analysis.ts`): Uses Anthropic SDK to generate matchup analysis for games. Results cached in `games.aiAnalysis`/`games.aiAnalysisAt`. Accessible via `GET /api/analysis`.

### Bracket Structure (`bracket-utils.ts`)

Games are indexed per-region (gameIndex 0-7 for R1, 0-3 for R2, etc.), not globally. Regions: South, East, Midwest, West. Final Four/Championship use region="Final Four".

- `getFeederGames(round, gameIndex)` → two parent games from previous round
- `getNextGame(round, gameIndex)` → child game in next round
- `getSlotInNextGame(gameIndex)` → even=team1, odd=team2
- `gamesPerRegionInRound(round)` → 8/4/2/1 for rounds 1-4
- Final Four mapping: REGIONS[0] vs [1] = semi 0, REGIONS[2] vs [3] = semi 1

### ESPN Integration (`espn.ts`)

Endpoint: `site.api.espn.com/.../scoreboard?groups=100&dates=YYYYMMDD&limit=100` (no auth). Headlines parsed for round/region — note `ROUND_NAME_MAP` uses 0 for First Four (falsy, must check `!== undefined`). `R1_SEED_TO_INDEX` maps seeds to standard bracket positions. Betting odds extracted from `competition.odds[]`.

Tournament dates for 2026 defined in `TOURNAMENT_DATES` (R0: 3/17-18, R1: 3/19-20, R2: 3/21-22, S16: 3/26-27, E8: 3/28-29, F4: 4/4, Championship: 4/6).

### Scoring (`scoring.ts`)

Points per round: 10, 20, 40, 80, 160, 320 (max 1,920). Defined in `POINTS_PER_ROUND`. `scoreUserPicks(userId)` returns `{ totalPoints, roundBreakdown, correctPicks, totalPicks }`.

### Auth (`auth.ts`)

NextAuth v5 JWT strategy with credentials provider. Session extended with `id` and `isAdmin` (see `src/types/next-auth.d.ts`). Admin check: `session?.user?.isAdmin`. No middleware — auth is checked per-route.

### DB

Turso (LibSQL) via `@libsql/client` + Drizzle ORM. Connection configured in `src/lib/db/index.ts` using `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Schema in `src/lib/db/schema.ts`.

**Tables:** users, teams, games, picks, kenpomRankings, appState.

Key schema details:
- `games` — includes betting odds fields (spreadLine, moneylineTeam1/2, overUnder, oddsProvider) and AI analysis cache (aiAnalysis, aiAnalysisAt)
- `picks` — unique constraint on (userId, gameId), tracks isCorrect and pointsEarned
- `kenpomRankings` — full KenPom stats (adjEM, adjO, adjD, adjT, luck, SOS metrics)
- `appState` — key-value store for "picks_locked", "last_refresh"

### API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/bracket` | GET | User | Load bracket + auto-refresh if stale |
| `/api/bracket` | POST | User | Save picks (1-63) |
| `/api/register` | POST | Public | Register new user |
| `/api/scores` | GET | Public | Live scores |
| `/api/leaderboard` | GET | Public | Rankings with round breakdown |
| `/api/analysis` | GET | Public | AI game analysis (Claude) |
| `/api/kenpom` | GET | Public | KenPom stats by team |
| `/api/admin/seed` | POST | Admin | Seed tournament from ESPN |
| `/api/admin/refresh` | POST | Admin | Manual score refresh |
| `/api/admin/lock` | POST | Admin | Lock/unlock bracket editing |
| `/api/admin/stats` | POST | Admin | Calculate user statistics |
| `/api/admin/kenpom` | POST | Admin | Load KenPom data |
| `/api/admin/kenpom/seed` | POST | Admin | Seed KenPom rankings |

### Desktop Bracket Layout

Left regions (South, Midwest) render LTR (R1→E8). Right regions (East, West) render RTL via `flex-row-reverse` (R1 on outside, E8 toward center). Final Four card centered between quadrants. Mobile uses tab-based region switching.

### Styling

Tailwind v4 with `@tailwindcss/postcss`. Fonts: DM Sans (primary), JetBrains Mono (mono). Dark theme (#0F1E33, #1B365D) with orange accents (#F4793B). shadcn/ui (base-nova style) for component primitives.
