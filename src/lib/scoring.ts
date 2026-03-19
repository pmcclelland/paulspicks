import { db } from "@/lib/db";
import { picks, games } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const POINTS_PER_ROUND: Record<number, number> = {
  1: 10,
  2: 20,
  3: 40,
  4: 80,
  5: 160,
  6: 320,
};

export const MAX_POINTS = 1920;

export function calculatePoints(round: number): number {
  return POINTS_PER_ROUND[round] || 0;
}

export async function scoreUserPicks(userId: number): Promise<{
  totalPoints: number;
  roundBreakdown: [number, number, number, number, number, number];
  correctPicks: number;
  totalPicks: number;
}> {
  const userPicks = await db
    .select({
      pickId: picks.id,
      gameId: picks.gameId,
      pickedTeamId: picks.pickedTeamId,
      isCorrect: picks.isCorrect,
      pointsEarned: picks.pointsEarned,
      round: games.round,
      winnerTeamId: games.winnerTeamId,
      gameStatus: games.status,
    })
    .from(picks)
    .innerJoin(games, eq(picks.gameId, games.id))
    .where(eq(picks.userId, userId));

  const roundBreakdown: [number, number, number, number, number, number] = [
    0, 0, 0, 0, 0, 0,
  ];
  let totalPoints = 0;
  let correctPicks = 0;
  let totalPicks = userPicks.length;

  for (const pick of userPicks) {
    if (pick.gameStatus === "final" && pick.winnerTeamId !== null) {
      if (pick.pickedTeamId === pick.winnerTeamId) {
        const points = calculatePoints(pick.round);
        totalPoints += points;
        roundBreakdown[pick.round - 1] += points;
        correctPicks++;
      }
    }
  }

  return {
    totalPoints,
    roundBreakdown,
    correctPicks,
    totalPicks,
  };
}
