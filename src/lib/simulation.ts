import { POINTS_PER_ROUND } from "@/lib/scoring";

export type SimGame = {
  id: number;
  round: number;
  region: string;
  gameIndex: number;
  team1Id: number | null;
  team2Id: number | null;
  winnerTeamId: number | null;
  status: string;
};

export type SimTeam = {
  id: number;
  name: string;
  seed: number;
  logoUrl: string | null;
};

export type SimPick = {
  userId: number;
  gameId: number;
  pickedTeamId: number;
};

export type SimulationResult = {
  available: boolean;
  reason?: string;
  remainingGamesCount?: number;
  totalScenarios: number;
  remainingGames: {
    gameId: number;
    round: number;
    region: string;
    team1: SimTeam | null;
    team2: SimTeam | null;
  }[];
  results: UserSimResult[];
};

export type UserSimResult = {
  userId: number;
  name: string;
  currentPoints: number;
  winScenarios: number;
  winProbability: number;
  mustHaveResults: MustHaveResult[];
  bestCase: number;
  worstCase: number;
};

export type MustHaveResult = {
  gameId: number;
  round: number;
  region: string;
  neededWinner: SimTeam;
  opponent: SimTeam | null;
};

const MAX_REMAINING_GAMES = 20;

/**
 * Run a full simulation of all possible remaining outcomes.
 * Returns win probability and path-to-winning for each user.
 */
export function runSimulation(
  allGames: SimGame[],
  teams: Map<number, SimTeam>,
  allPicks: SimPick[],
  users: { id: number; name: string }[]
): SimulationResult {
  const remainingGames = allGames
    .filter((g) => g.status !== "final")
    .sort((a, b) => a.round - b.round || a.gameIndex - b.gameIndex);

  if (remainingGames.length === 0) {
    return {
      available: true,
      totalScenarios: 1,
      remainingGames: [],
      results: buildFinalResults(allGames, teams, allPicks, users),
    };
  }

  if (remainingGames.length > MAX_REMAINING_GAMES) {
    return {
      available: false,
      reason: `Simulation available once the Sweet 16 begins (${remainingGames.length} games remaining, max ${MAX_REMAINING_GAMES})`,
      remainingGamesCount: remainingGames.length,
      totalScenarios: 0,
      remainingGames: [],
      results: [],
    };
  }

  // Compute each user's current points from final games
  const currentPoints = new Map<number, number>();
  const picksByUser = new Map<number, Map<number, number>>(); // userId -> gameId -> pickedTeamId

  for (const user of users) {
    currentPoints.set(user.id, 0);
    picksByUser.set(user.id, new Map());
  }

  for (const pick of allPicks) {
    const userPicks = picksByUser.get(pick.userId);
    if (userPicks) {
      userPicks.set(pick.gameId, pick.pickedTeamId);
    }
  }

  // Calculate current points from finalized games
  for (const game of allGames) {
    if (game.status === "final" && game.winnerTeamId !== null) {
      for (const user of users) {
        const userPicks = picksByUser.get(user.id)!;
        const pickedTeam = userPicks.get(game.id);
        if (pickedTeam === game.winnerTeamId) {
          currentPoints.set(
            user.id,
            (currentPoints.get(user.id) || 0) + (POINTS_PER_ROUND[game.round] || 0)
          );
        }
      }
    }
  }

  // Build game lookup by round+region+gameIndex for winner propagation
  const gameLookup = new Map<string, SimGame>();
  for (const g of allGames) {
    gameLookup.set(`${g.round}-${g.region}-${g.gameIndex}`, g);
  }

  // Enumerate all possible outcomes
  const scenarios: Map<number, number>[] = []; // each scenario = gameId -> winnerId
  const winCounts = new Map<number, number>();
  const userScenarioPoints = new Map<number, number[]>(); // userId -> points per scenario
  const winningScenarioIndices = new Map<number, number[]>(); // userId -> scenario indices where they win

  for (const user of users) {
    winCounts.set(user.id, 0);
    userScenarioPoints.set(user.id, []);
    winningScenarioIndices.set(user.id, []);
  }

  // Recursively enumerate scenarios
  enumerateScenarios(
    remainingGames,
    allGames,
    gameLookup,
    0,
    new Map(),
    scenarios
  );

  // Score each scenario for each user
  for (let si = 0; si < scenarios.length; si++) {
    const scenario = scenarios[si];
    let maxPoints = -1;
    const userPoints: { userId: number; points: number }[] = [];

    for (const user of users) {
      const userPicks = picksByUser.get(user.id)!;
      let points = currentPoints.get(user.id) || 0;

      for (const [gameId, winnerId] of scenario) {
        const pickedTeam = userPicks.get(gameId);
        if (pickedTeam === winnerId) {
          const game = allGames.find((g) => g.id === gameId);
          if (game) {
            points += POINTS_PER_ROUND[game.round] || 0;
          }
        }
      }

      userPoints.push({ userId: user.id, points });
      userScenarioPoints.get(user.id)!.push(points);
      if (points > maxPoints) maxPoints = points;
    }

    // Determine winners (could be ties)
    for (const up of userPoints) {
      if (up.points === maxPoints) {
        winCounts.set(up.userId, (winCounts.get(up.userId) || 0) + 1);
        winningScenarioIndices.get(up.userId)!.push(si);
      }
    }
  }

  const totalScenarios = scenarios.length;

  // Build remaining games info for response
  const remainingGamesInfo = remainingGames.map((g) => ({
    gameId: g.id,
    round: g.round,
    region: g.region,
    team1: g.team1Id ? teams.get(g.team1Id) || null : null,
    team2: g.team2Id ? teams.get(g.team2Id) || null : null,
  }));

  // Build results per user
  const results: UserSimResult[] = users.map((user) => {
    const scenarioPointsList = userScenarioPoints.get(user.id)!;
    const wins = winCounts.get(user.id) || 0;
    const winIndices = winningScenarioIndices.get(user.id)!;

    // Compute must-have results: outcomes common across ALL winning scenarios
    const mustHaveResults = computeMustHaveResults(
      winIndices,
      scenarios,
      remainingGames,
      allGames,
      teams
    );

    return {
      userId: user.id,
      name: user.name,
      currentPoints: currentPoints.get(user.id) || 0,
      winScenarios: wins,
      winProbability: totalScenarios > 0 ? wins / totalScenarios : 0,
      mustHaveResults,
      bestCase: scenarioPointsList.length > 0 ? Math.max(...scenarioPointsList) : 0,
      worstCase: scenarioPointsList.length > 0 ? Math.min(...scenarioPointsList) : 0,
    };
  });

  // Sort by win probability descending, then by current points
  results.sort((a, b) => b.winProbability - a.winProbability || b.currentPoints - a.currentPoints);

  return {
    available: true,
    totalScenarios,
    remainingGames: remainingGamesInfo,
    results,
  };
}

