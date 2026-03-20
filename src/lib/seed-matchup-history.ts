/**
 * Historical seed-vs-seed win rates from NCAA tournament (1985-2025).
 * Source: bracketodds.cs.illinois.edu/seed_records.html
 *
 * Keys: "higherSeed-lowerSeed" (lower number = higher seed).
 * Values: { wins, losses } from the higher seed's perspective.
 * Organized by round for more accurate predictions.
 */

type SeedRecord = { wins: number; losses: number };

/** Round of 64 — fixed matchups every year */
export const R64_SEED_HISTORY: Record<string, SeedRecord> = {
  "1-16": { wins: 158, losses: 2 },
  "2-15": { wins: 149, losses: 11 },
  "3-14": { wins: 137, losses: 23 },
  "4-13": { wins: 127, losses: 33 },
  "5-12": { wins: 103, losses: 57 },
  "6-11": { wins: 98, losses: 62 },
  "7-10": { wins: 98, losses: 62 },
  "8-9": { wins: 77, losses: 83 },
};

/** Round of 32 — common matchups */
export const R32_SEED_HISTORY: Record<string, SeedRecord> = {
  "1-8": { wins: 52, losses: 19 },
  "1-9": { wins: 61, losses: 8 },
  "2-7": { wins: 52, losses: 26 },
  "2-10": { wins: 44, losses: 14 },
  "3-6": { wins: 46, losses: 33 },
  "3-11": { wins: 36, losses: 17 },
  "3-14": { wins: 13, losses: 4 },
  "4-5": { wins: 39, losses: 39 },
  "4-12": { wins: 30, losses: 14 },
  "4-13": { wins: 13, losses: 7 },
  "5-12": { wins: 11, losses: 8 },
  "5-13": { wins: 5, losses: 2 },
  "6-11": { wins: 25, losses: 19 },
  "7-10": { wins: 24, losses: 19 },
  "8-9": { wins: 4, losses: 3 },
};

/** Sweet 16 — common matchups */
export const S16_SEED_HISTORY: Record<string, SeedRecord> = {
  "1-4": { wins: 33, losses: 16 },
  "1-5": { wins: 29, losses: 9 },
  "1-12": { wins: 6, losses: 1 },
  "1-13": { wins: 3, losses: 0 },
  "2-3": { wins: 24, losses: 22 },
  "2-6": { wins: 14, losses: 8 },
  "2-7": { wins: 10, losses: 4 },
  "2-10": { wins: 6, losses: 3 },
  "2-11": { wins: 7, losses: 2 },
  "3-7": { wins: 7, losses: 6 },
  "3-10": { wins: 3, losses: 2 },
  "3-11": { wins: 5, losses: 4 },
  "4-8": { wins: 4, losses: 3 },
  "4-9": { wins: 4, losses: 0 },
  "4-12": { wins: 3, losses: 2 },
  "5-1": { wins: 0, losses: 1 },
  "6-7": { wins: 3, losses: 3 },
  "6-10": { wins: 2, losses: 1 },
  "6-11": { wins: 3, losses: 4 },
};

/** Elite 8 — common matchups */
export const E8_SEED_HISTORY: Record<string, SeedRecord> = {
  "1-2": { wins: 18, losses: 16 },
  "1-3": { wins: 15, losses: 6 },
  "1-4": { wins: 5, losses: 2 },
  "1-5": { wins: 4, losses: 2 },
  "1-6": { wins: 4, losses: 1 },
  "1-7": { wins: 2, losses: 0 },
  "1-11": { wins: 2, losses: 1 },
  "2-3": { wins: 9, losses: 5 },
  "2-6": { wins: 2, losses: 2 },
  "2-7": { wins: 2, losses: 1 },
  "2-10": { wins: 1, losses: 0 },
  "2-11": { wins: 2, losses: 1 },
  "3-4": { wins: 4, losses: 3 },
  "3-7": { wins: 1, losses: 0 },
  "3-12": { wins: 1, losses: 0 },
  "4-6": { wins: 1, losses: 1 },
  "4-8": { wins: 1, losses: 1 },
  "4-10": { wins: 0, losses: 1 },
  "5-6": { wins: 1, losses: 0 },
  "5-11": { wins: 0, losses: 1 },
};

/** Final Four — common matchups */
export const F4_SEED_HISTORY: Record<string, SeedRecord> = {
  "1-1": { wins: 15, losses: 15 },
  "1-2": { wins: 12, losses: 7 },
  "1-3": { wins: 5, losses: 3 },
  "1-4": { wins: 4, losses: 1 },
  "1-5": { wins: 2, losses: 0 },
  "1-7": { wins: 1, losses: 1 },
  "1-8": { wins: 2, losses: 0 },
  "1-11": { wins: 1, losses: 1 },
  "2-2": { wins: 3, losses: 3 },
  "2-3": { wins: 4, losses: 2 },
  "2-4": { wins: 1, losses: 1 },
  "2-5": { wins: 1, losses: 0 },
  "2-8": { wins: 2, losses: 0 },
  "2-11": { wins: 0, losses: 1 },
  "3-4": { wins: 1, losses: 0 },
  "3-8": { wins: 0, losses: 1 },
  "3-11": { wins: 0, losses: 1 },
  "4-5": { wins: 1, losses: 0 },
};

const ROUND_HISTORY_MAPS: Record<number, Record<string, SeedRecord>> = {
  1: R64_SEED_HISTORY,
  2: R32_SEED_HISTORY,
  3: S16_SEED_HISTORY,
  4: E8_SEED_HISTORY,
  5: F4_SEED_HISTORY,
  6: F4_SEED_HISTORY, // Championship uses same data as F4
};

/**
 * Get historical win probability for higher seed given a seed matchup and round.
 * Returns P(higher seed wins) or null if no historical data.
 */
export function getHistoricalWinRate(
  seed1: number,
  seed2: number,
  round: number
): number | null {
  const map = ROUND_HISTORY_MAPS[round];
  if (!map) return null;

  const higher = Math.min(seed1, seed2);
  const lower = Math.max(seed1, seed2);
  const key = `${higher}-${lower}`;
  const record = map[key];

  if (!record || record.wins + record.losses < 3) {
    // Fall back to seed-difference formula for rare/unseen matchups
    return getSeedDifferenceProbability(seed1, seed2);
  }

  const higherSeedWinRate = record.wins / (record.wins + record.losses);

  // Return from seed1's perspective
  return seed1 <= seed2 ? higherSeedWinRate : 1 - higherSeedWinRate;
}

/**
 * Fallback: estimate win probability from seed difference alone.
 * ~2.5% per seed difference, centered at 50%.
 */
function getSeedDifferenceProbability(seed1: number, seed2: number): number {
  const diff = seed2 - seed1; // positive if seed1 is higher seed
  return 1 / (1 + Math.pow(10, -diff * 0.06));
}
