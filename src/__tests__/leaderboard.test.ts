import { describe, it, expect } from "vitest";

/**
 * Tests for leaderboard aggregation and ranking logic.
 * Extracted from the leaderboard API route to test in isolation.
 */

type PickData = {
  userId: number;
  round: number;
  pointsEarned: number | null;
  isCorrect: number | null;
};

type UserStats = {
  totalPoints: number;
  correctPicks: number;
  totalPicks: number;
  roundBreakdown: [number, number, number, number, number, number];
};

function aggregateStats(allPicks: PickData[], userIds: number[]) {
  const userMap = new Map<number, UserStats>();

  for (const id of userIds) {
    userMap.set(id, {
      totalPoints: 0,
      correctPicks: 0,
      totalPicks: 0,
      roundBreakdown: [0, 0, 0, 0, 0, 0],
    });
  }

  for (const pick of allPicks) {
    const entry = userMap.get(pick.userId);
    if (!entry) continue;

    entry.totalPicks++;
    if (pick.isCorrect === 1) {
      entry.correctPicks++;
      entry.totalPoints += pick.pointsEarned ?? 0;
      const roundIndex = (pick.round ?? 1) - 1;
      if (roundIndex >= 0 && roundIndex < 6) {
        entry.roundBreakdown[roundIndex] += pick.pointsEarned ?? 0;
      }
    }
  }

  return userMap;
}

function assignRanks(entries: { userId: number; totalPoints: number; rank: number }[]) {
  entries.sort((a, b) => b.totalPoints - a.totalPoints);
  let currentRank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].totalPoints < entries[i - 1].totalPoints) {
      currentRank = i + 1;
    }
    entries[i].rank = currentRank;
  }
  return entries;
}

describe("leaderboard aggregation", () => {
  it("aggregates points correctly per user", () => {
    const picks: PickData[] = [
      { userId: 1, round: 1, pointsEarned: 10, isCorrect: 1 },
      { userId: 1, round: 1, pointsEarned: 10, isCorrect: 1 },
      { userId: 1, round: 2, pointsEarned: 20, isCorrect: 1 },
      { userId: 2, round: 1, pointsEarned: 10, isCorrect: 1 },
      { userId: 2, round: 1, pointsEarned: 0, isCorrect: 0 },
    ];

    const stats = aggregateStats(picks, [1, 2]);

    const user1 = stats.get(1)!;
    expect(user1.totalPoints).toBe(40);
    expect(user1.correctPicks).toBe(3);
    expect(user1.totalPicks).toBe(3);
    expect(user1.roundBreakdown[0]).toBe(20); // R1
    expect(user1.roundBreakdown[1]).toBe(20); // R2

    const user2 = stats.get(2)!;
    expect(user2.totalPoints).toBe(10);
    expect(user2.correctPicks).toBe(1);
    expect(user2.totalPicks).toBe(2);
  });

  it("handles null pointsEarned gracefully", () => {
    const picks: PickData[] = [
      { userId: 1, round: 1, pointsEarned: null, isCorrect: 1 },
    ];

    const stats = aggregateStats(picks, [1]);
    const user1 = stats.get(1)!;
    expect(user1.totalPoints).toBe(0);
    expect(user1.correctPicks).toBe(1);
  });

  it("handles users with no picks", () => {
    const stats = aggregateStats([], [1, 2]);
    const user1 = stats.get(1)!;
    expect(user1.totalPoints).toBe(0);
    expect(user1.totalPicks).toBe(0);
    expect(user1.correctPicks).toBe(0);
  });

  it("ignores picks for unknown users", () => {
    const picks: PickData[] = [
      { userId: 99, round: 1, pointsEarned: 10, isCorrect: 1 },
    ];
    const stats = aggregateStats(picks, [1]);
    expect(stats.get(99)).toBeUndefined();
  });

  it("assigns round breakdown to correct index", () => {
    const picks: PickData[] = [
      { userId: 1, round: 3, pointsEarned: 40, isCorrect: 1 },
      { userId: 1, round: 6, pointsEarned: 320, isCorrect: 1 },
    ];

    const stats = aggregateStats(picks, [1]);
    const user1 = stats.get(1)!;
    expect(user1.roundBreakdown[2]).toBe(40);  // R3 -> index 2
    expect(user1.roundBreakdown[5]).toBe(320); // R6 -> index 5
    expect(user1.totalPoints).toBe(360);
  });
});

describe("leaderboard ranking", () => {
  it("ranks users by total points descending", () => {
    const entries = [
      { userId: 1, totalPoints: 100, rank: 0 },
      { userId: 2, totalPoints: 200, rank: 0 },
      { userId: 3, totalPoints: 50, rank: 0 },
    ];

    const ranked = assignRanks(entries);
    expect(ranked[0].userId).toBe(2);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].userId).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].userId).toBe(3);
    expect(ranked[2].rank).toBe(3);
  });

  it("handles ties correctly (same rank)", () => {
    const entries = [
      { userId: 1, totalPoints: 100, rank: 0 },
      { userId: 2, totalPoints: 100, rank: 0 },
      { userId: 3, totalPoints: 50, rank: 0 },
    ];

    const ranked = assignRanks(entries);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1); // Tied with first
    expect(ranked[2].rank).toBe(3); // Skips to 3
  });

  it("handles all users with 0 points", () => {
    const entries = [
      { userId: 1, totalPoints: 0, rank: 0 },
      { userId: 2, totalPoints: 0, rank: 0 },
    ];

    const ranked = assignRanks(entries);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
  });

  it("handles single user", () => {
    const entries = [{ userId: 1, totalPoints: 500, rank: 0 }];
    const ranked = assignRanks(entries);
    expect(ranked[0].rank).toBe(1);
  });
});