/**
 * Recursively enumerate all valid bracket completions.
 * Handles cascading: winners propagate to fill team slots in later rounds.
 */
function enumerateScenarios(
  remainingGames: SimGame[],
  allGames: SimGame[],
  gameLookup: Map<string, SimGame>,
  index: number,
  currentOutcomes: Map<number, number>, // gameId -> winnerId
  allScenarios: Map<number, number>[]
): void {
  // Skip games that have already been decided in this scenario path
  while (index < remainingGames.length && currentOutcomes.has(remainingGames[index].id)) {
    index++;
  }

  if (index >= remainingGames.length) {
    allScenarios.push(new Map(currentOutcomes));
    return;
  }

  const game = remainingGames[index];

  // Determine the actual teams for this game, considering propagated winners
  const team1Id = getEffectiveTeam(game, "team1", allGames, gameLookup, currentOutcomes);
  const team2Id = getEffectiveTeam(game, "team2", allGames, gameLookup, currentOutcomes);

  if (team1Id === null && team2Id === null) {
    // Both teams TBD and can't be resolved - skip (shouldn't happen in valid bracket)
    return;
  }

  // If only one team is known, that team wins by default
  if (team1Id !== null && team2Id === null) {
    currentOutcomes.set(game.id, team1Id);
    enumerateScenarios(remainingGames, allGames, gameLookup, index + 1, currentOutcomes, allScenarios);
    currentOutcomes.delete(game.id);
    return;
  }
  if (team1Id === null && team2Id !== null) {
    currentOutcomes.set(game.id, team2Id);
    enumerateScenarios(remainingGames, allGames, gameLookup, index + 1, currentOutcomes, allScenarios);
    currentOutcomes.delete(game.id);
    return;
  }

  // Both teams known - branch on both outcomes
  // Team 1 wins
  currentOutcomes.set(game.id, team1Id!);
  enumerateScenarios(remainingGames, allGames, gameLookup, index + 1, currentOutcomes, allScenarios);
  currentOutcomes.delete(game.id);

  // Team 2 wins
  currentOutcomes.set(game.id, team2Id!);
  enumerateScenarios(remainingGames, allGames, gameLookup, index + 1, currentOutcomes, allScenarios);
  currentOutcomes.delete(game.id);
}

/**
 * Get the effective team for a slot, considering scenario outcomes that propagate winners.
 */
function getEffectiveTeam(
  game: SimGame,
  slot: "team1" | "team2",
  allGames: SimGame[],
  gameLookup: Map<string, SimGame>,
  currentOutcomes: Map<number, number>
): number | null {
  const teamId = slot === "team1" ? game.team1Id : game.team2Id;
  if (teamId !== null) return teamId;

  // Team is TBD - figure out which feeder game determines it
  // For rounds 2-4 (within region), feeder games are in same region
  // For round 5 (Final Four), feeders are E8 winners from specific regions
  // For round 6 (Championship), feeders are F4 winners

  const feederInfo = getFeederForSlot(game, slot);
  if (!feederInfo) return null;

  const feederGame = gameLookup.get(
    `${feederInfo.round}-${feederInfo.region}-${feederInfo.gameIndex}`
  );
  if (!feederGame) return null;

  // Check if the feeder game is already final
  if (feederGame.status === "final" && feederGame.winnerTeamId !== null) {
    return feederGame.winnerTeamId;
  }

  // Check if the feeder game has been decided in current scenario
  const scenarioWinner = currentOutcomes.get(feederGame.id);
  if (scenarioWinner !== undefined) return scenarioWinner;

  return null;
}

