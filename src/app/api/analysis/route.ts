import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { games, teams, kenpomRankings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMatchupAnalysis, type KenpomStats, type InjuryData } from "@/lib/analysis";
import { schoolName } from "@/lib/school-names";

const ROTOWIRE_URL = "https://www.rotowire.com/cbasketball/tables/injury-report.php?team=ALL&pos=ALL";

const ROTOWIRE_NAME_MAP: Record<string, string> = {
  "Connecticut": "UConn",
  "Central Florida": "UCF",
  "Hawaii": "Hawai'i",
  "Pennsylvania": "Penn",
  "California Baptist": "Cal Baptist",
  "LIU": "Long Island",
};

export const dynamic = "force-dynamic";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gameId = request.nextUrl.searchParams.get("gameId");
  if (!gameId) {
    return NextResponse.json({ error: "gameId required" }, { status: 400 });
  }

  const game = await db.query.games.findFirst({
    where: eq(games.id, parseInt(gameId, 10)),
  });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Check cache
  if (game.aiAnalysis && game.aiAnalysisAt) {
    const age = Date.now() - new Date(game.aiAnalysisAt).getTime();
    if (age < SIX_HOURS_MS) {
      return NextResponse.json({
        analysis: game.aiAnalysis,
        generatedAt: game.aiAnalysisAt,
      });
    }
  }

  // Need both teams to generate analysis
  if (!game.team1Id || !game.team2Id) {
    return NextResponse.json({
      analysis: null,
      generatedAt: null,
    });
  }

  const [team1, team2] = await Promise.all([
    db.query.teams.findFirst({ where: eq(teams.id, game.team1Id) }),
    db.query.teams.findFirst({ where: eq(teams.id, game.team2Id) }),
  ]);

  if (!team1 || !team2) {
    return NextResponse.json({
      analysis: null,
      generatedAt: null,
    });
  }

  try {
    // Look up KenPom data and injuries for both teams
    const [allKenpom, injuryRes] = await Promise.all([
      db.select().from(kenpomRankings),
      fetch(ROTOWIRE_URL).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);

    function getInjuries(teamName: string): InjuryData[] {
      if (!Array.isArray(injuryRes)) return [];
      const shortName = schoolName(teamName);
      return injuryRes
        .filter((entry: any) => (ROTOWIRE_NAME_MAP[entry.team] ?? entry.team) === shortName)
        .map((entry: any) => ({
          player: entry.player,
          position: entry.position,
          injury: entry.injury,
          status: entry.status,
        }));
    }

    function findKenpom(teamName: string): KenpomStats {
      const lower = teamName.toLowerCase();
      const match = allKenpom.find(
        (k) =>
          k.teamName.toLowerCase() === lower ||
          lower.includes(k.teamName.toLowerCase()) ||
          k.teamName.toLowerCase().includes(lower)
      );
      if (!match) return null;
      return {
        rank: match.rank,
        adjEM: match.adjEM!,
        adjO: match.adjO!,
        adjORank: match.adjORank!,
        adjD: match.adjD!,
        adjDRank: match.adjDRank!,
      };
    }

    const kenpom1 = findKenpom(team1.name);
    const kenpom2 = findKenpom(team2.name);

    const injuries1 = getInjuries(team1.name);
    const injuries2 = getInjuries(team2.name);

    const analysis = await generateMatchupAnalysis(
      { name: team1.name, seed: team1.seed, region: team1.region },
      { name: team2.name, seed: team2.seed, region: team2.region },
      {
        spread: game.spreadDetails,
        moneyline1: game.moneylineTeam1,
        moneyline2: game.moneylineTeam2,
        overUnder: game.overUnder,
      },
      game.round,
      kenpom1,
      kenpom2,
      injuries1,
      injuries2
    );

    const now = new Date().toISOString();

    await db
      .update(games)
      .set({ aiAnalysis: analysis, aiAnalysisAt: now })
      .where(eq(games.id, game.id));

    return NextResponse.json({ analysis, generatedAt: now });
  } catch (error) {
    console.error("Analysis generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate analysis" },
      { status: 500 }
    );
  }
}
