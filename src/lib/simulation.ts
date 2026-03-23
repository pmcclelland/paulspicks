import { getNextGame, getSlotInNextGame, REGIONS } from "@/lib/bracket-utils";
import { schoolName } from "@/lib/school-names";
import { getHistoricalWinRate } from "@/lib/seed-matchup-history";

// Duplicated from scoring.ts to avoid importing db at module level
const POINTS_PER_ROUND: Record<number, number> = {
  1: 10, 2: 20, 3: 40, 4: 80, 5: 160, 6: 320,
};

// Types for simulation inputs
export type SimTeam = {
  id: number;
  name: string;
  abbreviation: string;
  seed: number;
  region: string;
  logoUrl: string | null;
};

export type SimGame = {
  id: number;
  round: number;
  region: string;
  gameIndex: number;
  team1Id: number | null;
  team2Id: number | null;
  status?: string;
  winnerTeamId?: number | null;
};

export type KenPomEntry = {
  teamName: string;
  adjEM: string | null;
};

export type SimPick = {
  gameId: number;
  pickedTeamId: number;
};

// Output types
export type TeamOdds = {
  teamId: number;
  name: string;
  abbreviation: string;
  seed: number;
  region: string;
  logoUrl: string | null;
  r32: number;
  s16: number;
  e8: number;
  f4: number;
  finals: number;
  champion: number;
};

export type UserProjection = {
  userId: number;
  name: string;
  expectedPoints: number;
  medianPoints: number;
  winProbability: number;
  p10Points: number;
  p90Points: number;
  championPick?: {
    teamName: string;
    abbreviation: string;
    seed: number;
    logoUrl: string | null;
  } | null;
};

/**
 * Build a map from team name (via schoolName) to adjEM value.
 */
export function buildKenPomMap(
  kenpomData: KenPomEntry[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of kenpomData) {
    if (entry.adjEM !== null) {
      map.set(entry.teamName.toLowerCase(), parseFloat(entry.adjEM));
    }
  }
  return map;
}

/**
 * Look up KenPom adjEM for a team. Tries schoolName mapping first,
 * then falls back to substring matching.
 */
export function lookupAdjEM(
  teamName: string,
  kenpomMap: Map<string, number>
): number | null {
  // Try exact match via schoolName
  const school = schoolName(teamName).toLowerCase();
  if (kenpomMap.has(school)) return kenpomMap.get(school)!;

  // Try the raw name lowered
  const lower = teamName.toLowerCase();
  if (kenpomMap.has(lower)) return kenpomMap.get(lower)!;

  // Substring fallback — strip parentheses for matching (e.g. "Miami (OH)" vs "Miami OH")
  const schoolNorm = school.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  for (const [kenpomName, em] of kenpomMap) {
    const kenpomNorm = kenpomName.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
    if (kenpomNorm.includes(schoolNorm) || schoolNorm.includes(kenpomNorm)) {
      return em;
    }
  }

  return null;
}

/**
 * Injury status -> adjEM penalty (negative = weaker).
 * "Out" players definitively miss the game: -1.5 per player.
 * "Game Time Decision" players may or may not play: -0.5 per player.
 * "Day-To-Day" is similar uncertainty: -0.3 per player.
 * These are rough estimates — losing a key rotation player is ~1-2 pts of efficiency.
 */
const INJURY_PENALTY: Record<string, number> = {
  "Out": -1.5,
  "Out For Season": -1.5,
  "Out Indefinitely": -1.5,
  "Game Time Decision": -0.5,
  "GTD": -0.5,
  "Day-To-Day": -0.3,
  "Doubtful": -1.0,
  "Questionable": -0.5,
  "Probable": -0.1,
};

/**
 * Compute total adjEM penalty for a team's injuries.
 */
