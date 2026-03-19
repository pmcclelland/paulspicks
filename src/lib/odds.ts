/**
 * Convert American odds to implied probability (0-1).
 */
export function impliedProbability(americanOdds: string): number {
  const odds = parseInt(americanOdds, 10);
  if (isNaN(odds)) return 0;
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Remove vig and return fair probabilities for both teams.
 */
export function fairProbabilities(
  team1Odds: string,
  team2Odds: string
): { team1: number; team2: number } {
  const p1 = impliedProbability(team1Odds);
  const p2 = impliedProbability(team2Odds);
  const total = p1 + p2;
  if (total === 0) return { team1: 0.5, team2: 0.5 };
  return {
    team1: p1 / total,
    team2: p2 / total,
  };
}

/**
 * Format American odds with +/- sign for display.
 */
export function formatOdds(odds: string): string {
  const num = parseInt(odds, 10);
  if (isNaN(num)) return odds;
  return num > 0 ? `+${num}` : `${num}`;
}

export type UpsetLevel = "potential" | "alert" | null;

export function detectUpset(
  team1Seed: number,
  team2Seed: number,
  team1Odds: string | null | undefined,
  team2Odds: string | null | undefined,
  status: string
): { level: UpsetLevel; underdogSlot: "team1" | "team2" | null; probability: number } {
  if (status === "final" || !team1Odds || !team2Odds) {
    return { level: null, underdogSlot: null, probability: 0 };
  }
  if (team1Seed === team2Seed) {
    return { level: null, underdogSlot: null, probability: 0 };
  }

  const probs = fairProbabilities(team1Odds, team2Odds);
  const underdogSlot = team1Seed > team2Seed ? "team1" : "team2";
  const underdogProb = underdogSlot === "team1" ? probs.team1 : probs.team2;

  if (underdogProb >= 0.50) {
    return { level: "alert", underdogSlot, probability: underdogProb };
  }
  if (underdogProb >= 0.35) {
    return { level: "potential", underdogSlot, probability: underdogProb };
  }
  return { level: null, underdogSlot: null, probability: underdogProb };
}
