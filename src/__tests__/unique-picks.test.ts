import { describe, it, expect } from "vitest";

/**
 * Tests for unique picks computation logic.
 */

type Pick = {
  userId: number;
  gameId: number;
  pickedTeamId: number;
  isCorrect: number | null;
};

function computePickRarity(picks: Pick[]) {
  // Count how many users picked each team for each game
  const pickCounts = new Map<string, { teamId: number; gameId: number; userIds: number[] }>();
  const totalUsersByGame = new Map<number, number>();

  for (const pick of picks) {
    const key = `${pick.gameId}-${pick.pickedTeamId}`;
    if (!pickCounts.has(key)) {
      pickCounts.set(key, { teamId: pick.pickedTeamId, gameId: pick.gameId, userIds: [] });
    }
    pickCounts.get(key)!.userIds.push(pick.userId);
    totalUsersByGame.set(pick.gameId, (totalUsersByGame.get(pick.gameId) || 0) + 1);
  }

  return { pickCounts, totalUsersByGame };
}

describe("unique picks computation", () => {
  it("identifies picks made by only one user", () => {
    const picks: Pick[] = [
      { userId: 1, gameId: 100, pickedTeamId: 5, isCorrect: 1 },  // Only user 1 picks team 5
      { userId: 2, gameId: 100, pickedTeamId: 6, isCorrect: 0 },  // Users 2 and 3 pick team 6
      { userId: 3, gameId: 100, pickedTeamId: 6, isCorrect: 0 },
    ];

    const { pickCounts, totalUsersByGame } = computePickRarity(picks);

    const team5Entry = pickCounts.get("100-5")!;
    expect(team5Entry.userIds).toHaveLength(1);
    expect(team5Entry.userIds[0]).toBe(1);

    const team6Entry = pickCounts.get("100-6")!;
    expect(team6Entry.userIds).toHaveLength(2);

    expect(totalUsersByGame.get(100)).toBe(3);
  });

  it("handles game with all users picking same team", () => {
    const picks: Pick[] = [
      { userId: 1, gameId: 200, pickedTeamId: 10, isCorrect: 1 },
      { userId: 2, gameId: 200, pickedTeamId: 10, isCorrect: 1 },
      { userId: 3, gameId: 200, pickedTeamId: 10, isCorrect: 1 },
    ];

    const { pickCounts } = computePickRarity(picks);
    const entry = pickCounts.get("200-10")!;
    expect(entry.userIds).toHaveLength(3); // Not unique at all
  });

  it("handles multiple games correctly", () => {
    const picks: Pick[] = [
      { userId: 1, gameId: 100, pickedTeamId: 5, isCorrect: 1 },
      { userId: 2, gameId: 100, pickedTeamId: 6, isCorrect: 0 },
      { userId: 1, gameId: 200, pickedTeamId: 10, isCorrect: null },
      { userId: 2, gameId: 200, pickedTeamId: 10, isCorrect: null },
    ];

    const { pickCounts, totalUsersByGame } = computePickRarity(picks);

    expect(totalUsersByGame.get(100)).toBe(2);
    expect(totalUsersByGame.get(200)).toBe(2);

    // Game 100: both picks are unique (only 1 user each)
    expect(pickCounts.get("100-5")!.userIds).toHaveLength(1);
    expect(pickCounts.get("100-6")!.userIds).toHaveLength(1);

    // Game 200: both users picked same team
    expect(pickCounts.get("200-10")!.userIds).toHaveLength(2);
  });

  it("sorts by rarity (fewest picks first)", () => {
    const picks: Pick[] = [
      { userId: 1, gameId: 100, pickedTeamId: 5, isCorrect: 1 },
      { userId: 2, gameId: 100, pickedTeamId: 6, isCorrect: 0 },
      { userId: 3, gameId: 100, pickedTeamId: 6, isCorrect: 0 },
      { userId: 4, gameId: 100, pickedTeamId: 6, isCorrect: 0 },
    ];

    const { pickCounts } = computePickRarity(picks);

    const entries = Array.from(pickCounts.values());
    entries.sort((a, b) => a.userIds.length - b.userIds.length);

    expect(entries[0].teamId).toBe(5);      // 1 user
    expect(entries[0].userIds).toHaveLength(1);
    expect(entries[1].teamId).toBe(6);      // 3 users
    expect(entries[1].userIds).toHaveLength(3);
  });
});
