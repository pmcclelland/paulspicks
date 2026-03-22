import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { GameBoxScore, TeamGameStats, PlayerGameStats, GameLeader } from "@/types";

export const dynamic = "force-dynamic";

const SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary";

// ESPN stat name → our key mapping for team aggregate stats
const TEAM_STAT_MAP: Record<string, keyof TeamGameStats> = {
  "fieldGoalPct": "fgPct",
  "fieldGoalsMade-fieldGoalsAttempted": "fgMadeAttempted",
  "threePointFieldGoalPct": "threePtPct",
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "threePtMadeAttempted",
  "freeThrowPct": "ftPct",
  "freeThrowsMade-freeThrowsAttempted": "ftMadeAttempted",
  "totalRebounds": "totalRebounds",
  "offensiveRebounds": "offRebounds",
  "defensiveRebounds": "defRebounds",
  "assists": "assists",
  "turnovers": "turnovers",
  "steals": "steals",
  "blocks": "blocks",
  "fouls": "fouls",
};

function parsePlayerStats(athleteData: any, headerIndex: Map<string, number>): PlayerGameStats | null {
  const stats = athleteData?.stats;
  if (!stats || stats.length === 0) return null;

  const values = stats as string[];

  const get = (key: string) => values[headerIndex.get(key) ?? -1] ?? "0";

  const parseSplit = (val: string) => {
    const parts = val?.split("-") ?? ["0", "0"];
    return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0] as const;
  };

  const [fgMade, fgAttempted] = parseSplit(get("FG"));
  const [threePtMade, threePtAttempted] = parseSplit(get("3PT"));
  const [ftMade, ftAttempted] = parseSplit(get("FT"));

  return {
    name: athleteData.athlete?.displayName ?? "Unknown",
    position: athleteData.athlete?.position?.abbreviation ?? "",
    minutes: parseInt(get("MIN"), 10) || 0,
    points: parseInt(get("PTS"), 10) || 0,
    rebounds: parseInt(get("REB"), 10) || 0,
    assists: parseInt(get("AST"), 10) || 0,
    steals: parseInt(get("STL"), 10) || 0,
    blocks: parseInt(get("BLK"), 10) || 0,
    turnovers: parseInt(get("TO"), 10) || 0,
    fgMade,
    fgAttempted,
    threePtMade,
    threePtAttempted,
    ftMade,
    ftAttempted,
  };
}

function parseTeamStats(statisticsArray: any[]): TeamGameStats {
  const defaults: TeamGameStats = {
    fgPct: "0.0",
    fgMadeAttempted: "0-0",
    threePtPct: "0.0",
    threePtMadeAttempted: "0-0",
    ftPct: "0.0",
    ftMadeAttempted: "0-0",
    totalRebounds: 0,
    offRebounds: 0,
    defRebounds: 0,
    assists: 0,
    turnovers: 0,
    steals: 0,
    blocks: 0,
    fouls: 0,
  };

  for (const stat of statisticsArray) {
    const key = TEAM_STAT_MAP[stat.name];
    if (!key) continue;
    const val = stat.displayValue ?? stat.value;
    if (typeof defaults[key] === "number") {
      (defaults as any)[key] = parseFloat(val) || 0;
    } else {
      (defaults as any)[key] = String(val ?? "0");
    }
  }

  return defaults;
}

function parseLeaders(leadersData: any[]): { points: GameLeader | null; rebounds: GameLeader | null; assists: GameLeader | null } {
  const result: { points: GameLeader | null; rebounds: GameLeader | null; assists: GameLeader | null } = {
    points: null,
    rebounds: null,
    assists: null,
  };

  const categoryMap: Record<string, keyof typeof result> = {
    points: "points",
    rebounds: "rebounds",
    assists: "assists",
  };

  for (const cat of leadersData) {
    const key = categoryMap[cat.name ?? cat.displayName?.toLowerCase()];
    if (!key) continue;
    const leader = cat.leaders?.[0];
    if (!leader) continue;
    result[key] = {
      name: leader.athlete?.displayName ?? leader.athlete?.shortName ?? "Unknown",
      value: leader.displayValue ?? String(leader.value ?? "0"),
      headshot: leader.athlete?.headshot?.href ?? null,
    };
  }

  return result;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;

  const url = `${SUMMARY_URL}?event=${eventId}`;
  const response = await fetch(url, { next: { revalidate: 30 } });
  if (!response.ok) {
    return NextResponse.json({ error: "ESPN data unavailable" }, { status: 502 });
  }

  const data = await response.json();
  const boxscore = data.boxscore;

  if (!boxscore?.teams || boxscore.teams.length < 2) {
    return NextResponse.json({ error: "No box score available" }, { status: 404 });
  }

  const teams = boxscore.teams;
  const playersData = boxscore.players || [];

  // Parse game leaders from the top-level leaders array
  const topLeaders = data.leaders || [];

  const parseTeam = (teamIdx: number) => {
    const team = teams[teamIdx];
    const teamInfo = team.team || {};
    const teamStats = parseTeamStats(team.statistics || []);

    const playerGroup = playersData[teamIdx];
    const athletes: PlayerGameStats[] = [];
    const statBlock = playerGroup?.statistics?.[0];
    if (statBlock?.athletes) {
      // Build header index from the names/labels array ESPN provides
      const headerIndex = new Map<string, number>();
      const names: string[] = statBlock.names || statBlock.labels || [];
      names.forEach((name: string, idx: number) => headerIndex.set(name, idx));

      for (const a of statBlock.athletes) {
        const parsed = parsePlayerStats(a, headerIndex);
        if (parsed) athletes.push(parsed);
      }
    }

    athletes.sort((a, b) => b.points - a.points);

    // Leaders: try top-level leaders first, fall back to computing from player data
    let leaders: { points: GameLeader | null; rebounds: GameLeader | null; assists: GameLeader | null };
    const teamLeaderData = topLeaders[teamIdx]?.leaders;
    if (teamLeaderData) {
      leaders = parseLeaders(teamLeaderData);
    } else {
      // Derive from player stats
      const topPts = athletes[0];
      const topReb = [...athletes].sort((a, b) => b.rebounds - a.rebounds)[0];
      const topAst = [...athletes].sort((a, b) => b.assists - a.assists)[0];
      leaders = {
        points: topPts ? { name: topPts.name, value: String(topPts.points), headshot: null } : null,
        rebounds: topReb ? { name: topReb.name, value: String(topReb.rebounds), headshot: null } : null,
        assists: topAst ? { name: topAst.name, value: String(topAst.assists), headshot: null } : null,
      };
    }

    return {
      teamName: teamInfo.displayName ?? teamInfo.shortDisplayName ?? "Unknown",
      abbreviation: teamInfo.abbreviation ?? "???",
      logoUrl: teamInfo.logo ?? null,
      stats: teamStats,
      players: athletes,
      leaders,
    };
  };

  const result: GameBoxScore = {
    team1: parseTeam(0),
    team2: parseTeam(1),
  };

  return NextResponse.json(result);
}
