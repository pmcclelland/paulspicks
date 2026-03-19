import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams, kenpomRankings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

type GameResult = {
  date: string;
  opponent: string;
  opponentLogo: string | null;
  score: string;
  win: boolean;
  home: boolean;
};

type PlayerInfo = {
  name: string;
  jersey: string;
  position: string;
  year: string;
};

type NotableGame = {
  opponent: string;
  opponentLogo: string | null;
  opponentRank: number;
  score: string;
  win: boolean;
  date: string;
};

type TeamDetails = {
  record: string;
  homeRecord: string | null;
  awayRecord: string | null;
  streak: string | null;
  ppg: string | null;
  oppg: string | null;
  last10: GameResult[];
  keyPlayers: PlayerInfo[];
  kenpomRank: number | null;
  kenpomAdjO: string | null;
  kenpomAdjORank: number | null;
  kenpomAdjD: string | null;
  kenpomAdjDRank: number | null;
  quadRecord: { q1: string; q2: string; q3: string; q4: string } | null;
  notableWins: NotableGame[];
  notableLosses: NotableGame[];
};

/**
 * Determine quad based on opponent KenPom rank and game location.
 * Q1: Home 1-30, Neutral 1-50, Away 1-75
 * Q2: Home 31-75, Neutral 51-100, Away 76-135
 * Q3: Home 76-160, Neutral 101-200, Away 136-240
 * Q4: Home 161+, Neutral 201+, Away 241+
 */