export function computeInjuryPenalty(
  injuries: { status: string }[]
): number {
  let penalty = 0;
  for (const inj of injuries) {
    // Try exact match first, then case-insensitive partial
    const exact = INJURY_PENALTY[inj.status];
    if (exact !== undefined) {
      penalty += exact;
    } else {
      const lower = inj.status.toLowerCase();
      for (const [key, val] of Object.entries(INJURY_PENALTY)) {
        if (lower.includes(key.toLowerCase())) {
          penalty += val;
          break;
        }
      }
    }
  }
  // Cap penalty — even a devastated team doesn't lose more than ~6 adjEM
  return Math.max(penalty, -6);
}

/**
 * Compute win probability for team1 over team2 using blended model.
 * Returns P(team1 wins) between 0 and 1.
 * injuryPenalties: map of teamId -> adjEM penalty (negative values)
 */
export function getWinProbability(
  team1: SimTeam,
  team2: SimTeam,
  round: number,
  kenpomMap: Map<string, number>,
  injuryPenalties?: Map<number, number>
): number {
  let em1 = lookupAdjEM(team1.name, kenpomMap);
  let em2 = lookupAdjEM(team2.name, kenpomMap);

  // Apply injury penalties
  if (injuryPenalties) {
    if (em1 !== null) em1 += injuryPenalties.get(team1.id) ?? 0;
    if (em2 !== null) em2 += injuryPenalties.get(team2.id) ?? 0;
  }

  let kenpomProb: number | null = null;
  if (em1 !== null && em2 !== null) {
    const diff = em1 - em2;
    kenpomProb = 1 / (1 + Math.pow(10, -diff / 10));
  }

  const historicalProb = getHistoricalWinRate(team1.seed, team2.seed, round);

  if (kenpomProb !== null && historicalProb !== null) {
    return 0.7 * kenpomProb + 0.3 * historicalProb;
  }
  if (kenpomProb !== null) return kenpomProb;
  if (historicalProb !== null) return historicalProb;

  // Ultimate fallback: 50/50
  return 0.5;
}

/**
 * Simulate the entire 63-game tournament from scratch.
 * Returns a map of gameId -> winning teamId.
 */
export function simulateTournament(
  games: SimGame[],
  teamsById: Map<number, SimTeam>,
  kenpomMap: Map<string, number>,
  injuryPenalties?: Map<number, number>
): Map<number, number> {
  // Build lookup: (region, round, gameIndex) -> game
  const gameKey = (region: string, round: number, idx: number) =>
    `${region}|${round}|${idx}`;
  const gameMap = new Map<string, SimGame>();
  for (const g of games) {
    gameMap.set(gameKey(g.region, g.round, g.gameIndex), g);
  }

  // Track simulated teams in each game slot
  // key: gameId, value: { team1Id, team2Id }
  const simSlots = new Map<number, { team1Id: number | null; team2Id: number | null }>();

  // Initialize R1 games with their seeded teams
  for (const g of games) {
    simSlots.set(g.id, { team1Id: g.team1Id, team2Id: g.team2Id });
  }

  const winners = new Map<number, number>();

  // Process rounds 1-6 in order
  for (let round = 1; round <= 6; round++) {
    const roundGames = games.filter((g) => g.round === round);

    for (const game of roundGames) {
      const slots = simSlots.get(game.id)!;
      const t1 = slots.team1Id ? teamsById.get(slots.team1Id) : null;
      const t2 = slots.team2Id ? teamsById.get(slots.team2Id) : null;

      let winnerId: number;
      if (t1 && t2) {
        const prob = getWinProbability(t1, t2, round, kenpomMap, injuryPenalties);
        winnerId = Math.random() < prob ? t1.id : t2.id;
      } else if (t1) {
        winnerId = t1.id;
      } else if (t2) {
        winnerId = t2.id;
      } else {
        continue; // No teams — skip
      }

      winners.set(game.id, winnerId);

      // Advance winner to next game
      if (round >= 1 && round <= 3) {
        // Within-region rounds: next game is in same region
        const next = getNextGame(round, game.gameIndex);
        if (next) {
          const slot = getSlotInNextGame(game.gameIndex);
          const nextGame = gameMap.get(gameKey(game.region, next.round, next.gameIndex));
          if (nextGame) {
            const nextSlots = simSlots.get(nextGame.id)!;
            if (slot === "team1") {
              nextSlots.team1Id = winnerId;
            } else {
              nextSlots.team2Id = winnerId;
            }
          }
        }
      } else if (round === 4) {
        // E8 → Final Four: use region index as flat gameIndex
        // REGIONS: [South=0, East=1, Midwest=2, West=3]
        // F4 game 0: regions[0] (team1) vs regions[1] (team2)
        // F4 game 1: regions[2] (team1) vs regions[3] (team2)
        const regionIndex = REGIONS.indexOf(game.region as typeof REGIONS[number]);
        if (regionIndex >= 0) {
          const f4GameIndex = Math.floor(regionIndex / 2);
          const slot = regionIndex % 2 === 0 ? "team1" : "team2";
          const nextGame = gameMap.get(gameKey("Final Four", 5, f4GameIndex));
          if (nextGame) {
            const nextSlots = simSlots.get(nextGame.id)!;
            if (slot === "team1") {
              nextSlots.team1Id = winnerId;
            } else {
              nextSlots.team2Id = winnerId;
            }
          }
        }
      } else if (round === 5) {
        // Final Four -> Championship
        const next = getNextGame(round, game.gameIndex);
        if (next) {
          const slot = getSlotInNextGame(game.gameIndex);
          const nextGame = gameMap.get(gameKey("Final Four", next.round, next.gameIndex));
          if (nextGame) {
            const nextSlots = simSlots.get(nextGame.id)!;
            if (slot === "team1") {
              nextSlots.team1Id = winnerId;
            } else {
              nextSlots.team2Id = winnerId;
            }
          }
        }
      }
      // Round 6 has no next game
    }
  }

  return winners;
}