/**
 * Determine which feeder game fills a given slot in a game.
 */
function getFeederForSlot(
  game: SimGame,
  slot: "team1" | "team2"
): { round: number; region: string; gameIndex: number } | null {
  const REGIONS = ["South", "East", "Midwest", "West"];

  if (game.round === 1) return null; // R1 teams are always pre-set

  if (game.round >= 2 && game.round <= 4) {
    // Within region
    const feederIndex = game.gameIndex * 2 + (slot === "team1" ? 0 : 1);
    return { round: game.round - 1, region: game.region, gameIndex: feederIndex };
  }

  if (game.round === 5) {
    // Final Four: game 0 = South(0) vs East(1), game 1 = Midwest(2) vs West(3)
    const regionIndex = game.gameIndex * 2 + (slot === "team1" ? 0 : 1);
    return { round: 4, region: REGIONS[regionIndex], gameIndex: 0 };
  }

  if (game.round === 6) {
    // Championship: F4 game 0 winner vs F4 game 1 winner
    const f4GameIndex = slot === "team1" ? 0 : 1;
    return { round: 5, region: "Final Four", gameIndex: f4GameIndex };
  }

  return null;
}

/**
 * Compute must-have results: game outcomes that appear in ALL winning scenarios for a user.
 */
function computeMustHaveResults(
  winningIndices: number[],
  allScenarios: Map<number, number>[],
  remainingGames: SimGame[],
  allGames: SimGame[],
  teams: Map<number, SimTeam>
): MustHaveResult[] {
  if (winningIndices.length === 0) return [];

  const mustHave: MustHaveResult[] = [];

  for (const game of remainingGames) {
    // Check if all winning scenarios have the same winner for this game
    let commonWinner: number | null = null;
    let allSame = true;

    for (const si of winningIndices) {
      const scenario = allScenarios[si];
      const winner = scenario.get(game.id);
      if (winner === undefined) continue;

      if (commonWinner === null) {
        commonWinner = winner;
      } else if (winner !== commonWinner) {
        allSame = false;
        break;
      }
    }

    if (allSame && commonWinner !== null) {
      const winnerTeam = teams.get(commonWinner);
      if (!winnerTeam) continue;

      // Determine the opponent
      const gameData = allGames.find((g) => g.id === game.id);
      let opponentId: number | null = null;
      if (gameData) {
        opponentId = gameData.team1Id === commonWinner ? gameData.team2Id : gameData.team1Id;
      }
      const opponentTeam = opponentId ? teams.get(opponentId) || null : null;

      mustHave.push({
        gameId: game.id,
        round: game.round,
        region: game.region,
        neededWinner: winnerTeam,
        opponent: opponentTeam,
      });
    }
  }

  return mustHave;
}

/**
 * When no games remain, just compute final standings.
 */
function buildFinalResults(
  allGames: SimGame[],
  teams: Map<number, SimTeam>,
  allPicks: SimPick[],
  users: { id: number; name: string }[]
): UserSimResult[] {
  const currentPoints = new Map<number, number>();
  const picksByUser = new Map<number, Map<number, number>>();

  for (const user of users) {
    currentPoints.set(user.id, 0);
    picksByUser.set(user.id, new Map());
  }

  for (const pick of allPicks) {
    const userPicks = picksByUser.get(pick.userId);
    if (userPicks) userPicks.set(pick.gameId, pick.pickedTeamId);
  }

  for (const game of allGames) {
    if (game.status === "final" && game.winnerTeamId !== null) {
      for (const user of users) {
        const pickedTeam = picksByUser.get(user.id)!.get(game.id);
        if (pickedTeam === game.winnerTeamId) {
          currentPoints.set(
            user.id,
            (currentPoints.get(user.id) || 0) + (POINTS_PER_ROUND[game.round] || 0)
          );
        }
      }
    }
  }

  const maxPts = Math.max(...Array.from(currentPoints.values()), 0);

  return users.map((user) => {
    const pts = currentPoints.get(user.id) || 0;
    return {
      userId: user.id,
      name: user.name,
      currentPoints: pts,
      winScenarios: pts === maxPts ? 1 : 0,
      winProbability: pts === maxPts ? 1 : 0,
      mustHaveResults: [],
      bestCase: pts,
      worstCase: pts,
    };
  }).sort((a, b) => b.currentPoints - a.currentPoints);
}
