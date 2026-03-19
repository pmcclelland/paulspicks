import { describe, it, expect } from "vitest";
import {
  getFeederGames,
  getNextGame,
  getSlotInNextGame,
  gamesPerRegionInRound,
  generateInitialBracket,
  REGIONS,
  ROUND_NAMES,
} from "@/lib/bracket-utils";

describe("bracket-utils", () => {
  describe("REGIONS", () => {
    it("has exactly 4 regions", () => {
      expect(REGIONS).toHaveLength(4);
    });

    it("contains South, East, Midwest, West", () => {
      expect(REGIONS).toContain("South");
      expect(REGIONS).toContain("East");
      expect(REGIONS).toContain("Midwest");
      expect(REGIONS).toContain("West");
    });
  });

  describe("ROUND_NAMES", () => {
    it("maps all rounds 0-6", () => {
      expect(ROUND_NAMES[0]).toBe("First Four");
      expect(ROUND_NAMES[1]).toBe("Round of 64");
      expect(ROUND_NAMES[2]).toBe("Round of 32");
      expect(ROUND_NAMES[3]).toBe("Sweet 16");
      expect(ROUND_NAMES[4]).toBe("Elite 8");
      expect(ROUND_NAMES[5]).toBe("Final Four");
      expect(ROUND_NAMES[6]).toBe("Championship");
    });
  });

  describe("gamesPerRegionInRound", () => {
    it("returns correct counts for each round", () => {
      expect(gamesPerRegionInRound(1)).toBe(8);
      expect(gamesPerRegionInRound(2)).toBe(4);
      expect(gamesPerRegionInRound(3)).toBe(2);
      expect(gamesPerRegionInRound(4)).toBe(1);
    });

    it("returns 0 for Final Four and Championship rounds", () => {
      expect(gamesPerRegionInRound(5)).toBe(0);
      expect(gamesPerRegionInRound(6)).toBe(0);
    });
  });

  describe("getFeederGames", () => {
    it("returns empty array for round 1", () => {
      expect(getFeederGames(1, 0)).toEqual([]);
      expect(getFeederGames(1, 7)).toEqual([]);
    });

    it("returns correct feeders for round 2", () => {
      // R2 game 0 is fed by R1 games 0 and 1
      expect(getFeederGames(2, 0)).toEqual([
        { round: 1, gameIndex: 0 },
        { round: 1, gameIndex: 1 },
      ]);
      // R2 game 1 is fed by R1 games 2 and 3
      expect(getFeederGames(2, 1)).toEqual([
        { round: 1, gameIndex: 2 },
        { round: 1, gameIndex: 3 },
      ]);
      // R2 game 3 is fed by R1 games 6 and 7
      expect(getFeederGames(2, 3)).toEqual([
        { round: 1, gameIndex: 6 },
        { round: 1, gameIndex: 7 },
      ]);
    });

    it("returns correct feeders for round 3 (Sweet 16)", () => {
      expect(getFeederGames(3, 0)).toEqual([
        { round: 2, gameIndex: 0 },
        { round: 2, gameIndex: 1 },
      ]);
      expect(getFeederGames(3, 1)).toEqual([
        { round: 2, gameIndex: 2 },
        { round: 2, gameIndex: 3 },
      ]);
    });

    it("returns correct feeders for round 4 (Elite 8)", () => {
      expect(getFeederGames(4, 0)).toEqual([
        { round: 3, gameIndex: 0 },
        { round: 3, gameIndex: 1 },
      ]);
    });

    it("returns correct feeders for round 5 (Final Four)", () => {
      // Semi 0: regions[0] vs regions[1] E8 winners
      expect(getFeederGames(5, 0)).toEqual([
        { round: 4, gameIndex: 0 },
        { round: 4, gameIndex: 1 },
      ]);
      // Semi 1: regions[2] vs regions[3] E8 winners
      expect(getFeederGames(5, 1)).toEqual([
        { round: 4, gameIndex: 2 },
        { round: 4, gameIndex: 3 },
      ]);
    });

    it("returns correct feeders for round 6 (Championship)", () => {
      expect(getFeederGames(6, 0)).toEqual([
        { round: 5, gameIndex: 0 },
        { round: 5, gameIndex: 1 },
      ]);
    });
  });

  describe("getNextGame", () => {
    it("returns null for championship (round 6)", () => {
      expect(getNextGame(6, 0)).toBeNull();
    });

    it("advances R1 games correctly", () => {
      expect(getNextGame(1, 0)).toEqual({ round: 2, gameIndex: 0 });
      expect(getNextGame(1, 1)).toEqual({ round: 2, gameIndex: 0 });
      expect(getNextGame(1, 2)).toEqual({ round: 2, gameIndex: 1 });
      expect(getNextGame(1, 3)).toEqual({ round: 2, gameIndex: 1 });
      expect(getNextGame(1, 6)).toEqual({ round: 2, gameIndex: 3 });
      expect(getNextGame(1, 7)).toEqual({ round: 2, gameIndex: 3 });
    });

    it("advances R2 games correctly", () => {
      expect(getNextGame(2, 0)).toEqual({ round: 3, gameIndex: 0 });
      expect(getNextGame(2, 1)).toEqual({ round: 3, gameIndex: 0 });
      expect(getNextGame(2, 2)).toEqual({ round: 3, gameIndex: 1 });
      expect(getNextGame(2, 3)).toEqual({ round: 3, gameIndex: 1 });
    });

    it("advances E8 to Final Four", () => {
      expect(getNextGame(4, 0)).toEqual({ round: 5, gameIndex: 0 });
      expect(getNextGame(4, 1)).toEqual({ round: 5, gameIndex: 0 });
    });

    it("advances Final Four to Championship", () => {
      expect(getNextGame(5, 0)).toEqual({ round: 6, gameIndex: 0 });
      expect(getNextGame(5, 1)).toEqual({ round: 6, gameIndex: 0 });
    });
  });

  describe("getSlotInNextGame", () => {
    it("even index -> team1", () => {
      expect(getSlotInNextGame(0)).toBe("team1");
      expect(getSlotInNextGame(2)).toBe("team1");
      expect(getSlotInNextGame(4)).toBe("team1");
    });

    it("odd index -> team2", () => {
      expect(getSlotInNextGame(1)).toBe("team2");
      expect(getSlotInNextGame(3)).toBe("team2");
      expect(getSlotInNextGame(7)).toBe("team2");
    });
  });

  describe("generateInitialBracket", () => {
    const bracket = generateInitialBracket();

    it("generates exactly 63 games", () => {
      expect(bracket).toHaveLength(63);
    });

    it("has 32 R1 games (8 per region)", () => {
      const r1 = bracket.filter((g) => g.round === 1);
      expect(r1).toHaveLength(32);
      for (const region of REGIONS) {
        const regionR1 = r1.filter((g) => g.region === region);
        expect(regionR1).toHaveLength(8);
      }
    });

    it("has 16 R2 games (4 per region)", () => {
      const r2 = bracket.filter((g) => g.round === 2);
      expect(r2).toHaveLength(16);
    });

    it("has 8 Sweet 16 games (2 per region)", () => {
      const r3 = bracket.filter((g) => g.round === 3);
      expect(r3).toHaveLength(8);
    });

    it("has 4 Elite 8 games (1 per region)", () => {
      const r4 = bracket.filter((g) => g.round === 4);
      expect(r4).toHaveLength(4);
    });

    it("has 2 Final Four games", () => {
      const r5 = bracket.filter((g) => g.round === 5);
      expect(r5).toHaveLength(2);
      expect(r5.every((g) => g.region === "Final Four")).toBe(true);
    });

    it("has 1 Championship game", () => {
      const r6 = bracket.filter((g) => g.round === 6);
      expect(r6).toHaveLength(1);
      expect(r6[0].region).toBe("Final Four");
    });
  });

  describe("bracket advancement consistency", () => {
    it("every non-R1 game has exactly 2 feeder games", () => {
      const bracket = generateInitialBracket();
      for (const game of bracket) {
        if (game.round === 1) continue;
        const feeders = getFeederGames(game.round, game.gameIndex);
        expect(feeders).toHaveLength(2);
      }
    });

    it("every non-championship game has a next game", () => {
      const bracket = generateInitialBracket();
      for (const game of bracket) {
        if (game.round === 6) continue;
        // Only test within-region rounds (1-4) and FF
        if (game.round >= 1 && game.round <= 5) {
          const next = getNextGame(game.round, game.gameIndex);
          expect(next).not.toBeNull();
        }
      }
    });

    it("feeder/next-game relationship is consistent", () => {
      // For each R1 game, advancing to next game should make this game a feeder of that next game
      for (let idx = 0; idx < 8; idx++) {
        const next = getNextGame(1, idx)!;
        const feeders = getFeederGames(next.round, next.gameIndex);
        const feederIndices = feeders.map((f) => f.gameIndex);
        expect(feederIndices).toContain(idx);
      }
    });
  });
});
