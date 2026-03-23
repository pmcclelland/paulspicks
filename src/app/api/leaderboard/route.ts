import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, ne, or, isNull } from "drizzle-orm";
import { POINTS_PER_ROUND } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allUsers = await db.select().from(schema.users)
      .where(or(eq(schema.users.isSpectator, 0), isNull(schema.users.isSpectator)));

    const allPicks = await db
      .select({
        userId: schema.picks.userId,
        gameId: schema.picks.gameId,
        pickedTeamId: schema.picks.pickedTeamId,
        round: schema.games.round,
        pointsEarned: schema.picks.pointsEarned,
        isCorrect: schema.picks.isCorrect,
        gameStatus: schema.games.status,
        winnerTeamId: schema.games.winnerTeamId,
      })
      .from(schema.picks)
      .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id));

    // Get championship picks (round 6) for each user
    const championPicks = await db
      .select({
        userId: schema.picks.userId,
        pickedTeamId: schema.picks.pickedTeamId,
        teamName: schema.teams.name,
        abbreviation: schema.teams.abbreviation,
        seed: schema.teams.seed,
        logoUrl: schema.teams.logoUrl,
      })
      .from(schema.picks)
      .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
      .innerJoin(schema.teams, eq(schema.picks.pickedTeamId, schema.teams.id))
      .where(eq(schema.games.round, 6));

    const championMap = new Map<number, { teamName: string; abbreviation: string; seed: number; logoUrl: string | null; pickedTeamId: number }>();
    for (const cp of championPicks) {
      championMap.set(cp.userId, {
        teamName: cp.teamName,
        abbreviation: cp.abbreviation,
        seed: cp.seed,
        logoUrl: cp.logoUrl,
        pickedTeamId: cp.pickedTeamId,
      });
    }

    // Build set of eliminated teams (lost in a completed game)
    const allGames = await db.select().from(schema.games);
    const eliminatedTeamIds = new Set<number>();
    for (const game of allGames) {
      if (game.status === "final" && game.winnerTeamId && game.team1Id && game.team2Id) {
        const loserId = game.winnerTeamId === game.team1Id ? game.team2Id : game.team1Id;
        eliminatedTeamIds.add(loserId);
      }
    }

    // Aggregate per user
    const userMap = new Map<
      number,
      {
        totalPoints: number;
        correctPicks: number;
        totalPicks: number;
        roundBreakdown: [number, number, number, number, number, number];
        pointsRemaining: number;
      }
    >();

    for (const user of allUsers) {
      userMap.set(user.id, {
        totalPoints: 0,
        correctPicks: 0,
        totalPicks: 0,
        roundBreakdown: [0, 0, 0, 0, 0, 0],
        pointsRemaining: 0,
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

      // Points remaining: game not final and picked team still alive
      if (pick.gameStatus !== "final" && !eliminatedTeamIds.has(pick.pickedTeamId)) {
        entry.pointsRemaining += POINTS_PER_ROUND[pick.round ?? 1] ?? 0;
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
          championPick: (() => {
            const cp = championMap.get(user.id);
            if (!cp) return null;
            return {
              teamName: cp.teamName,
              abbreviation: cp.abbreviation,
              seed: cp.seed,
              logoUrl: cp.logoUrl,
              isEliminated: eliminatedTeamIds.has(cp.pickedTeamId),
            };
          })(),
          pointsRemaining: stats.pointsRemaining,
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

    // Get sim bracket user ID if it exists
    const simUserState = await db
      .select()
      .from(schema.appState)
      .where(eq(schema.appState.key, "sim_bracket_user_id"));
    const simBracketUserId = simUserState.length > 0
      ? parseInt(simUserState[0].value)
      : null;

    return NextResponse.json({ leaderboard, simBracketUserId });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
