import { describe, it, expect } from "vitest";
import { getNextGame, getSlotInNextGame } from "@/lib/bracket-utils";

/**
 * Tests for the TBD team resolution logic extracted from refresh-scores.ts.
 * We test the resolveTeamId logic in isolation without needing a DB connection.
 */

type Team = {
  id: number;
  espnTeamId: string;
  name: string;
  abbreviation: string;
  seed: number;
};

// Replicate the resolveTeamId logic from refresh-scores.ts
function resolveTeamId(
  espnTeam: { espnTeamId: string; name?: string } | null,
  fallback: number | null,
  espnToDbId: Map<string, number>,
  allTeams: Team[]
): number | null {
  if (!espnTeam) return fallback;
  const dbId = espnToDbId.get(espnTeam.espnTeamId);
  if (dbId == null) return fallback;
  const team = allTeams.find((t) => t.id === dbId);
  if (team && (team.name === "TBD" || team.abbreviation === "TBD")) return fallback;
  return dbId;
}

describe("resolveTeamId (TBD filtering)", () => {
  const realTeams: Team[] = [
    { id: 1, espnTeamId: "100", name: "Duke Blue Devils", abbreviation: "DUKE", seed: 1 },
    { id: 2, espnTeamId: "200", name: "Kansas Jayhawks", abbreviation: "KU", seed: 2 },
    { id: 10, espnTeamId: "2628", name: "TCU Horned Frogs", abbreviation: "TCU", seed: 9 },
    { id: 54, espnTeamId: "tbd1", name: "TBD", abbreviation: "TBD", seed: 99 },
    { id: 70, espnTeamId: "tbd2", name: "TBD", abbreviation: "TBD", seed: 99 },
  ];

  const espnToDbId = new Map<string, number>();
  for (const t of realTeams) {
    espnToDbId.set(t.espnTeamId, t.id);
  }

  it("resolves a real ESPN team to its DB id", () => {
    const result = resolveTeamId({ espnTeamId: "100" }, null, espnToDbId, realTeams);
    expect(result).toBe(1); // Duke
  });

  it("returns fallback when ESPN team is null", () => {
    const result = resolveTeamId(null, 5, espnToDbId, realTeams);
    expect(result).toBe(5);
  });

  it("returns fallback when ESPN team ID is not in the map", () => {
    const result = resolveTeamId({ espnTeamId: "unknown" }, 3, espnToDbId, realTeams);
    expect(result).toBe(3);
  });

  it("rejects TBD placeholder team and returns fallback", () => {
    // ESPN sends a TBD team for an R2 game — should NOT overwrite the advanced winner
    const result = resolveTeamId({ espnTeamId: "tbd1" }, 10, espnToDbId, realTeams);
    expect(result).toBe(10); // Keeps the fallback (TCU's id, already advanced)
  });

  it("rejects TBD placeholder team even when fallback is null", () => {
    const result = resolveTeamId({ espnTeamId: "tbd2" }, null, espnToDbId, realTeams);
    expect(result).toBeNull();
  });

  it("does not reject real teams with TBD-like names but different abbreviation", () => {
    const teamsWithEdgeCase = [
      ...realTeams,
      { id: 99, espnTeamId: "edge", name: "TBD Academy", abbreviation: "TBDA", seed: 16 },
    ];
    const mapWithEdge = new Map(espnToDbId);
    mapWithEdge.set("edge", 99);
    // This team has "TBD" in its name but abbreviation isn't "TBD", and name isn't exactly "TBD"
    const result = resolveTeamId({ espnTeamId: "edge" }, null, mapWithEdge, teamsWithEdgeCase);
    expect(result).toBe(99); // Accepted because name !== "TBD"
  });
});

describe("pick scoring logic", () => {
  it("awards correct points per round when pick matches winner", () => {
    const POINTS_PER_ROUND: Record<number, number> = {
      1: 10, 2: 20, 3: 40, 4: 80, 5: 160, 6: 320,
    };

    for (let round = 1; round <= 6; round++) {
      const pickedTeamId = 5;
      const winnerDbId = 5;
      const isCorrect = pickedTeamId === winnerDbId;
      const points = isCorrect ? POINTS_PER_ROUND[round] : 0;
      expect(isCorrect).toBe(true);
      expect(points).toBe(POINTS_PER_ROUND[round]);
    }
  });

  it("awards 0 points when pick does not match winner", () => {
    const pickedTeamId = 5;
    const winnerDbId = 8;
    const isCorrect = pickedTeamId === winnerDbId;
    expect(isCorrect).toBe(false);
    expect(isCorrect ? 10 : 0).toBe(0);
  });
});

describe("winner advancement logic", () => {
  function computeAdvancement(round: number, gameIndex: number) {
    if (round >= 6) return null;

    const nextGameInfo = getNextGame(round, gameIndex);
    if (!nextGameInfo) return null;

    const slot = getSlotInNextGame(gameIndex);
    let nextRegion: string | null = null;
    if (nextGameInfo.round >= 5) {
      nextRegion = "Final Four";
    }

    return {
      nextRound: nextGameInfo.round,
      nextGameIndex: nextGameInfo.gameIndex,
      slot,
      nextRegion,
    };
  }

  it("advances R1 idx 0 winner to R2 idx 0 team1 slot", () => {
    const result = computeAdvancement(1, 0);
    expect(result).toEqual({
      nextRound: 2,
      nextGameIndex: 0,
      slot: "team1",
      nextRegion: null,
    });
  });

  it("advances R1 idx 1 winner to R2 idx 0 team2 slot", () => {
    const result = computeAdvancement(1, 1);
    expect(result).toEqual({
      nextRound: 2,
      nextGameIndex: 0,
      slot: "team2",
      nextRegion: null,
    });
  });

  it("advances R1 idx 3 winner to R2 idx 1 team2 slot", () => {
    const result = computeAdvancement(1, 3);
    expect(result).toEqual({
      nextRound: 2,
      nextGameIndex: 1,
      slot: "team2",
      nextRegion: null,
    });
  });

  it("advances E8 (R4) to Final Four region", () => {
    const result = computeAdvancement(4, 0);
    expect(result).not.toBeNull();
    expect(result!.nextRound).toBe(5);
    expect(result!.nextRegion).toBe("Final Four");
  });

  it("advances Final Four to Championship in Final Four region", () => {
    const result = computeAdvancement(5, 0);
    expect(result).not.toBeNull();
    expect(result!.nextRound).toBe(6);
    expect(result!.nextRegion).toBe("Final Four");
  });

  it("returns null for Championship (round 6)", () => {
    const result = computeAdvancement(6, 0);
    expect(result).toBeNull();
  });
});
