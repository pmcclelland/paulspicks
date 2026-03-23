import { getNextGame, getSlotInNextGame, REGIONS } from "@/lib/bracket-utils";
import {
  getWinProbability,
  type SimTeam,
  type SimGame,
} from "@/lib/simulation";
import { fairProbabilities } from "@/lib/odds";

export type SimBracketPick = {
  gameId: number;
  pickedTeamId: number;
};

export type SimBracketResult = {
  picks: SimBracketPick[];
  confidences: Record<number, number>; // gameId -> confidence (win frequency)
};

export type GameOddsEntry = {
  moneylineTeam1: string;
  moneylineTeam2: string;
};

export type KenPomDetails = {
  adjO: number;
  adjD: number;
};

const DEFAULT_SIM_COUNT = 10000;

/**
 * Simple seedable PRNG (mulberry32). Used for deterministic testing.
 */
export function seededRandom(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute the enhanced P(team1 wins) for a game, incorporating
 * Vegas odds, luck regression, and stylistic matchup edge.
 */
function getEnhancedProbability(
  team1: SimTeam,
  team2: SimTeam,
  round: number,
  gameId: number,
  kenpomMap: Map<string, number>,
  injuryPenalties?: Map<number, number>,
  gameOdds?: Map<number, GameOddsEntry>,
  luckMap?: Map<string, number>,
  kenpomDetails?: Map<string, KenPomDetails>
): number {
  // Base probability: 70% KenPom + 30% historical seed matchup
  let prob = getWinProbability(team1, team2, round, kenpomMap, injuryPenalties);

  // Blend with Vegas odds when available (50/50 blend with model)
  if (gameOdds) {
    const odds = gameOdds.get(gameId);
    if (odds) {
      const vegas = fairProbabilities(odds.moneylineTeam1, odds.moneylineTeam2);
      prob = 0.5 * prob + 0.5 * vegas.team1;
    }
  }

  // Luck regression: penalize teams that have been winning beyond their efficiency
  if (luckMap) {
    const t1Luck = luckMap.get(team1.name.toLowerCase());
    const t2Luck = luckMap.get(team2.name.toLowerCase());
    if (t1Luck !== undefined && t2Luck !== undefined) {
      const luckDiff = t1Luck - t2Luck;
      // team1 is luckier → decrease their win prob (regression toward mean)
      if (luckDiff > 0.04) prob -= 0.02;
      // team2 is luckier → increase team1's win prob
      else if (luckDiff < -0.04) prob += 0.02;
    }
  }

  // Stylistic matchup edge from adjO/adjD splits
  if (kenpomDetails) {
    const d1 = kenpomDetails.get(team1.name.toLowerCase());
    const d2 = kenpomDetails.get(team2.name.toLowerCase());
    if (d1 && d2) {
      // Positive = team2's offense exploits team1's defense more than vice versa
      const t2Edge = (d2.adjO - d1.adjD) - (d1.adjO - d2.adjD);
      if (t2Edge > 4) prob -= Math.min((t2Edge - 4) * 0.005, 0.02);
      else if (t2Edge < -4) prob += Math.min((-t2Edge - 4) * 0.005, 0.02);
    }
  }

  return Math.max(0.01, Math.min(0.99, prob));
}

/**
 * Advance a winner to the next game slot.
 */
function advanceWinner(
  game: SimGame,
  round: number,
  winnerId: number,
  gameMap: Map<string, SimGame>,
  simSlots: Map<number, { team1Id: number | null; team2Id: number | null }>
) {
  const gameKey = (region: string, r: number, idx: number) =>
    `${region}|${r}|${idx}`;

  if (round >= 1 && round <= 3) {
    const next = getNextGame(round, game.gameIndex);
    if (next) {
      const slot = getSlotInNextGame(game.gameIndex);
      const nextGame = gameMap.get(gameKey(game.region, next.round, next.gameIndex));
      if (nextGame) {
        const nextSlots = simSlots.get(nextGame.id)!;
        if (slot === "team1") nextSlots.team1Id = winnerId;
        else nextSlots.team2Id = winnerId;
      }
    }
  } else if (round === 4) {
    const regionIndex = REGIONS.indexOf(game.region as (typeof REGIONS)[number]);
    if (regionIndex >= 0) {
      const f4GameIndex = Math.floor(regionIndex / 2);
      const slot = regionIndex % 2 === 0 ? "team1" : "team2";
      const nextGame = gameMap.get(gameKey("Final Four", 5, f4GameIndex));
      if (nextGame) {
        const nextSlots = simSlots.get(nextGame.id)!;
        if (slot === "team1") nextSlots.team1Id = winnerId;
        else nextSlots.team2Id = winnerId;
      }
    }
  } else if (round === 5) {
    const next = getNextGame(round, game.gameIndex);
    if (next) {
      const slot = getSlotInNextGame(game.gameIndex);
      const nextGame = gameMap.get(gameKey("Final Four", next.round, next.gameIndex));
      if (nextGame) {
        const nextSlots = simSlots.get(nextGame.id)!;
        if (slot === "team1") nextSlots.team1Id = winnerId;
        else nextSlots.team2Id = winnerId;
      }
    }
  }
}

/**
 * Generate a sim bracket using Monte Carlo simulation.
 *
 * Runs N full tournament simulations where each game outcome is randomly
 * sampled based on enhanced win probabilities (KenPom + historical + Vegas
 * odds + luck regression + matchup edge). For each game, picks the team
 * that won most often across all simulations. Confidence = win frequency.
 *
 * This captures cascading effects that single-pass approaches miss:
 * a weaker team on an easier path may be a better pick than a stronger
 * team in a brutal bracket region.
 */
export function generateSimBracket(
  games: SimGame[],
  teamsById: Map<number, SimTeam>,
  kenpomMap: Map<string, number>,
  injuryPenalties?: Map<number, number>,
  gameOdds?: Map<number, GameOddsEntry>,
  luckMap?: Map<string, number>,
  kenpomDetails?: Map<string, KenPomDetails>,
  simCount: number = DEFAULT_SIM_COUNT,
  randomFn: () => number = Math.random
): SimBracketResult {
  const gameKey = (region: string, round: number, idx: number) =>
    `${region}|${round}|${idx}`;
  const gameMap = new Map<string, SimGame>();
  for (const g of games) {
    gameMap.set(gameKey(g.region, g.round, g.gameIndex), g);
  }

  // Pre-group games by round to avoid repeated filtering
  const gamesByRound = new Map<number, SimGame[]>();
  for (let r = 1; r <= 6; r++) {
    gamesByRound.set(r, games.filter((g) => g.round === r));
  }

  // Track win counts per game: gameId -> (teamId -> count)
  const winCounts = new Map<number, Map<number, number>>();
  for (const g of games) {
    winCounts.set(g.id, new Map());
  }

  // Run N simulations
  for (let sim = 0; sim < simCount; sim++) {
    // Initialize game slots for this simulation
    const simSlots = new Map<
      number,
      { team1Id: number | null; team2Id: number | null }
    >();
    for (const g of games) {
      simSlots.set(g.id, { team1Id: g.team1Id, team2Id: g.team2Id });
    }

    // Simulate round by round
    for (let round = 1; round <= 6; round++) {
      const roundGames = gamesByRound.get(round)!;

      for (const game of roundGames) {
        const slots = simSlots.get(game.id)!;
        const t1 = slots.team1Id ? teamsById.get(slots.team1Id) : null;
        const t2 = slots.team2Id ? teamsById.get(slots.team2Id) : null;

        let winnerId: number;

        if (t1 && t2) {
          const prob = getEnhancedProbability(
            t1, t2, round, game.id,
            kenpomMap, injuryPenalties, gameOdds, luckMap, kenpomDetails
          );
          winnerId = randomFn() < prob ? t1.id : t2.id;
        } else if (t1) {
          winnerId = t1.id;
        } else if (t2) {
          winnerId = t2.id;
        } else {
          continue;
        }

        // Record win
        const gameCounts = winCounts.get(game.id)!;
        gameCounts.set(winnerId, (gameCounts.get(winnerId) || 0) + 1);

        // Advance winner to next round
        advanceWinner(game, round, winnerId, gameMap, simSlots);
      }
    }
  }

  // Pick majority winner per game
  const picks: SimBracketPick[] = [];
  const confidences: Record<number, number> = {};

  // Process in round order for consistent output
  const sortedGames = [...games].sort(
    (a, b) => a.round - b.round || a.gameIndex - b.gameIndex
  );

  for (const game of sortedGames) {
    const gameCounts = winCounts.get(game.id)!;
    if (gameCounts.size === 0) continue;

    let bestTeamId = 0;
    let bestCount = 0;
    for (const [teamId, count] of gameCounts) {
      if (count > bestCount) {
        bestTeamId = teamId;
        bestCount = count;
      }
    }

    picks.push({ gameId: game.id, pickedTeamId: bestTeamId });
    confidences[game.id] = bestCount / simCount;
  }

  return { picks, confidences };
}