/**
 * Simulate the tournament respecting actual results.
 * Completed games use their actual winner. Remaining games are simulated.
 * This gives "live odds" that account for the current tournament state.
 */
export function simulateTournamentWithActuals(
  games: SimGame[],
  teamsById: Map<number, SimTeam>,
  kenpomMap: Map<string, number>,
  injuryPenalties?: Map<number, number>
): Map<number, number> {
  const gameKey = (region: string, round: number, idx: number) =>
    `${region}|${round}|${idx}`;
  const gameMap = new Map<string, SimGame>();
  for (const g of games) {
    gameMap.set(gameKey(g.region, g.round, g.gameIndex), g);
  }

  const simSlots = new Map<number, { team1Id: number | null; team2Id: number | null }>();
  for (const g of games) {
    simSlots.set(g.id, { team1Id: g.team1Id, team2Id: g.team2Id });
  }

  const winners = new Map<number, number>();

  function advanceWinner(game: SimGame, round: number, winnerId: number) {
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
      const regionIndex = REGIONS.indexOf(game.region as typeof REGIONS[number]);
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

  for (let round = 1; round <= 6; round++) {
    const roundGames = games.filter((g) => g.round === round);

    for (const game of roundGames) {
      // If game is completed, use actual winner
      if (game.status === "final" && game.winnerTeamId) {
        winners.set(game.id, game.winnerTeamId);
        advanceWinner(game, round, game.winnerTeamId);
        continue;
      }

      // Otherwise simulate
      const slots = simSlots.get(game.id)!;
      const t1 = slots.team1Id ? teamsById.get(slots.team1Id) : null;
      const t2 = slots.team2Id ? teamsById.get(slots.team2Id) : null;

      let winnerId: number;
      if (t1 && t2) {
        const prob = getWinProbability(t1, t2, round, kenpomMap, injuryPenalties);
        winnerId = Math.random() < prob ? t1.id : t2.id;
      } else if (t1) {
        winnerId = t1.id;
      } else if (t2) {
        winnerId = t2.id;
      } else {
        continue;
      }

      winners.set(game.id, winnerId);
      advanceWinner(game, round, winnerId);
    }
  }

  return winners;
}

/**
 * Run N tournament simulations and aggregate team advancement frequencies.
 */
export function runSimulations(
  games: SimGame[],
  teams: SimTeam[],
  kenpomMap: Map<string, number>,
  n: number = 10000,
  injuryPenalties?: Map<number, number>
): {
  teamOdds: TeamOdds[];
  simulationResults: Map<number, number>[]; // Array of (gameId -> winnerId) maps
} {
  const teamsById = new Map<number, SimTeam>();
  for (const t of teams) teamsById.set(t.id, t);

  // Build a map of gameId -> round for quick lookups
  const gameRound = new Map<number, number>();
  for (const g of games) gameRound.set(g.id, g.round);

  // Track per-team advancement counts
  // Round mapping: R1 win = made R32, R2 win = made S16, etc.
  const advancementCounts = new Map<
    number,
    { r32: number; s16: number; e8: number; f4: number; finals: number; champion: number }
  >();
  for (const t of teams) {
    advancementCounts.set(t.id, { r32: 0, s16: 0, e8: 0, f4: 0, finals: 0, champion: 0 });
  }

  const simulationResults: Map<number, number>[] = [];

  for (let i = 0; i < n; i++) {
    const winners = simulateTournament(games, teamsById, kenpomMap, injuryPenalties);
    simulationResults.push(winners);

    // Count advancements
    for (const [gameId, winnerId] of winners) {
      const round = gameRound.get(gameId)!;
      const counts = advancementCounts.get(winnerId);
      if (!counts) continue;

      switch (round) {
        case 1: counts.r32++; break;
        case 2: counts.s16++; break;
        case 3: counts.e8++; break;
        case 4: counts.f4++; break;
        case 5: counts.finals++; break;
        case 6: counts.champion++; break;
      }
    }
  }

  const teamOdds: TeamOdds[] = teams.map((t) => {
    const counts = advancementCounts.get(t.id)!;
    return {
      teamId: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      seed: t.seed,
      region: t.region,
      logoUrl: t.logoUrl,
      r32: counts.r32 / n,
      s16: counts.s16 / n,
      e8: counts.e8 / n,
      f4: counts.f4 / n,
      finals: counts.finals / n,
      champion: counts.champion / n,
    };
  });

  return { teamOdds, simulationResults };
}

/**
 * Run N simulations that respect actual results (completed games locked in).
 * Only simulates remaining/undecided games.
 */
export function runSimulationsWithActuals(
  games: SimGame[],
  teams: SimTeam[],
  kenpomMap: Map<string, number>,
  n: number = 10000,
  injuryPenalties?: Map<number, number>
): {
  teamOdds: TeamOdds[];
  simulationResults: Map<number, number>[];
} {
  const teamsById = new Map<number, SimTeam>();
  for (const t of teams) teamsById.set(t.id, t);

  const gameRound = new Map<number, number>();
  for (const g of games) gameRound.set(g.id, g.round);

  const advancementCounts = new Map<
    number,
    { r32: number; s16: number; e8: number; f4: number; finals: number; champion: number }
  >();
  for (const t of teams) {
    advancementCounts.set(t.id, { r32: 0, s16: 0, e8: 0, f4: 0, finals: 0, champion: 0 });
  }

  const simulationResults: Map<number, number>[] = [];

  for (let i = 0; i < n; i++) {
    const winners = simulateTournamentWithActuals(games, teamsById, kenpomMap, injuryPenalties);
    simulationResults.push(winners);

    for (const [gameId, winnerId] of winners) {
      const round = gameRound.get(gameId)!;
      const counts = advancementCounts.get(winnerId);
      if (!counts) continue;

      switch (round) {
        case 1: counts.r32++; break;
        case 2: counts.s16++; break;
        case 3: counts.e8++; break;
        case 4: counts.f4++; break;
        case 5: counts.finals++; break;
        case 6: counts.champion++; break;
      }
    }
  }

  const teamOdds: TeamOdds[] = teams.map((t) => {
    const counts = advancementCounts.get(t.id)!;
    return {
      teamId: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      seed: t.seed,
      region: t.region,
      logoUrl: t.logoUrl,
      r32: counts.r32 / n,
      s16: counts.s16 / n,
      e8: counts.e8 / n,
      f4: counts.f4 / n,
      finals: counts.finals / n,
      champion: counts.champion / n,
    };
  });

  return { teamOdds, simulationResults };
}

/**
 * Evaluate each user's bracket against simulation results.
 */
export function evaluateUserBrackets(
  simulationResults: Map<number, number>[],
  userPicks: { userId: number; name: string; picks: SimPick[]; isSpectator: boolean; championPick?: { teamName: string; abbreviation: string; seed: number; logoUrl: string | null } | null }[],
  games: SimGame[]
): UserProjection[] {
  const gameRound = new Map<number, number>();
  for (const g of games) gameRound.set(g.id, g.round);

  const n = simulationResults.length;
  const userScores = new Map<number, number[]>();

  // Non-spectator users only
  const activeUsers = userPicks.filter((u) => !u.isSpectator);

  for (const user of activeUsers) {
    userScores.set(user.userId, []);
  }

  // Score each user against each simulation
  for (const simWinners of simulationResults) {
    const scores: { userId: number; score: number }[] = [];

    for (const user of activeUsers) {
      let score = 0;
      for (const pick of user.picks) {
        const simWinner = simWinners.get(pick.gameId);
        if (simWinner === pick.pickedTeamId) {
          const round = gameRound.get(pick.gameId)!;
          score += POINTS_PER_ROUND[round] || 0;
        }
      }
      scores.push({ userId: user.userId, score });
      userScores.get(user.userId)!.push(score);
    }

    // Determine winner of this simulation (highest score)
    if (scores.length > 0) {
      const maxScore = Math.max(...scores.map((s) => s.score));
      // In case of tie, all tied users get a fractional win
      const winners = scores.filter((s) => s.score === maxScore);
      for (const w of winners) {
        const arr = userScores.get(w.userId)!;
        // Mark this as a win by storing a sentinel — actually let's track wins separately
      }
    }
  }

  // Now compute projections
  const winCounts = new Map<number, number>();
  for (const user of activeUsers) {
    winCounts.set(user.userId, 0);
  }

  // Re-evaluate wins (need to compare across users per simulation)
  for (const simWinners of simulationResults) {
    let maxScore = -1;
    const simScores: { userId: number; score: number }[] = [];

    for (const user of activeUsers) {
      let score = 0;
      for (const pick of user.picks) {
        const simWinner = simWinners.get(pick.gameId);
        if (simWinner === pick.pickedTeamId) {
          const round = gameRound.get(pick.gameId)!;
          score += POINTS_PER_ROUND[round] || 0;
        }
      }
      simScores.push({ userId: user.userId, score });
      if (score > maxScore) maxScore = score;
    }

    const winners = simScores.filter((s) => s.score === maxScore);
    const share = 1 / winners.length;
    for (const w of winners) {
      winCounts.set(w.userId, (winCounts.get(w.userId) || 0) + share);
    }
  }

  return activeUsers.map((user) => {
    const scores = userScores.get(user.userId)!;
    scores.sort((a, b) => a - b);

    const sum = scores.reduce((a, b) => a + b, 0);
    const expectedPoints = Math.round(sum / n);
    const medianPoints = Math.round(scores[Math.floor(n * 0.5)]);
    const p10Points = Math.round(scores[Math.floor(n * 0.1)]);
    const p90Points = Math.round(scores[Math.floor(n * 0.9)]);
    const winProbability = (winCounts.get(user.userId) || 0) / n;

    return {
      userId: user.userId,
      name: user.name,
      expectedPoints,
      medianPoints,
      winProbability,
      p10Points,
      p90Points,
      championPick: user.championPick,
    };
  });
}
