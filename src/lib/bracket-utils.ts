export const REGIONS = ["South", "East", "Midwest", "West"] as const;

export const ROUND_NAMES: Record<number, string> = {
  0: "First Four",
  1: "Round of 64",
  2: "Round of 32",
  3: "Sweet 16",
  4: "Elite 8",
  5: "Final Four",
  6: "Championship",
};

// Which regions play each other in the Final Four semis
// Convention: regions[0] vs regions[1], regions[2] vs regions[3]
export const FINAL_FOUR_MATCHUPS: [
  [typeof REGIONS[0], typeof REGIONS[1]],
  [typeof REGIONS[2], typeof REGIONS[3]]
] = [
  ["South", "East"],
  ["Midwest", "West"],
];

/**
 * Returns the two feeder game indices from the previous round
 * that feed into the given game.
 */
export function getFeederGames(
  round: number,
  gameIndex: number
): { round: number; gameIndex: number }[] {
  if (round === 1) {
    return []; // Round 1 has no feeder games
  }

  if (round >= 2 && round <= 4) {
    // Within region: each game is fed by two games from previous round
    const feeder1 = gameIndex * 2;
    const feeder2 = gameIndex * 2 + 1;
    return [
      { round: round - 1, gameIndex: feeder1 },
      { round: round - 1, gameIndex: feeder2 },
    ];
  }

  if (round === 5) {
    // Final Four: fed by Elite 8 winners from specific regions
    // Game 0 (semi 1): South (regions[0]) vs East (regions[1]) Elite 8 winners
    // Game 1 (semi 2): Midwest (regions[2]) vs West (regions[3]) Elite 8 winners
    // Elite 8 has gameIndex 0 within each region
    return [
      { round: 4, gameIndex: gameIndex * 2 },
      { round: 4, gameIndex: gameIndex * 2 + 1 },
    ];
  }

  if (round === 6) {
    // Championship: fed by two Final Four games
    return [
      { round: 5, gameIndex: 0 },
      { round: 5, gameIndex: 1 },
    ];
  }

  return [];
}

/**
 * Returns the next game that the winner of this game advances to.
 */
export function getNextGame(
  round: number,
  gameIndex: number
): { round: number; gameIndex: number } | null {
  if (round === 6) {
    return null; // Championship has no next game
  }

  if (round >= 1 && round <= 3) {
    // Within region rounds: winner advances to next round
    return {
      round: round + 1,
      gameIndex: Math.floor(gameIndex / 2),
    };
  }

  if (round === 4) {
    // Elite 8 → Final Four
    // Map region index to Final Four game
    return {
      round: 5,
      gameIndex: Math.floor(gameIndex / 2),
    };
  }

  if (round === 5) {
    // Final Four → Championship
    return {
      round: 6,
      gameIndex: 0,
    };
  }

  return null;
}

/**
 * Returns the number of games per region in a given round.
 */
export function gamesPerRegionInRound(round: number): number {
  if (round >= 1 && round <= 4) {
    return Math.pow(2, 4 - round); // R1=8, R2=4, R3=2, R4=1
  }
  return 0;
}

/**
 * Returns whether the winner fills the team1 or team2 slot in the next game.
 * Even gameIndex -> team1, odd gameIndex -> team2.
 */
export function getSlotInNextGame(
  gameIndex: number
): "team1" | "team2" {
  return gameIndex % 2 === 0 ? "team1" : "team2";
}

type BracketGame = {
  round: number;
  region: string;
  gameIndex: number;
};

/**
 * Generates the initial bracket structure for all 63 tournament games.
 */
export function generateInitialBracket(): BracketGame[] {
  const bracket: BracketGame[] = [];

  // Rounds 1-4: games within each region
  for (let round = 1; round <= 4; round++) {
    const gamesPerRegion = Math.pow(2, 4 - round);

    for (const region of REGIONS) {
      for (let i = 0; i < gamesPerRegion; i++) {
        bracket.push({
          round,
          region,
          gameIndex: i,
        });
      }
    }
  }

  // Round 5: Final Four (2 games)
  bracket.push({ round: 5, region: "Final Four", gameIndex: 0 });
  bracket.push({ round: 5, region: "Final Four", gameIndex: 1 });

  // Round 6: Championship (1 game)
  bracket.push({ round: 6, region: "Final Four", gameIndex: 0 });

  return bracket;
}
