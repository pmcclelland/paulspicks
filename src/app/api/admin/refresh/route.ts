import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { doRefreshScores } from "@/lib/refresh-scores";
import { sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Reset R2+ game assignments if requested (fixes mismatched ESPN event IDs)
    const reset = request.nextUrl.searchParams.get("reset") === "true";
    if (reset) {
      await db.update(games)
        .set({
          espnEventId: null,
          team1Id: null,
          team2Id: null,
          team1Score: null,
          team2Score: null,
          winnerTeamId: null,
          status: "scheduled",
          spreadLine: null,
          spreadDetails: null,
          moneylineTeam1: null,
          moneylineTeam2: null,
          overUnder: null,
          oddsProvider: null,
          startTime: null,
          venue: null,
          broadcast: null,
          statusDetail: null,
          aiAnalysis: null,
          aiAnalysisAt: null,
        })
        .where(sql`${games.round} >= 2`);
    }

    const { updatedGames, scoredPicks } = await doRefreshScores();

    return NextResponse.json({
      message: `Updated ${updatedGames} games, scored ${scoredPicks} picks`,
      updatedGames,
      scoredPicks,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
