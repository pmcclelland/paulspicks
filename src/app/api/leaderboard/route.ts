import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allUsers = await db.select().from(schema.users);

    const allPicks = await db
      .select({
        userId: schema.picks.userId,
        round: schema.games.round,
        pointsEarned: schema.picks.pointsEarned,
        isCorrect: schema.picks.isCorrect,
      })
      .from(schema.picks)
      .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id));

    // Aggregate per user
    const userMap = new Map<
      number,
      {
        totalPoints: number;
        correctPicks: number;
        totalPicks: number;
        roundBreakdown: [number, number, number, number, number, number];
      }
    >();

    for (const user of allUsers) {
      userMap.set(user.id, {
        totalPoints: 0,
        correctPicks: 0,
        totalPicks: 0,
        roundBreakdown: [0, 0, 0, 0, 0, 0],
      });
    }

    for (const pick of allPicks) {
      const entry = userMap.get(pick.userId);
      if (!entry) continue;

      entry.totalPicks++;
      if (pick.isCorrect === 1) {
        entry.correctPicks++;
        entry.totalPoints += pick.pointsEarned ?? 0;
        const roundIndex = (pick.round ?? 1) - 1;
        if (roundIndex >= 0 && roundIndex < 6) {
          entry.roundBreakdown[roundIndex] += pick.pointsEarned ?? 0;
        }
      }
    }

    // Build leaderboard sorted by total points descending
    const leaderboard = allUsers
      .map((user) => {
        const stats = userMap.get(user.id)!;
        return {
          userId: user.id,
          name: user.name,
          totalPoints: stats.totalPoints,
          correctPicks: stats.correctPicks,
          totalPicks: stats.totalPicks,
          roundBreakdown: stats.roundBreakdown,
          rank: 0,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    // Assign ranks (handle ties)
    let currentRank = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      if (i > 0 && leaderboard[i].totalPoints < leaderboard[i - 1].totalPoints) {
        currentRank = i + 1;
      }
      leaderboard[i].rank = currentRank;
    }

    return NextResponse.json(leaderboard);
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
