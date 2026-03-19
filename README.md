# Paul's Picks

A March Madness bracket pool web app for competing with friends during the NCAA tournament. Fill out your bracket, track live scores, and climb the leaderboard.

## Features

- **Bracket Picking** — Interactive bracket UI with automatic pick propagation and downstream clearing
- **Live Scores** — Auto-refreshing scores from ESPN (every 2 minutes)
- **Leaderboard** — Real-time rankings with per-round point breakdowns
- **AI Analysis** — Claude-powered matchup analysis with KenPom stats and betting odds
- **Admin Dashboard** — Seed tournaments, refresh scores, lock brackets, view stats

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Turso (LibSQL) with Drizzle ORM
- **Auth:** NextAuth v5 (credentials, JWT strategy)
- **UI:** shadcn/ui, Tailwind CSS v4
- **AI:** Anthropic Claude SDK

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- A [Turso](https://turso.tech) database

### Environment Variables

Create a `.env.local` file:

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
AUTH_SECRET=your-nextauth-secret
ANTHROPIC_API_KEY=your-key  # optional, for AI analysis
```

### Setup

```bash
pnpm install
pnpm db:push          # Push schema to Turso
pnpm dev              # Start dev server at http://localhost:3000
```

### Seeding the Tournament

1. Register a user account at `/register`
2. Promote to admin: update `is_admin = 1` for your user in Turso
3. Go to `/admin` and click "Seed Tournament" (fetches from ESPN, or uses sample data if tournament hasn't started)

## Scripts

```bash
pnpm dev              # Start dev server (port 3000)
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm db:generate      # Generate Drizzle migration from schema changes
pnpm db:push          # Push schema to Turso
```

## Scoring

| Round | Points |
|-------|--------|
| Round of 64 | 10 |
| Round of 32 | 20 |
| Sweet 16 | 40 |
| Elite 8 | 80 |
| Final Four | 160 |
| Championship | 320 |

**Maximum possible:** 1,920 points (perfect bracket)

## Project Structure

```
src/
├── app/                  # Next.js App Router pages and API routes
├── components/           # React components (bracket, nav, leaderboard, shadcn/ui)
├── lib/                  # Business logic (ESPN, scoring, bracket utils, auth, DB)
└── types/                # TypeScript type definitions
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.
