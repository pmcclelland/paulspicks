import type { ESPNEvent, ESPNCompetitor } from "@/types";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

export type ParsedTeam = {
  espnTeamId: string;
  name: string;
  abbreviation: string;
  seed: number;
  region: string;
  logoUrl: string | null;
};

export type ParsedGame = {
  espnEventId: string;
  round: number;
  region: string;
  gameIndex: number;
  team1: ParsedTeam | null;
  team2: ParsedTeam | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerEspnTeamId: string | null;
  status: "scheduled" | "in_progress" | "final";
  startTime: string | null;
  venue: string | null;
  broadcast: string | null;
};

const ROUND_NAME_MAP: Record<string, number> = {
  "First Four": 0,
  "1st Round": 1,
  "2nd Round": 2,
  "Sweet 16": 3,
  "Elite 8": 4,
  "Elite Eight": 4,
  "Final Four": 5,
  "National Championship": 6,
};

const REGION_ORDER = ["South", "East", "Midwest", "West"];

export async function fetchScoreboard(
  dateStr: string
): Promise<{ events: any[] }> {
  const url = `${SCOREBOARD_URL}?groups=100&dates=${dateStr}&limit=100`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function parseStatus(
  state: string,
  completed: boolean
): "scheduled" | "in_progress" | "final" {
  if (completed) return "final";
  if (state === "in") return "in_progress";
  return "scheduled";
}

function parseRoundAndRegion(
  headline: string | undefined
): { round: number; region: string } | null {
  if (!headline) return null;

  // Formats:
  // "NCAA Men's Basketball Championship - East Region - 1st Round"
  // "East Region - 1st Round"
  // "Final Four"
  // "National Championship"
  const parts = headline.split(" - ");

  // Try last two segments (handles 3-part ESPN format)
  if (parts.length >= 2) {
    const regionPart = parts[parts.length - 2].trim();
    const roundPart = parts[parts.length - 1].trim();
    const round = ROUND_NAME_MAP[roundPart];
    if (round !== undefined) {
      // Extract just the region name (e.g. "East Region" -> "East")
      const region = regionPart.replace(/\s*Region$/i, "").trim();
      return { round, region };
    }
  }

  // Try matching the whole headline or last part as a round name (Final Four, Championship)
  for (const part of [headline.trim(), parts[parts.length - 1].trim()]) {
    const round = ROUND_NAME_MAP[part];
    if (round !== undefined) {
      return { round, region: "Final Four" };
    }
  }

  return null;
}

// Standard bracket order: maps the higher seed in a R1 matchup to its game index
// 1v16=0, 8v9=1, 5v12=2, 4v13=3, 6v11=4, 3v14=5, 7v10=6, 2v15=7
const R1_SEED_TO_INDEX: Record<number, number> = {
  1: 0, 16: 0,
  8: 1, 9: 1,
  5: 2, 12: 2,
  4: 3, 13: 3,
  6: 4, 11: 4,
  3: 5, 14: 5,
  7: 6, 10: 6,
  2: 7, 15: 7,
};

export function parseTournamentData(events: any[]): {
  teams: ParsedTeam[];
  games: ParsedGame[];
} {
  const teamsMap = new Map<string, ParsedTeam>();
  const games: ParsedGame[] = [];
  const regionGameCounters: Record<string, Record<number, number>> = {};

  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const noteHeadline = competition.notes?.[0]?.headline;
    const roundRegion = parseRoundAndRegion(noteHeadline);
    if (!roundRegion) continue;

    const { round, region } = roundRegion;

    // For R1, determine game index from seed matchup (standard bracket order)
    // For other rounds, use sequential counter
    let gameIndex: number;
    const competitors: ESPNCompetitor[] = competition.competitors || [];
    if (round === 1 && competitors.length >= 2) {
      const seed1 = competitors[0]?.curatedRank?.current || 0;
      const seed2 = competitors[1]?.curatedRank?.current || 0;
      const higherSeed = Math.min(seed1, seed2);
      gameIndex = R1_SEED_TO_INDEX[higherSeed] ?? 0;
    } else {
      if (!regionGameCounters[region]) {
        regionGameCounters[region] = {};
      }
      if (regionGameCounters[region][round] === undefined) {
        regionGameCounters[region][round] = 0;
      }
      gameIndex = regionGameCounters[region][round]++;
    }

    const statusType = competition.status?.type || event.status?.type;
    const status = parseStatus(
      statusType?.state || "pre",
      statusType?.completed || false
    );

    let team1: ParsedTeam | null = null;
    let team2: ParsedTeam | null = null;
    let team1Score: number | null = null;
    let team2Score: number | null = null;
    let winnerEspnTeamId: string | null = null;

    // Sort competitors so higher seed (lower number) is team1
    const sortedCompetitors = [...competitors].sort((a, b) => {
      const seedA = a.curatedRank?.current || 99;
      const seedB = b.curatedRank?.current || 99;
      return seedA - seedB;
    });

    for (let i = 0; i < sortedCompetitors.length; i++) {
      const c = sortedCompetitors[i];
      const seed = c.curatedRank?.current || 0;
      const parsed: ParsedTeam = {
        espnTeamId: c.team.id,
        name: c.team.displayName,
        abbreviation: c.team.abbreviation,
        seed,
        region,
        logoUrl: c.team.logo || null,
      };

      teamsMap.set(c.team.id, parsed);

      if (i === 0) {
        team1 = parsed;
        team1Score = c.score ? parseInt(c.score, 10) : null;
      } else {
        team2 = parsed;
        team2Score = c.score ? parseInt(c.score, 10) : null;
      }

      if (c.winner) {
        winnerEspnTeamId = c.team.id;
      }
    }

    const venue = competition.venue?.fullName || null;
    const broadcast =
      competition.broadcasts?.[0]?.names?.join(", ") || null;

    games.push({
      espnEventId: event.id,
      round,
      region,
      gameIndex,
      team1,
      team2,
      team1Score,
      team2Score,
      winnerEspnTeamId,
      status,
      startTime: event.date || null,
      venue,
      broadcast,
    });
  }

  return {
    teams: Array.from(teamsMap.values()),
    games,
  };
}

// Tournament date ranges for each round (2026 NCAA Tournament)
export const TOURNAMENT_DATES: Record<number, string[]> = {
  0: ["20260317", "20260318"], // First Four
  1: ["20260319", "20260320"], // Round of 64
  2: ["20260321", "20260322"], // Round of 32
  3: ["20260326", "20260327"], // Sweet 16
  4: ["20260328", "20260329"], // Elite 8
  5: ["20260404"],             // Final Four
  6: ["20260406"],             // Championship
};
