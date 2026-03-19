import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { games, teams, picks, appState } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { refreshScoresIfStale } from "@/lib/refresh-scores";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Auto-refresh scores from ESPN if stale (every 2 min)
    try {
      await refreshScoresIfStale();
    } catch (e) {
      // Don't fail the bracket load if refresh fails
      console.warn("Auto-refresh failed:", e);
    }

    const userId = parseInt(session.user.id);

    const allGames = db
      .select()
      .from(games)
      .orderBy(asc(games.round), asc(games.gameIndex))
      .all();

    const allTeams = db.select().from(teams).all();

    const userPicks = db
      .select()
      .from(picks)
      .where(eq(picks.userId, userId))
      .all();

    const lockedState = db
      .select()
      .from(appState)
      .where(eq(appState.key, "picks_locked"))
      .all();

    const locked = lockedState.length > 0 && lockedState[0].value === "true";

    const hasLiveGames = allGames.some((g) => g.status === "in_progress");

    return NextResponse.json({
      games: allGames,
      teams: allTeams,
      picks: userPicks,
      locked,
      hasLiveGames,
    });
  } catch (error) {
    console.error("Bracket GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lockedState = db
      .select()
      .from(appState)
      .where(eq(appState.key, "picks_locked"))
      .all();

    if (lockedState.length > 0 && lockedState[0].value === "true") {
      return NextResponse.json(
        { error: "Picks are locked" },
        { status: 403 }
      );
    }

    const userId = parseInt(session.user.id);
    const body = await request.json();
    const userPicks: Array<{ gameId: number; pickedTeamId: number }> =
      body.picks;

    if (!Array.isArray(userPicks) || userPicks.length === 0 || userPicks.length > 63) {
      return NextResponse.json(
        { error: "Must submit between 1 and 63 picks" },
        { status: 400 }
      );
    }

    db.delete(picks).where(eq(picks.userId, userId)).run();
    db.insert(picks)
      .values(
        userPicks.map((p) => ({
          userId,
          gameId: p.gameId,
          pickedTeamId: p.pickedTeamId,
        }))
      )
      .run();

    return NextResponse.json({ message: "Bracket saved" });
  } catch (error) {
    console.error("Bracket POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