function getQuad(oppRank: number, location: "home" | "away" | "neutral"): 1 | 2 | 3 | 4 {
  if (location === "home") {
    if (oppRank <= 30) return 1;
    if (oppRank <= 75) return 2;
    if (oppRank <= 160) return 3;
    return 4;
  }
  if (location === "neutral") {
    if (oppRank <= 50) return 1;
    if (oppRank <= 100) return 2;
    if (oppRank <= 200) return 3;
    return 4;
  }
  // away
  if (oppRank <= 75) return 1;
  if (oppRank <= 135) return 2;
  if (oppRank <= 240) return 3;
  return 4;
}

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, parseInt(teamId, 10)),
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const espnId = team.espnTeamId;
  const details: TeamDetails = {
    record: "",
    homeRecord: null,
    awayRecord: null,
    streak: null,
    ppg: null,
    oppg: null,
    last10: [],
    keyPlayers: [],
    kenpomRank: null,
    kenpomAdjO: null,
    kenpomAdjORank: null,
    kenpomAdjD: null,
    kenpomAdjDRank: null,
    quadRecord: null,
    notableWins: [],
    notableLosses: [],
  };

  // Fetch team info + schedule + roster in parallel
  const [teamRes, scheduleRes, rosterRes] = await Promise.all([
    fetch(`${ESPN_BASE}/teams/${espnId}`).then((r) => r.ok ? r.json() : null).catch(() => null),
    fetch(`${ESPN_BASE}/teams/${espnId}/schedule?season=2026&seasontype=2`).then((r) => r.ok ? r.json() : null).catch(() => null),
    fetch(`${ESPN_BASE}/teams/${espnId}/roster`).then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);

  // Parse team record
  if (teamRes?.team?.record?.items) {
    for (const item of teamRes.team.record.items) {
      if (item.type === "total") {
        details.record = item.summary || "";
        const stats = item.stats || [];
        const streak = stats.find((s: any) => s.name === "streak");
        const ppf = stats.find((s: any) => s.name === "avgPointsFor");
        const ppa = stats.find((s: any) => s.name === "avgPointsAgainst");
        if (streak) details.streak = `${Math.abs(streak.value)}${streak.value > 0 ? "W" : "L"}`;
        if (ppf) details.ppg = ppf.value.toFixed(1);
        if (ppa) details.oppg = ppa.value.toFixed(1);
      } else if (item.type === "home") {
        details.homeRecord = item.summary || null;
      } else if (item.type === "road") {
        details.awayRecord = item.summary || null;
      }
    }
  }

  // Load KenPom data for quad calculations
  const allKenpom = await db.select().from(kenpomRankings);
  const kenpomByName = new Map<string, number>();
  for (const k of allKenpom) {
    kenpomByName.set(k.teamName.toLowerCase(), k.rank);
  }

  function findOppRank(oppName: string): number | null {
    const lower = oppName.toLowerCase();
    for (const [name, rank] of kenpomByName) {
      if (name === lower || lower.includes(name) || name.includes(lower)) return rank;
    }
    return null;
  }

  // Parse schedule for last 10, quad record, and notable games
  if (scheduleRes?.events) {
    const allCompleted = scheduleRes.events
      .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Last 10
    for (const event of allCompleted.slice(0, 10)) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const us = comp.competitors?.find((c: any) => c.id === espnId || c.team?.id === espnId);
      const them = comp.competitors?.find((c: any) => c.id !== espnId && c.team?.id !== espnId);
      if (!us || !them) continue;

      details.last10.push({
        date: event.date,
        opponent: them.team?.displayName || them.team?.name || "Unknown",
        opponentLogo: them.team?.logos?.[0]?.href || them.team?.logo || null,
        score: `${us.score?.displayValue || us.score || "?"}-${them.score?.displayValue || them.score || "?"}`,
        win: us.winner === true,
        home: us.homeAway === "home",
      });
    }

    // Quad record and notable games from ALL completed games
    const quadWins = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const quadLosses = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const event of allCompleted) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const us = comp.competitors?.find((c: any) => c.id === espnId || c.team?.id === espnId);
      const them = comp.competitors?.find((c: any) => c.id !== espnId && c.team?.id !== espnId);
      if (!us || !them) continue;

      const oppName = them.team?.displayName || them.team?.name || "";
      const oppRank = findOppRank(oppName);
      const isWin = us.winner === true;
      const location: "home" | "away" | "neutral" =
        comp.neutralSite ? "neutral" : us.homeAway === "home" ? "home" : "away";
      const score = `${us.score?.displayValue || us.score || "?"}-${them.score?.displayValue || them.score || "?"}`;
      const oppLogo = them.team?.logos?.[0]?.href || them.team?.logo || null;

      if (oppRank) {
        const quad = getQuad(oppRank, location);
        if (isWin) quadWins[quad]++;
        else quadLosses[quad]++;

        // Notable wins: Q1 wins (top ~75 opponents)
        if (isWin && oppRank <= 75) {
          details.notableWins.push({
            opponent: oppName,
            opponentLogo: oppLogo,
            opponentRank: oppRank,
            score,
            win: true,
            date: event.date,
          });
        }
        // Notable losses: losses to teams ranked 80+ in KenPom
        if (!isWin && oppRank >= 80) {
          details.notableLosses.push({
            opponent: oppName,
            opponentLogo: oppLogo,
            opponentRank: oppRank,
            score,
            win: false,
            date: event.date,
          });
        }
      }
    }

    details.quadRecord = {
      q1: `${quadWins[1]}-${quadLosses[1]}`,
      q2: `${quadWins[2]}-${quadLosses[2]}`,
      q3: `${quadWins[3]}-${quadLosses[3]}`,
      q4: `${quadWins[4]}-${quadLosses[4]}`,
    };

    // Sort notable games by opponent rank
    details.notableWins.sort((a, b) => a.opponentRank - b.opponentRank);
    details.notableLosses.sort((a, b) => a.opponentRank - b.opponentRank);
    // Limit to top 5 each
    details.notableWins = details.notableWins.slice(0, 5);
    details.notableLosses = details.notableLosses.slice(0, 5);
  }

  // Parse key players from roster (top 8 by experience/position)
  if (rosterRes?.athletes) {
    const athletes = rosterRes.athletes
      .filter((a: any) => a.status?.type !== "inactive")
      .slice(0, 8);

    for (const a of athletes) {
      details.keyPlayers.push({
        name: a.displayName || `${a.firstName} ${a.lastName}`,
        jersey: a.jersey || "",
        position: a.position?.abbreviation || "",
        year: a.experience?.abbreviation || "",
      });
    }
  }

  // Add KenPom data for this team
  const lower = team.name.toLowerCase();
  const kp = allKenpom.find(
    (k) =>
      k.teamName.toLowerCase() === lower ||
      lower.includes(k.teamName.toLowerCase()) ||
      k.teamName.toLowerCase().includes(lower)
  );
  if (kp) {
    details.kenpomRank = kp.rank;
    details.kenpomAdjO = kp.adjO;
    details.kenpomAdjORank = kp.adjORank;
    details.kenpomAdjD = kp.adjD;
    details.kenpomAdjDRank = kp.adjDRank;
  }

  return NextResponse.json(details);
}
