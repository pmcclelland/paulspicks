# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
pnpm dev              # Start dev server (port 3000)
pnpm build            # Production build (TypeScript check + bundle)
pnpm lint             # ESLint
pnpm test             # Run vitest test suite
pnpm test:watch       # Run vitest in watch mode
pnpm db:generate      # Generate Drizzle migration from schema changes
pnpm db:push          # Push schema directly to Turso (requires env vars: source .env.local first)
```

After changing `src/lib/db/schema.ts`, run `pnpm db:generate` then `pnpm db:push` to apply to Turso.

## Environment Variables

Required:
- `TURSO_DATABASE_URL` — Turso/LibSQL database URL
- `TURSO_AUTH_TOKEN` — Turso auth token (optional for local dev with file: URLs)
- `ANTHROPIC_API_KEY` — For AI game analysis feature (used by `@anthropic-ai/sdk`)
- `AUTH_SECRET` — NextAuth v5 secret for JWT signing

Note: `pnpm db:push` requires env vars loaded manually: `set -a && source .env.local && set +a && pnpm db:push`

## Architecture

March Madness bracket pool app. Next.js 16 App Router, Turso (LibSQL) via Drizzle ORM, NextAuth v5 credentials auth, shadcn/ui + Tailwind v4, Anthropic Claude for AI analysis. Deployed to Vercel (auto-deploys on push to main).

### File Structure

```
src/
├── proxy.ts                    # Route protection — redirects unauthenticated users to /login
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   ├── bracket/page.tsx        # User's own bracket (editable or read-only for spectators)
│   ├── bracket/[userId]/page.tsx  # View another user's bracket (read-only)
│   ├── leaderboard/page.tsx    # Leaderboard + unique picks + badges
│   ├── scores/page.tsx         # Live scores with active/completed round sections
│   ├── login/page.tsx, register/page.tsx, admin/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── register/route.ts, bracket/route.ts, bracket/autopick/route.ts
│       ├── scores/route.ts, leaderboard/route.ts
│       ├── leaderboard/badges/route.ts, leaderboard/unique-picks/route.ts
│       ├── analysis/route.ts, kenpom/route.ts
│       ├── team-details/route.ts, team-records/route.ts
│       └── admin/{seed,refresh,lock,stats,kenpom}/route.ts
├── components/
│   ├── bracket-view.tsx        # Full bracket layout (desktop + mobile tabs)
│   ├── bracket-region.tsx      # Single region with connector lines between rounds
│   ├── bracket-game.tsx        # Game card + exported InfoModal (shared with score-card)
│   ├── final-four.tsx, nav-bar.tsx, score-card.tsx
│   ├── leaderboard-table.tsx   # Sortable table with champion picks, clickable rows, badge icons
│   ├── unique-picks.tsx        # Rarest correct picks display
│   ├── badges.tsx              # Awards grid + inline BadgeIcons component
│   ├── session-provider.tsx
│   └── ui/ (shadcn: button, card, tabs, badge, input, label, table, sonner)
├── __tests__/                  # Vitest test suite (75 tests)
│   ├── bracket-utils.test.ts, scoring.test.ts, refresh-scores.test.ts
│   ├── badges.test.ts, leaderboard.test.ts, unique-picks.test.ts
├── lib/
│   ├── db/schema.ts, db/index.ts
│   ├── bracket-utils.ts, scoring.ts, espn.ts, refresh-scores.ts
│   ├── auth.ts, analysis.ts, odds.ts, utils.ts
│   ├── kenpom-data.ts, school-names.ts, sample-teams.ts
└── types/index.ts, types/next-auth.d.ts
```

### Data Flow

**Seeding** (`POST /api/admin/seed`): Fetches ESPN scoreboard API for all tournament dates → parses teams/games → creates 63 game rows with standard bracket structure (1v16, 8v9, 5v12...). Falls back to `src/lib/sample-teams.ts` if ESPN has <32 teams. First Four play-in teams stored as JSON in `games.playInTeams`.

**Score Refresh** (`src/lib/refresh-scores.ts`): Shared by admin refresh endpoint AND auto-triggered by bracket API when stale (>2 min). Fetches ESPN → updates scores/status/odds → scores picks → cascades winners to next round via `bracket-utils.getNextGame()` and `getSlotInNextGame()`. TBD placeholder teams from ESPN are filtered out to avoid overwriting properly advanced winners.

**Bracket Picking** (client-side in `bracket-view.tsx`): `effectiveGames` memo propagates user picks into future round team slots by walking feeder games. Changing a pick clears downstream picks for the deselected team. Picks saved via `POST /api/bracket` (1-63 picks, no strict 63 requirement). Spectators see read-only view.

**AI Analysis** (`src/lib/analysis.ts`): Uses Anthropic SDK to generate matchup analysis for games. Results cached in `games.aiAnalysis`/`games.aiAnalysisAt`. Accessible via `GET /api/analysis`.

**Viewing Other Brackets**: Leaderboard rows are clickable → navigates to `/bracket/{userId}`. Bracket API accepts `?userId=X` param and enforces picks-locked check (spectators exempt). BracketView renders in read-only mode with custom title.

### User Roles

**Regular users**: Can create/edit brackets (before lock), view scores/leaderboard/other brackets (after lock). Appear on leaderboard.

**Spectators** (`users.isSpectator = 1`): Auto-assigned when registering after picks are locked. Can view everything but cannot create/edit picks. Excluded from leaderboard, badges, and unique picks. Can view other users' brackets without lock restriction. Nav bar shows "Spectator" badge.

**Admins** (`users.isAdmin = 1`): Access to `/admin` page and all admin API routes.

### Route Protection (`src/proxy.ts`)

Next.js proxy (middleware) checks for NextAuth session cookie. Public routes: `/`, `/login`, `/register`, `/api/auth/*`, `/api/register`. All other routes redirect to `/login` if unauthenticated. Nav bar shows active page indicator (orange underline).

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

NextAuth v5 JWT strategy with credentials provider. Session extended with `id`, `isAdmin`, and `isSpectator` (see `src/types/next-auth.d.ts`). Admin check: `session?.user?.isAdmin`. Spectator check: `session?.user?.isSpectator`.

### DB

Turso (LibSQL) via `@libsql/client` + Drizzle ORM. Connection configured in `src/lib/db/index.ts` using `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Schema in `src/lib/db/schema.ts`.

**Tables:** users, teams, games, picks, kenpomRankings, appState.

Key schema details:
- `users` — includes `isAdmin` and `isSpectator` integer flags (0/1)
- `games` — includes betting odds fields (spreadLine, moneylineTeam1/2, overUnder, oddsProvider) and AI analysis cache (aiAnalysis, aiAnalysisAt)
- `picks` — unique constraint on (userId, gameId), tracks isCorrect and pointsEarned
- `kenpomRankings` — full KenPom stats (adjEM, adjO, adjD, adjT, luck, SOS metrics)
- `appState` — key-value store for "picks_locked", "last_refresh"

### API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/bracket` | GET | User | Load bracket + auto-refresh if stale. Accepts `?userId=X` for viewing others |
| `/api/bracket` | POST | User (non-spectator) | Save picks (1-63) |
| `/api/bracket/autopick` | POST | User (non-spectator) | AI-generated bracket based on champion pick |
| `/api/register` | POST | Public | Register new user (auto-spectator if picks locked) |
| `/api/scores` | GET | Auth required | Live scores with team data |
| `/api/leaderboard` | GET | Auth required | Rankings with round breakdown + champion picks (excludes spectators) |
| `/api/leaderboard/badges` | GET | Auth required | 11 computed badges/awards (excludes spectators) |
| `/api/leaderboard/unique-picks` | GET | Auth required | Rarest picks across all users (excludes spectators) |
| `/api/analysis` | GET | Auth required | AI game analysis (Claude) |
| `/api/kenpom` | GET | Auth required | KenPom stats by team |
| `/api/team-details` | GET | Auth required | Team detail stats from ESPN |
| `/api/team-records` | GET | Auth required | Team records from ESPN |
| `/api/admin/seed` | POST | Admin | Seed tournament from ESPN |
| `/api/admin/refresh` | POST | Admin | Manual score refresh |
| `/api/admin/lock` | POST | Admin | Lock/unlock bracket editing |
| `/api/admin/stats` | POST | Admin | Calculate user statistics |
| `/api/admin/kenpom` | POST | Admin | Load KenPom data |
| `/api/admin/kenpom/seed` | POST | Admin | Seed KenPom rankings |

### Leaderboard Features

- **Champion picks**: Each user's championship team pick shown with logo + abbreviation
- **Clickable rows**: Navigate to `/bracket/{userId}` to view that user's bracket read-only
- **Badges/Awards**: 11 computed badges (Chaos Agent, Chalk Walk, Clown Car, Cinderella Finder, Oracle, Bold & Wrong, Perfect Round, Heartbreaker, Lone Wolf, Homer, Close But No Cigar). Badge emoji icons shown inline next to winners' names.
- **Unique Picks**: Top 10 rarest correct picks from R2+ with rarity stats
- Spectators excluded from all leaderboard data

### Desktop Bracket Layout

Left regions (East, South) render LTR (R1→E8). Right regions (West, Midwest) render RTL via `flex-row-reverse` (R1 on outside, E8 toward center). Final Four card vertically centered between quadrants. Mobile uses tab-based region switching.

**Connector lines**: CSS bracket lines between rounds drawn via `PairConnector` component. R1→R2 connectors are inline within pair wrappers for height alignment. Later round connectors use separate columns. Lines use 1:2:1 flex ratio for accurate horizontal stub positioning at card centers. RTL regions mirror connectors correctly.

**Round headers**: `w-56` pills with `w-8` spacers matching connector columns. R1 header uses `w-56` with spacer after. RTL headers use `flex-row-reverse` on wrappers to place spacers correctly.

### Scores Page

Games grouped by round. Within each round: in-progress and scheduled games shown first, final games in a separate "Final" subsection. Fully completed rounds collapse into a toggleable "Completed Rounds" section. Each score card has an info button opening the shared `InfoModal` (same as bracket view).

### Styling

Tailwind v4 with `@tailwindcss/postcss`. Fonts: DM Sans (primary), JetBrains Mono (mono). Dark theme (#0F1E33, #1B365D) with orange accents (#F4793B). shadcn/ui (base-nova style) for component primitives.

### Testing

Vitest test suite with 75 tests across 6 files. Tests cover bracket-utils, scoring, refresh-scores TBD filtering, badge computation logic, leaderboard aggregation/ranking, and unique picks. Run with `pnpm test`. Config in `vitest.config.ts`.
