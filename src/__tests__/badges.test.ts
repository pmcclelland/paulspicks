import { describe, it, expect } from "vitest";

/**
 * Tests for badge computation logic.
 * Extracted from the badges API route to test in isolation.
 */

type Pick = {
  userId: number;
  gameId: number;
  pickedTeamId: number;
  isCorrect: number | null;
  pointsEarned: number;
};

type Game = {
  id: number;
  round: number;
  region: string;
  gameIndex: number;
  team1Id: number | null;
  team2Id: number | null;
  winnerTeamId: number | null;
  status: string;
  team1Score: number | null;
  team2Score: number | null;
};

type Team = {
  id: number;
  name: string;
  abbreviation: string;
  seed: number;
};

function getSeed(teamId: number, teamMap: Map<number, Team>) {
  return teamMap.get(teamId)?.seed ?? 0;
}

function isUpsetPick(gameId: number, pickedTeamId: number, gameMap: Map<number, Game>, teamMap: Map<number, Team>) {
  const game = gameMap.get(gameId);
  if (!game || !game.team1Id || !game.team2Id) return false;
  const seed1 = getSeed(game.team1Id, teamMap);
  const seed2 = getSeed(game.team2Id, teamMap);
  const pickedSeed = getSeed(pickedTeamId, teamMap);
  const otherSeed = pickedTeamId === game.team1Id ? seed2 : seed1;
  return pickedSeed > otherSeed;
}

describe("isUpsetPick", () => {
  const teams: Team[] = [
    { id: 1, name: "Duke", abbreviation: "DUKE", seed: 1 },
    { id: 2, name: "Norfolk State", abbreviation: "NSU", seed: 16 },
    { id: 3, name: "Kansas", abbreviation: "KU", seed: 4 },
    { id: 4, name: "Vermont", abbreviation: "UVM", seed: 13 },
  ];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const games: Game[] = [
    { id: 100, round: 1, region: "East", gameIndex: 0, team1Id: 1, team2Id: 2, winnerTeamId: null, status: "scheduled", team1Score: null, team2Score: null },
    { id: 101, round: 1, region: "East", gameIndex: 3, team1Id: 3, team2Id: 4, winnerTeamId: null, status: "scheduled", team1Score: null, team2Score: null },
  ];
  const gameMap = new Map(games.map((g) => [g.id, g]));

  it("picking the 16-seed over the 1-seed is an upset pick", () => {
    expect(isUpsetPick(100, 2, gameMap, teamMap)).toBe(true);
  });

  it("picking the 1-seed over the 16-seed is NOT an upset pick", () => {
    expect(isUpsetPick(100, 1, gameMap, teamMap)).toBe(false);
  });

  it("picking the 13-seed over the 4-seed is an upset pick", () => {
    expect(isUpsetPick(101, 4, gameMap, teamMap)).toBe(true);
  });

  it("returns false for game with missing teams", () => {
    const incompleteGameMap = new Map<number, Game>([
      [200, { id: 200, round: 2, region: "East", gameIndex: 0, team1Id: 1, team2Id: null, winnerTeamId: null, status: "scheduled", team1Score: null, team2Score: null }],
    ]);
    expect(isUpsetPick(200, 1, incompleteGameMap, teamMap)).toBe(false);
  });
});

describe("Chaos Agent badge", () => {
  it("counts correct upset picks per user", () => {
    const teams: Team[] = [
      { id: 1, name: "Duke", abbreviation: "DUKE", seed: 1 },
      { id: 2, name: "Norfolk State", abbreviation: "NSU", seed: 16 },
      { id: 3, name: "Kansas", abbreviation: "KU", seed: 4 },
      { id: 4, name: "Vermont", abbreviation: "UVM", seed: 13 },
    ];
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    const games: Game[] = [
      { id: 100, round: 1, region: "East", gameIndex: 0, team1Id: 1, team2Id: 2, winnerTeamId: 2, status: "final", team1Score: 60, team2Score: 65 },
      { id: 101, round: 1, region: "East", gameIndex: 3, team1Id: 3, team2Id: 4, winnerTeamId: 4, status: "final", team1Score: 55, team2Score: 58 },
    ];
    const gameMap = new Map(games.map((g) => [g.id, g]));

    const picks: Pick[] = [
      // User 1: picked both upsets correctly
      { userId: 1, gameId: 100, pickedTeamId: 2, isCorrect: 1, pointsEarned: 10 },
      { userId: 1, gameId: 101, pickedTeamId: 4, isCorrect: 1, pointsEarned: 10 },
      // User 2: picked one upset correctly, one wrong
      { userId: 2, gameId: 100, pickedTeamId: 2, isCorrect: 1, pointsEarned: 10 },
      { userId: 2, gameId: 101, pickedTeamId: 3, isCorrect: 0, pointsEarned: 0 },
    ];

    // Count correct upset picks per user
    const picksByUser = new Map<number, typeof picks>();
    for (const pick of picks) {
      if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, []);
      picksByUser.get(pick.userId)!.push(pick);
    }

    let chaosAgent: { userId: number; count: number } | null = null;
    for (const [userId, userPicks] of picksByUser) {
      let count = 0;
      for (const pick of userPicks) {
        if (pick.isCorrect === 1 && isUpsetPick(pick.gameId, pick.pickedTeamId, gameMap, teamMap)) {
          count++;
        }
      }
      if (count > 0 && (!chaosAgent || count > chaosAgent.count)) {
        chaosAgent = { userId, count };
      }
    }

    expect(chaosAgent).not.toBeNull();
    expect(chaosAgent!.userId).toBe(1);
    expect(chaosAgent!.count).toBe(2);
  });
});

