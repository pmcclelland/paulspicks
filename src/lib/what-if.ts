import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { POINTS_PER_ROUND } from "@/lib/scoring";
import { getNextGame, getFeederGames, getSlotInNextGame, REGIONS } from "@/lib/bracket-utils";

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
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  // Build game lookup by region+round+gameIndex
  const gameByKey = new Map<string, typeof allGames[0]>();
  for (const g of allGames) {
    gameByKey.set(`${g.region}|${g.round}|${g.gameIndex}`, g);
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
  const currentRank = [...userPoints.values()].filter((pts) => pts > currentPoints).length + 1;

  // Load simulation cache for win probabilities
  // We use liveTeamOdds (per-team round advancement probabilities) rather than
  // gameOdds because gameOdds for TBD games don't respect bracket slot mapping.
  type TeamOddsEntry = {
    teamId: number;
    r32: number;
    s16: number;
    e8: number;
    f4: number;
    finals: number;
    champion: number;
  };
  let teamOddsById = new Map<number, TeamOddsEntry>();
  try {
    const cached = await db
      .select()
      .from(schema.appState)
      .where(eq(schema.appState.key, "simulation_cache_v4"));
    if (cached.length > 0) {
      const parsed = JSON.parse(cached[0].value);
      const liveTeamOdds: TeamOddsEntry[] = parsed.data?.liveTeamOdds || [];
      for (const t of liveTeamOdds) {
        teamOddsById.set(t.teamId, t);
      }
    }
  } catch {
    // No cache available
  }

  // Get win probability for a team in a specific round using team advancement odds.
  // P(team wins game in round R) = P(team reaches round R+1) / P(team reaches round R)
  // For completed rounds, the team already reached the current round so denominator = 1.
  const ROUND_TO_ODDS_KEY: Record<number, [keyof TeamOddsEntry, keyof TeamOddsEntry]> = {
    1: ["r32", "r32"],      // R1: reaching R32 = winning R1 (all R1 teams start at 100%)
    2: ["s16", "r32"],      // R2: P(S16) / P(R32)
    3: ["e8", "s16"],       // S16: P(E8) / P(S16)
    4: ["f4", "e8"],        // E8: P(F4) / P(E8)
    5: ["finals", "f4"],    // F4: P(Finals) / P(F4)
    6: ["champion", "finals"], // Champ: P(Champ) / P(Finals)
  };

  function getTeamWinProb(teamId: number, round: number): number {
    const odds = teamOddsById.get(teamId);
    if (!odds) return 0.5;

    const keys = ROUND_TO_ODDS_KEY[round];
    if (!keys) return 0.5;

    const [advanceKey, reachKey] = keys;
    const advanceProb = odds[advanceKey] as number;
    const reachProb = round === 1 ? 1 : odds[reachKey] as number;

    // If team has 0% chance of reaching this round, can't compute conditional prob
    if (reachProb <= 0) return 0;

    return Math.min(advanceProb / reachProb, 1);
  }

  // Resolve the effective team in each slot for a game, walking feeder games recursively.
  // Uses actual winners first, then user's picks as fallback.
  function resolveSlotTeam(
    region: string,
    round: number,
    gameIndex: number,
    slot: "team1" | "team2"
  ): number | null {
    const game = gameByKey.get(`${region}|${round}|${gameIndex}`);
    if (!game) return null;

    // If the DB already has a team in this slot, use it
    const dbTeamId = slot === "team1" ? game.team1Id : game.team2Id;
    if (dbTeamId) return dbTeamId;

    // The other slot's team (to avoid resolving the same team twice)
    const otherSlotTeamId = slot === "team1" ? game.team2Id : game.team1Id;

    // Try both feeders and pick the one that doesn't duplicate the other slot
    const feeders = getFeederGames(round, gameIndex);
    for (const feederIdx of (slot === "team1" ? [0, 1] : [1, 0])) {
      const feeder = feeders[feederIdx];
      if (!feeder) continue;

      const feederRegion = round >= 5 ? resolveFeederRegion(round, gameIndex, feederIdx) : region;
      // For F4 feeders, getFeederGames returns gameIndex 0,1 but E8 only has gameIndex 0 per region.
      // The region lookup handles the differentiation, so use gameIndex 0 for cross-region feeders.
      const feederGameIndex = (round === 5 && feeder.round === 4) ? 0 : feeder.gameIndex;
      const feederGame = gameByKey.get(`${feederRegion}|${feeder.round}|${feederGameIndex}`);
      if (!feederGame) continue;

      const resolved = feederGame.winnerTeamId
        || userPickByGame.get(feederGame.id)?.pickedTeamId
        || null;

      // Skip if this resolves to the same team already in the other slot
      if (resolved && resolved !== otherSlotTeamId) return resolved;
    }

    return null;
  }

  // For Final Four / Championship, resolve which region a feeder comes from
  function resolveFeederRegion(round: number, gameIndex: number, feederIdx: number): string {
    if (round === 5) {
      // Semi 0: REGIONS[0] vs REGIONS[1], Semi 1: REGIONS[2] vs REGIONS[3]
      return REGIONS[gameIndex * 2 + feederIdx];
    }
    if (round === 6) {
      // Championship feeders are F4 games 0 and 1
      return "Final Four";
    }
    return "Final Four";
  }

  // Build what-if analysis for each upcoming game where user has a live pick
  const whatIfGames: WhatIfGame[] = [];

  const upcomingGames = allGames.filter(
    (g) => g.status !== "final"
  );

  for (const game of upcomingGames) {
    const userPick = userPickByGame.get(game.id);
    if (!userPick) continue;

    const pickedTeamId = userPick.pickedTeamId;
    if (eliminatedTeamIds.has(pickedTeamId)) continue;

    const pointsIfCorrect = POINTS_PER_ROUND[game.round] ?? 0;

    // Compute cascade loss: walk forward through next games
    let cascadeLoss = 0;
    let walkRegion = game.region;
    let walkRound = game.round;
    let walkGameIndex = game.gameIndex;

    while (true) {
      const next = getNextGame(walkRound, walkGameIndex);
      if (!next) break;

      const nextRegion = next.round >= 5 ? "Final Four" : walkRegion;
      const nextGame = gameByKey.get(`${nextRegion}|${next.round}|${next.gameIndex}`);
      if (!nextGame || nextGame.status === "final") break;

      const nextPick = userPickByGame.get(nextGame.id);
      if (nextPick && nextPick.pickedTeamId === pickedTeamId) {
        cascadeLoss += POINTS_PER_ROUND[nextGame.round] ?? 0;
      }

      walkRound = next.round;
      walkGameIndex = next.gameIndex;
      walkRegion = nextRegion;
    }

    // Win probability from team advancement odds
    const winProb = getTeamWinProb(pickedTeamId, game.round);

    const expectedValue = pointsIfCorrect * winProb - cascadeLoss * (1 - winProb);

    // Resolve display teams for the matchup
    const effectiveTeam1Id = resolveSlotTeam(game.region, game.round, game.gameIndex, "team1");
    const effectiveTeam2Id = resolveSlotTeam(game.region, game.round, game.gameIndex, "team2");

    const team1 = effectiveTeam1Id ? teamMap.get(effectiveTeam1Id) : null;
    const team2 = effectiveTeam2Id ? teamMap.get(effectiveTeam2Id) : null;

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

  // Best possible rank
  const bestPossibleRank = [...userPoints.entries()].filter(([uid, pts]) => {
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
