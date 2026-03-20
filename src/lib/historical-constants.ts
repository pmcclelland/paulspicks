/**
 * Historical NCAA Tournament averages for comparison.
 * Based on data from 1985-2025 tournaments.
 */

/** Average number of upsets (lower seed wins) per round */
export const HISTORICAL_UPSETS_PER_ROUND: Record<number, number> = {
  1: 5.5,  // Round of 64
  2: 3.2,  // Round of 32
  3: 1.8,  // Sweet 16
  4: 1.2,  // Elite 8
  5: 0.8,  // Final Four
  6: 0.5,  // Championship
};

/** Historical win rate by seed for each round (percentage) */
export const HISTORICAL_SEED_WIN_RATES: Record<number, Record<number, number>> = {
  // Round of 64
  1: {
    1: 99.3, 2: 93.8, 3: 85.1, 4: 79.2,
    5: 64.6, 6: 62.5, 7: 60.4, 8: 50.0,
    9: 50.0, 10: 39.6, 11: 37.5, 12: 35.4,
    13: 20.8, 14: 14.9, 15: 6.3, 16: 0.7,
  },
  // Round of 32
  2: {
    1: 85.0, 2: 70.0, 3: 60.0, 4: 52.0,
    5: 33.0, 6: 38.0, 7: 25.0, 8: 20.0,
    9: 12.0, 10: 18.0, 11: 22.0, 12: 16.0,
    13: 5.0, 14: 2.0, 15: 3.0, 16: 0.5,
  },
  // Sweet 16
  3: {
    1: 70.0, 2: 50.0, 3: 35.0, 4: 25.0,
    5: 15.0, 6: 12.0, 7: 10.0, 8: 8.0,
    9: 5.0, 10: 6.0, 11: 8.0, 12: 4.0,
    13: 1.0, 14: 0.5, 15: 1.0, 16: 0.0,
  },
};

/** Average tournament wins for major conferences (historical) */
export const HISTORICAL_CONFERENCE_TOURNAMENT_WINS: Record<string, number> = {
  "B12": 8.5,
  "SEC": 8.0,
  "B10": 7.5,
  "ACC": 7.0,
  "BE": 6.5,
  "P12": 5.5,
  "MWC": 2.5,
  "Amer": 2.0,
  "WCC": 2.0,
  "A10": 1.5,
};

/** Average margin of victory by round */
export const HISTORICAL_AVERAGE_MARGIN: Record<number, number> = {
  1: 11.2,
  2: 8.5,
  3: 7.8,
  4: 7.2,
  5: 6.5,
  6: 6.0,
};