describe("Clown Car badge", () => {
  it("counts wrong upset picks per user", () => {
    const teams: Team[] = [
      { id: 1, name: "Duke", abbreviation: "DUKE", seed: 1 },
      { id: 2, name: "Norfolk State", abbreviation: "NSU", seed: 16 },
    ];
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    const games: Game[] = [
      { id: 100, round: 1, region: "East", gameIndex: 0, team1Id: 1, team2Id: 2, winnerTeamId: 1, status: "final", team1Score: 80, team2Score: 55 },
    ];
    const gameMap = new Map(games.map((g) => [g.id, g]));

    const picks: Pick[] = [
      { userId: 1, gameId: 100, pickedTeamId: 2, isCorrect: 0, pointsEarned: 0 }, // Picked 16 seed, 1 seed won
      { userId: 2, gameId: 100, pickedTeamId: 1, isCorrect: 1, pointsEarned: 10 }, // Picked correctly
    ];

    let clownCount = 0;
    for (const pick of picks) {
      if (pick.isCorrect === 0 && isUpsetPick(pick.gameId, pick.pickedTeamId, gameMap, teamMap)) {
        clownCount++;
      }
    }

    expect(clownCount).toBe(1); // Only user 1's pick counts
  });
});

describe("Close But No Cigar badge", () => {
  it("counts upset picks that lost by 2 or fewer points", () => {
    const teams: Team[] = [
      { id: 1, name: "Duke", abbreviation: "DUKE", seed: 1 },
      { id: 2, name: "Norfolk State", abbreviation: "NSU", seed: 16 },
      { id: 3, name: "Kansas", abbreviation: "KU", seed: 2 },
      { id: 4, name: "Vermont", abbreviation: "UVM", seed: 15 },
    ];
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    const games: Game[] = [
      // Close game: Duke wins by 1
      { id: 100, round: 1, region: "East", gameIndex: 0, team1Id: 1, team2Id: 2, winnerTeamId: 1, status: "final", team1Score: 65, team2Score: 64 },
      // Blowout: Kansas wins by 20
      { id: 101, round: 1, region: "East", gameIndex: 1, team1Id: 3, team2Id: 4, winnerTeamId: 3, status: "final", team1Score: 80, team2Score: 60 },
    ];
    const gameMap = new Map(games.map((g) => [g.id, g]));

    const picks: Pick[] = [
      { userId: 1, gameId: 100, pickedTeamId: 2, isCorrect: 0, pointsEarned: 0 }, // Upset pick, lost by 1
      { userId: 1, gameId: 101, pickedTeamId: 4, isCorrect: 0, pointsEarned: 0 }, // Upset pick, lost by 20
    ];

    let closeCount = 0;
    for (const pick of picks) {
      if (pick.isCorrect !== 0) continue;
      if (!isUpsetPick(pick.gameId, pick.pickedTeamId, gameMap, teamMap)) continue;
      const game = gameMap.get(pick.gameId);
      if (!game || game.status !== "final") continue;
      if (game.team1Score == null || game.team2Score == null) continue;
      const margin = Math.abs(game.team1Score - game.team2Score);
      if (margin <= 2) closeCount++;
    }

    expect(closeCount).toBe(1); // Only the 1-point loss counts
  });
});

describe("Lone Wolf badge", () => {
  it("counts picks that only one user made", () => {
    const picks: Pick[] = [
      // Game 100: User 1 picks team 2 (unique), User 2 picks team 1 (shared with User 3)
      { userId: 1, gameId: 100, pickedTeamId: 2, isCorrect: 1, pointsEarned: 10 },
      { userId: 2, gameId: 100, pickedTeamId: 1, isCorrect: 0, pointsEarned: 0 },
      { userId: 3, gameId: 100, pickedTeamId: 1, isCorrect: 0, pointsEarned: 0 },
      // Game 101: User 1 picks team 4 (shared with User 2)
      { userId: 1, gameId: 101, pickedTeamId: 4, isCorrect: 1, pointsEarned: 10 },
      { userId: 2, gameId: 101, pickedTeamId: 4, isCorrect: 1, pointsEarned: 10 },
      { userId: 3, gameId: 101, pickedTeamId: 3, isCorrect: 0, pointsEarned: 0 }, // unique
    ];

    // Count picks per game-team combo
    const pickCounts = new Map<string, number>();
    for (const pick of picks) {
      const key = `${pick.gameId}-${pick.pickedTeamId}`;
      pickCounts.set(key, (pickCounts.get(key) || 0) + 1);
    }

    // Count unique picks per user
    const uniqueByUser = new Map<number, number>();
    for (const pick of picks) {
      const key = `${pick.gameId}-${pick.pickedTeamId}`;
      if (pickCounts.get(key) === 1) {
        uniqueByUser.set(pick.userId, (uniqueByUser.get(pick.userId) || 0) + 1);
      }
    }

    expect(uniqueByUser.get(1)).toBe(1); // team 2 in game 100
    expect(uniqueByUser.get(3)).toBe(1); // team 3 in game 101
    expect(uniqueByUser.has(2)).toBe(false); // no unique picks
  });
});

