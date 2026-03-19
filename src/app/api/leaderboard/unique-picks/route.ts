import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ROUND_NAMES } from "@/lib/bracket-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allPicks = await db
      .select({
        userId: schema.picks.userId,
        gameId: schema.picks.gameId,
        pickedTeamId: schema.picks.pickedTeamId,
        isCorrect: schema.picks.isCorrect,
      })
      .from(schema.picks);

    const allGames = await db.select().from(schema.games);
    const allTeams = await db.select().from(schema.teams);
    const allUsers = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users);

    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
    const teamMap = new Map(allTeams.map((t) => [t.id, t]));
    const gameMap = new Map(allGames.map((g) => [g.id, g]));

    // Count how many users picked each team for each game
    const pickCounts = new Map<string, { teamId: number; gameId: number; userIds: number[] }>();
    const totalUsersByGame = new Map<number, number>();

    for (const pick of allPicks) {
      const key = `${pick.gameId}-${pick.pickedTeamId}`;
      if (!pickCounts.has(key)) {
        pickCounts.set(key, { teamId: pick.pickedTeamId, gameId: pick.gameId, userIds: [] });
      }
      pickCounts.get(key)!.userIds.push(pick.userId);

      totalUsersByGame.set(pick.gameId, (totalUsersByGame.get(pick.gameId) || 0) + 1);
    }

    // Find the rarest picks
    const uniquePicks: Array<{
      userName: string;
      userId: number;
      teamName: string;
      teamAbbreviation: string;
      teamSeed: number;
      teamLogoUrl: string | null;
      round: number;
      roundName: string;
      pickCount: number;
      totalUsers: number;
      isCorrect: number | null;
      gameStatus: string;
    }> = [];

    for (const [, data] of pickCounts) {
      const game = gameMap.get(data.gameId);
      const team = teamMap.get(data.teamId);
      if (!game || !team) continue;

      // Only include picks from R2+ (R1 picks are less interesting for uniqueness)
      if (game.round < 2) continue;

      const total = totalUsersByGame.get(data.gameId) || 0;

      for (const userId of data.userIds) {
        // Find this user's pick record to get isCorrect
        const pickRecord = allPicks.find(
          (p) => p.userId === userId && p.gameId === data.gameId
        );

        uniquePicks.push({
          userName: userMap.get(userId) || "Unknown",
          userId,
          teamName: team.name,
          teamAbbreviation: team.abbreviation,
          teamSeed: team.seed,
          teamLogoUrl: team.logoUrl,
          round: game.round,
          roundName: ROUND_NAMES[game.round] || `Round ${game.round}`,
          pickCount: data.userIds.length,
          totalUsers: total,
          isCorrect: pickRecord?.isCorrect ?? null,
          gameStatus: game.status,
        });
      }
    }

    // Sort by rarity (fewest picks first), then by round (later rounds more impressive)
    uniquePicks.sort((a, b) => {
      // First by pick count ascending
      if (a.pickCount !== b.pickCount) return a.pickCount - b.pickCount;
      // Then by round descending (later rounds more interesting)
      return b.round - a.round;
    });

    // Take top 10
    const top = uniquePicks.slice(0, 10);

    return NextResponse.json(top);
  } catch (error) {
    console.error("Unique picks error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
