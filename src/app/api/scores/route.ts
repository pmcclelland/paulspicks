import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, teams } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { fetchScoreboard, parseTournamentData, TOURNAMENT_DATES } from "@/lib/espn";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get all tournament games from DB
    const allGames = db
      .select()
      .from(games)
      .orderBy(asc(games.round), asc(games.startTime))
      .all();

    const allTeams = db.select().from(teams).all();
    const teamMap = new Map(allTeams.map((t) => [t.id, t]));

    const gamesWithTeams = allGames.map((game) => ({
      ...game,
      team1: game.team1Id ? teamMap.get(game.team1Id) ?? null : null,
      team2: game.team2Id ? teamMap.get(game.team2Id) ?? null : null,
    }));

    // Also fetch First Four games live from ESPN
    const firstFourGames: any[] = [];
    const firstFourDates = TOURNAMENT_DATES[0] || [];
    for (const dateStr of firstFourDates) {
      try {
        const data = await fetchScoreboard(dateStr);
        if (data.events) {
          const parsed = parseTournamentData(data.events);
          for (const g of parsed.games) {
            if (g.round !== 0) continue;
            firstFourGames.push({
              id: `ff-${g.espnEventId}`,
              round: 0,
              region: g.region,
              gameIndex: g.gameIndex,
              status: g.status,
              startTime: g.startTime,
              venue: g.venue,
              broadcast: g.broadcast,
              team1Score: g.team1Score,
              team2Score: g.team2Score,
              winnerTeamId: null,
              team1: g.team1
                ? {
                    id: -1,
                    espnTeamId: g.team1.espnTeamId,
                    name: g.team1.name,
                    abbreviation: g.team1.abbreviation,
                    seed: g.team1.seed,
                    region: g.team1.region,
                    logoUrl: g.team1.logoUrl,
                  }
                : null,
              team2: g.team2
                ? {
                    id: -2,
                    espnTeamId: g.team2.espnTeamId,
                    name: g.team2.name,
                    abbreviation: g.team2.abbreviation,
                    seed: g.team2.seed,
                    region: g.team2.region,
                    logoUrl: g.team2.logoUrl,
                  }
                : null,
            });
          }
        }
      } catch {
        // Skip if ESPN data unavailable
      }
    }

    return NextResponse.json([...firstFourGames, ...gamesWithTeams]);
  } catch (error) {
    console.error("Scores error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
