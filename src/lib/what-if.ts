import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { POINTS_PER_ROUND } from "@/lib/scoring";
import { getNextGame } from "@/lib/bracket-utils";

export type WhatIfGame = {
  gameId: number;
  round: number;
  region: string;
  team1: { id: number; name: string; abbreviation: string; seed: number; logoUrl: string | null } | null;
  team2: { id: number; name: string; abbreviation: string; seed: number; logoUrl: string | null } | null;
  userPickedTeamId: number;
  pointsIfCorrect: number;
  cascadeLoss: number;
  winProbability: number;
  expectedValue: number;
  roundName: string;
};

export type WhatIfResult = {
  userId: number;
  userName: string;
  currentPoints: number;
  currentRank: number;
  maxPossiblePoints: number;
  bestPossibleRank: number;
  games: WhatIfGame[];
};

const ROUND_NAMES: Record<number, string> = {
  1: "R64", 2: "R32", 3: "S16", 4: "E8", 5: "F4", 6: "Champ",
};

export async function computeWhatIf(userId: number): Promise<WhatIfResult> {
  const allGames = await db.select().from(schema.games);
  const allTeams = await db.select().from(schema.teams);
  const allPicks = await db
    .select({
      userId: schema.picks.userId,
      gameId: schema.picks.gameId,
      pickedTeamId: schema.picks.pickedTeamId,
      isCorrect: schema.picks.isCorrect,
      pointsEarned: schema.picks.pointsEarned,
    })
    .from(schema.picks);
  const allUsers = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(or(eq(schema.users.isSpectator, 0), isNull(schema.users.isSpectator)));

  const teamMap = new Map(allTeams.map((t) => [t.id, t]));
  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  // Build game lookup by round+region+gameIndex
  const gameByKey = new Map<string, typeof allGames[0]>();
  for (const g of allGames) {
    gameByKey.set(`${g.round}-${g.region}-${g.gameIndex}`, g);
  }

  // Build eliminated teams
  const eliminatedTeamIds = new Set<number>();
  for (const game of allGames) {
    if (game.status === "final" && game.winnerTeamId && game.team1Id && game.team2Id) {
      const loserId = game.winnerTeamId === game.team1Id ? game.team2Id : game.team1Id;
      eliminatedTeamIds.add(loserId);
    }
  }

  // User's picks
  const userPicks = allPicks.filter((p) => p.userId === userId);
  const userPickByGame = new Map(userPicks.map((p) => [p.gameId, p]));

  // Current points for all users
  const userPoints = new Map<number, number>();
  for (const user of allUsers) userPoints.set(user.id, 0);
  for (const pick of allPicks) {
    if (pick.isCorrect === 1) {
      userPoints.set(pick.userId, (userPoints.get(pick.userId) ?? 0) + (pick.pointsEarned ?? 0));
    }
  }

  const currentPoints = userPoints.get(userId) ?? 0;

  // Compute current ranks
  const sortedPoints = [...userPoints.entries()].sort((a, b) => b[1] - a[1]);
  let currentRank = 1;
  for (let i = 0; i < sortedPoints.length; i++) {
    if (i > 0 && sortedPoints[i][1] < sortedPoints[i - 1][1]) currentRank = i + 1;
    if (sortedPoints[i][0] === userId) break;
    if (i > 0 && sortedPoints[i][1] < sortedPoints[i - 1][1]) currentRank = i + 1;
  }
  // Fix: properly compute rank
  currentRank = 1;
  for (const [uid, pts] of sortedPoints) {
    if (uid === userId) break;
    if (pts > currentPoints) currentRank++;
  }
  currentRank = sortedPoints.filter(([, pts]) => pts > currentPoints).length + 1;

  // Try to load simulation cache for win probabilities
  let gameOdds: Record<number, { team1Prob: number; team2Prob: number }> = {};
  try {
    const cached = await db
      .select()
      .from(schema.appState)
      .where(eq(schema.appState.key, "simulation_cache_v4"));
    if (cached.length > 0) {
      const parsed = JSON.parse(cached[0].value);
      if (parsed.gameOdds) {
        gameOdds = parsed.gameOdds;
      }
    }
  } catch {
    // No cache available
  }

  // Compute what-if for each upcoming game where user has a pick
  const upcomingGames = allGames.filter(
    (g) => g.status !== "final" && !eliminatedTeamIds.has(userPickByGame.get(g.id)?.pickedTeamId ?? -1)
  );

  const whatIfGames: WhatIfGame[] = [];

  for (const game of upcomingGames) {
    const userPick = userPickByGame.get(game.id);
    if (!userPick) continue;

    const pickedTeamId = userPick.pickedTeamId;
    if (eliminatedTeamIds.has(pickedTeamId)) continue;

    const pointsIfCorrect = POINTS_PER_ROUND[game.round] ?? 0;

    // Compute cascade loss: walk forward through next games
    let cascadeLoss = 0;
    let currentGame = game;
    let currentRound = game.round;
    let currentGameIndex = game.gameIndex;

    while (true) {
      const next = getNextGame(currentRound, currentGameIndex);
      if (!next) break;

      // Find the actual next game in db
      const nextGame = allGames.find(
        (g) => g.round === next.round &&
          (next.round >= 5 ? g.region === "Final Four" : g.region === currentGame.region) &&
          g.gameIndex === next.gameIndex
      );
      if (!nextGame || nextGame.status === "final") break;

      const nextPick = userPickByGame.get(nextGame.id);
      if (nextPick && nextPick.pickedTeamId === pickedTeamId) {
        cascadeLoss += POINTS_PER_ROUND[nextGame.round] ?? 0;
      }

      currentRound = next.round;
      currentGameIndex = next.gameIndex;
      // Update currentGame for region tracking
      if (nextGame) currentGame = nextGame;
    }

    // Win probability from simulation cache
    let winProb = 0.5;
    const odds = gameOdds[game.id];
    if (odds) {
      winProb = pickedTeamId === game.team1Id ? odds.team1Prob : odds.team2Prob;
    }

    const expectedValue = pointsIfCorrect * winProb - cascadeLoss * (1 - winProb);

    const team1 = game.team1Id ? teamMap.get(game.team1Id) : null;
    const team2 = game.team2Id ? teamMap.get(game.team2Id) : null;

    whatIfGames.push({
      gameId: game.id,
      round: game.round,
      region: game.region,
      team1: team1 ? { id: team1.id, name: team1.name, abbreviation: team1.abbreviation, seed: team1.seed, logoUrl: team1.logoUrl } : null,
      team2: team2 ? { id: team2.id, name: team2.name, abbreviation: team2.abbreviation, seed: team2.seed, logoUrl: team2.logoUrl } : null,
      userPickedTeamId: pickedTeamId,
      pointsIfCorrect,
      cascadeLoss,
      winProbability: winProb,
      expectedValue,
      roundName: ROUND_NAMES[game.round] || `R${game.round}`,
    });
  }

  // Sort by absolute expected value descending
  whatIfGames.sort((a, b) => Math.abs(b.expectedValue) - Math.abs(a.expectedValue));

  // Max possible points
  let maxPossible = currentPoints;
  for (const game of whatIfGames) {
    maxPossible += game.pointsIfCorrect;
  }

  // Best possible rank: if user gets all remaining points, what rank?
  const bestPossibleRank = sortedPoints.filter(([uid, pts]) => {
    if (uid === userId) return false;
    return pts > maxPossible;
  }).length + 1;

  return {
    userId,
    userName: userMap.get(userId) ?? "Unknown",
    currentPoints,
    currentRank,
    maxPossiblePoints: maxPossible,
    bestPossibleRank,
    games: whatIfGames,
  };
}