describe("Homer badge", () => {
  it("detects same team picked 4+ consecutive rounds", () => {
    const picks: Pick[] = [
      { userId: 1, gameId: 1, pickedTeamId: 5, isCorrect: 1, pointsEarned: 10 },  // R1
      { userId: 1, gameId: 2, pickedTeamId: 5, isCorrect: 1, pointsEarned: 20 },  // R2
      { userId: 1, gameId: 3, pickedTeamId: 5, isCorrect: 1, pointsEarned: 40 },  // R3
      { userId: 1, gameId: 4, pickedTeamId: 5, isCorrect: 1, pointsEarned: 80 },  // R4
      { userId: 1, gameId: 5, pickedTeamId: 5, isCorrect: null, pointsEarned: 0 }, // R5
    ];

    const gameRounds: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

    // Group by team, get rounds
    const teamRounds = new Map<number, number[]>();
    for (const pick of picks) {
      const round = gameRounds[pick.gameId];
      if (!teamRounds.has(pick.pickedTeamId)) teamRounds.set(pick.pickedTeamId, []);
      teamRounds.get(pick.pickedTeamId)!.push(round);
    }

    for (const [teamId, rounds] of teamRounds) {
      rounds.sort((a, b) => a - b);
      let maxConsec = 1;
      let consec = 1;
      for (let i = 1; i < rounds.length; i++) {
        if (rounds[i] === rounds[i - 1] + 1) {
          consec++;
          maxConsec = Math.max(maxConsec, consec);
        } else {
          consec = 1;
        }
      }
      expect(maxConsec).toBe(5); // 5 consecutive rounds for team 5
    }
  });

  it("does not trigger for 3 consecutive rounds", () => {
    const rounds = [1, 2, 3];
    rounds.sort((a, b) => a - b);
    let maxConsec = 1;
    let consec = 1;
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i] === rounds[i - 1] + 1) {
        consec++;
        maxConsec = Math.max(maxConsec, consec);
      } else {
        consec = 1;
      }
    }
    expect(maxConsec).toBe(3);
    expect(maxConsec >= 4).toBe(false);
  });
});

describe("Perfect Round badge", () => {
  it("detects when all picks in a round are correct", () => {
    // R1 has 32 games. Simulate all correct.
    const expectedGames: Record<number, number> = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 };

    const byRound = new Map<number, { correct: number; total: number; decided: number }>();
    // Simulate 32 correct R1 picks
    byRound.set(1, { correct: 32, total: 32, decided: 32 });
    // Simulate 14 correct, 2 wrong R2 picks
    byRound.set(2, { correct: 14, total: 16, decided: 16 });

    let perfectRound: number | null = null;
    for (const [round, data] of byRound) {
      const expected = expectedGames[round] || 0;
      if (data.correct === expected && data.decided === expected && data.total === expected) {
        perfectRound = round;
      }
    }

    expect(perfectRound).toBe(1); // Only R1 is perfect
  });

  it("does not award when some picks are undecided", () => {
    const expectedGames: Record<number, number> = { 1: 32 };
    const byRound = new Map<number, { correct: number; total: number; decided: number }>();
    byRound.set(1, { correct: 30, total: 32, decided: 30 }); // 2 undecided

    let perfectRound: number | null = null;
    for (const [round, data] of byRound) {
      const expected = expectedGames[round] || 0;
      if (data.correct === expected && data.decided === expected && data.total === expected) {
        perfectRound = round;
      }
    }

    expect(perfectRound).toBeNull();
  });
});

describe("Oracle badge (longest streak)", () => {
  it("finds the longest correct pick streak", () => {
    const results = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0]; // streak of 5

    let maxStreak = 0;
    let currentStreak = 0;
    for (const r of results) {
      if (r === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    expect(maxStreak).toBe(5);
  });

  it("handles all correct", () => {
    const results = [1, 1, 1, 1];
    let maxStreak = 0;
    let currentStreak = 0;
    for (const r of results) {
      if (r === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    expect(maxStreak).toBe(4);
  });

  it("handles all wrong", () => {
    const results = [0, 0, 0];
    let maxStreak = 0;
    let currentStreak = 0;
    for (const r of results) {
      if (r === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    expect(maxStreak).toBe(0);
  });
});
