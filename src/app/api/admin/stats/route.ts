import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, teams, games, picks, appState } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const teamCount = (await db.select({ count: sql<number>`count(*)` }).from(teams))[0].count;
    const gameCount = (await db.select({ count: sql<number>`count(*)` }).from(games))[0].count;
    const userCount = (await db.select({ count: sql<number>`count(*)` }).from(users))[0].count;
    const pickCount = (await db.select({ count: sql<number>`count(*)` }).from(picks))[0].count;

    const lockedState = await db
      .select()
      .from(appState)
      .where(eq(appState.key, "picks_locked"));
    const locked = lockedState.length > 0 && lockedState[0].value === "true";

    const refreshState = await db
      .select()
      .from(appState)
      .where(eq(appState.key, "last_refresh"));
    const lastRefresh = refreshState.length > 0 ? refreshState[0].value : null;

    return NextResponse.json({
      teamCount,
      gameCount,
      userCount,
      pickCount,
      locked,
      lastRefresh,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
