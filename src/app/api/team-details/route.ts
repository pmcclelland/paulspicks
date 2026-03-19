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
};

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

  // Parse last 10 games from schedule
  if (scheduleRes?.events) {
    const completed = scheduleRes.events
      .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    for (const event of completed) {
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

  // Add KenPom data
  const allKenpom = await db.select().from(kenpomRankings);
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
