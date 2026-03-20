import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { ROUND_NAMES } from "@/lib/bracket-utils";
import { POINTS_PER_ROUND } from "@/lib/scoring";

export type FeedEventType =
  | "game_result"
  | "upset"
  | "rank_change"
  | "rare_pick";

export type FeedEvent = {
  id: string;
  type: FeedEventType;
  priority: number; // higher = more important
  timestamp: string;
  title: string;
  description: string;
  teams: Array<{
    name: string;
    abbreviation: string;
    seed: number;
    logoUrl: string | null;
  }>;
  meta?: Record<string, unknown>;
};

export async function computeFeedEvents(): Promise<FeedEvent[]> {
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
  const totalUsers = allUsers.length;

  const events: FeedEvent[] = [];

  // --- Game Results & Upsets ---
  const finalGames = allGames.filter((g) => g.status === "final" && g.winnerTeamId);

  for (const game of finalGames) {
    const winner = teamMap.get(game.winnerTeamId!);
    const team1 = game.team1Id ? teamMap.get(game.team1Id) : null;
    const team2 = game.team2Id ? teamMap.get(game.team2Id) : null;
    if (!winner || !team1 || !team2) continue;

    const loser = winner.id === team1.id ? team2 : team1;

    // Count how many users picked the winner
    const gamePicks = allPicks.filter((p) => p.gameId === game.id);
    const correctCount = gamePicks.filter((p) => p.isCorrect === 1).length;
    const pickPercentage = gamePicks.length > 0 ? Math.round((correctCount / gamePicks.length) * 100) : 0;

    const roundName = ROUND_NAMES[game.round] || `Round ${game.round}`;
    const scoreStr = game.team1Score != null && game.team2Score != null
      ? `${game.team1Score}-${game.team2Score}`
      : "";

    // Check for upset (higher seed number beats lower seed number, 4+ diff)
    const seedDiff = Math.abs(winner.seed - loser.seed);
    const isUpset = winner.seed > loser.seed && seedDiff >= 4;

    if (isUpset) {
      events.push({
        id: `upset-${game.id}`,
        type: "upset",
        priority: 90 + seedDiff,
        timestamp: game.startTime || new Date().toISOString(),
        title: `Upset! ${winner.seed}-seed ${winner.name} knocks off ${loser.seed}-seed ${loser.name}`,
        description: `${scoreStr} in the ${roundName}. ${correctCount}/${gamePicks.length} users saw it coming (${pickPercentage}%).`,
        teams: [winner, loser].map((t) => ({
          name: t.name,
          abbreviation: t.abbreviation,
          seed: t.seed,
          logoUrl: t.logoUrl,
        })),
        meta: { seedDiff, gameId: game.id, round: game.round },
      });
    } else {
      events.push({
        id: `result-${game.id}`,
        type: "game_result",
        priority: 30 + game.round * 5,
        timestamp: game.startTime || new Date().toISOString(),
        title: `${winner.seed}-seed ${winner.name} defeats ${loser.seed}-seed ${loser.name}`,
        description: `${scoreStr} in the ${roundName}. ${correctCount}/${gamePicks.length} users got it right (${pickPercentage}%).`,
        teams: [winner, loser].map((t) => ({
          name: t.name,
          abbreviation: t.abbreviation,
          seed: t.seed,
          logoUrl: t.logoUrl,
        })),
        meta: { gameId: game.id, round: game.round, pickPercentage },
      });
    }
  }

  // --- Rank Changes ---
  // Compute cumulative points per round for each user
  const roundsWithResults = [...new Set(finalGames.map((g) => g.round))].sort();
  if (roundsWithResults.length >= 2) {
    for (let i = 1; i < roundsWithResults.length; i++) {
      const prevRound = roundsWithResults[i - 1];
      const currRound = roundsWithResults[i];

      // Check if current round is fully complete
      const roundGames = allGames.filter((g) => g.round === currRound);
      const roundComplete = roundGames.every((g) => g.status === "final");
      if (!roundComplete) continue;

      // Compute rankings after previous round vs after current round
      const pointsAfterPrev = new Map<number, number>();
      const pointsAfterCurr = new Map<number, number>();

      for (const user of allUsers) {
        pointsAfterPrev.set(user.id, 0);
        pointsAfterCurr.set(user.id, 0);
      }

      for (const pick of allPicks) {
        if (pick.isCorrect !== 1) continue;
        const game = gameMap.get(pick.gameId);
        if (!game) continue;
        const pts = pick.pointsEarned ?? 0;
        if (game.round <= prevRound) {
          pointsAfterPrev.set(pick.userId, (pointsAfterPrev.get(pick.userId) ?? 0) + pts);
        }
        if (game.round <= currRound) {
          pointsAfterCurr.set(pick.userId, (pointsAfterCurr.get(pick.userId) ?? 0) + pts);
        }
      }

      const rankPrev = computeRanks(pointsAfterPrev);
      const rankCurr = computeRanks(pointsAfterCurr);

      const roundName = ROUND_NAMES[currRound] || `Round ${currRound}`;

      for (const user of allUsers) {
        const prevRank = rankPrev.get(user.id) ?? totalUsers;
        const currRank = rankCurr.get(user.id) ?? totalUsers;
        const change = prevRank - currRank; // positive = moved up
        if (Math.abs(change) >= 2) {
          events.push({
            id: `rank-${currRound}-${user.id}`,
            type: "rank_change",
            priority: 60 + Math.abs(change) * 2,
            timestamp: new Date().toISOString(),
            title: `${user.name} ${change > 0 ? "climbs" : "drops"} ${Math.abs(change)} spot${Math.abs(change) !== 1 ? "s" : ""}`,
            description: `Moved from #${prevRank} to #${currRank} after the ${roundName}.`,
            teams: [],
            meta: { userId: user.id, prevRank, currRank, change, round: currRound },
          });
        }
      }
    }
  }

  // --- Rare Picks ---
  const pickCountsByGame = new Map<number, Map<number, number>>();
  const totalPicksByGame = new Map<number, number>();

  for (const pick of allPicks) {
    if (!pickCountsByGame.has(pick.gameId)) {
      pickCountsByGame.set(pick.gameId, new Map());
    }
    const counts = pickCountsByGame.get(pick.gameId)!;
    counts.set(pick.pickedTeamId, (counts.get(pick.pickedTeamId) ?? 0) + 1);
    totalPicksByGame.set(pick.gameId, (totalPicksByGame.get(pick.gameId) ?? 0) + 1);
  }

  for (const pick of allPicks) {
    if (pick.isCorrect !== 1) continue;
    const game = gameMap.get(pick.gameId);
    if (!game || game.round < 2) continue;

    const counts = pickCountsByGame.get(pick.gameId);
    const total = totalPicksByGame.get(pick.gameId) ?? 0;
    const pickCount = counts?.get(pick.pickedTeamId) ?? 0;

    if (total > 0 && pickCount / total < 0.25) {
      const team = teamMap.get(pick.pickedTeamId);
      const userName = userMap.get(pick.userId);
      if (!team || !userName) continue;

      const pct = Math.round((pickCount / total) * 100);
      const roundName = ROUND_NAMES[game.round] || `Round ${game.round}`;

      events.push({
        id: `rare-${pick.gameId}-${pick.userId}`,
        type: "rare_pick",
        priority: 40 + (25 - pct),
        timestamp: game.startTime || new Date().toISOString(),
        title: `${userName} nailed a rare pick`,
        description: `Called ${team.seed}-seed ${team.name} in the ${roundName}. Only ${pct}% of the pool had this pick.`,
        teams: [{
          name: team.name,
          abbreviation: team.abbreviation,
          seed: team.seed,
          logoUrl: team.logoUrl,
        }],
        meta: { userId: pick.userId, pickPercentage: pct, round: game.round },
      });
    }
  }

  // Sort by most recent first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events.slice(0, 30);
}

function computeRanks(points: Map<number, number>): Map<number, number> {
  const sorted = [...points.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map<number, number>();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) {
      rank = i + 1;
    }
    ranks.set(sorted[i][0], rank);
  }
  return ranks;
}

