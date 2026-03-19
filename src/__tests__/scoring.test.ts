import { describe, it, expect, vi } from "vitest";

// Mock the db module before importing scoring to prevent Turso connection
vi.mock("@/lib/db", () => ({
  db: {},
}));

import { calculatePoints, POINTS_PER_ROUND, MAX_POINTS } from "@/lib/scoring";

describe("scoring", () => {
  describe("POINTS_PER_ROUND", () => {
    it("defines points for all 6 rounds", () => {
      expect(POINTS_PER_ROUND[1]).toBe(10);
      expect(POINTS_PER_ROUND[2]).toBe(20);
      expect(POINTS_PER_ROUND[3]).toBe(40);
      expect(POINTS_PER_ROUND[4]).toBe(80);
      expect(POINTS_PER_ROUND[5]).toBe(160);
      expect(POINTS_PER_ROUND[6]).toBe(320);
    });

    it("doubles each round", () => {
      for (let r = 2; r <= 6; r++) {
        expect(POINTS_PER_ROUND[r]).toBe(POINTS_PER_ROUND[r - 1] * 2);
      }
    });
  });

  describe("MAX_POINTS", () => {
    it("equals the sum of all possible points (1920)", () => {
      // 32*10 + 16*20 + 8*40 + 4*80 + 2*160 + 1*320 = 320+320+320+320+320+320 = 1920
      const total =
        32 * POINTS_PER_ROUND[1] +
        16 * POINTS_PER_ROUND[2] +
        8 * POINTS_PER_ROUND[3] +
        4 * POINTS_PER_ROUND[4] +
        2 * POINTS_PER_ROUND[5] +
        1 * POINTS_PER_ROUND[6];
      expect(total).toBe(MAX_POINTS);
      expect(MAX_POINTS).toBe(1920);
    });
  });

  describe("calculatePoints", () => {
    it("returns correct points for each round", () => {
      expect(calculatePoints(1)).toBe(10);
      expect(calculatePoints(2)).toBe(20);
      expect(calculatePoints(3)).toBe(40);
      expect(calculatePoints(4)).toBe(80);
      expect(calculatePoints(5)).toBe(160);
      expect(calculatePoints(6)).toBe(320);
    });

    it("returns 0 for invalid rounds", () => {
      expect(calculatePoints(0)).toBe(0);
      expect(calculatePoints(7)).toBe(0);
      expect(calculatePoints(-1)).toBe(0);
    });
  });
});
