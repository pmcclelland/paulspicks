import { describe, it, expect } from "vitest";
import { generateSimBracket } from "@/lib/sim-bracket";
import type { SimTeam, SimGame } from "@/lib/simulation";

function makeTeam(id: number, name: string, seed: number, region: string): SimTeam {
  return { id, name, abbreviation: name.slice(0, 3).toUpperCase(), seed, region, logoUrl: null };
}

function makeGame(
  id: number,
  round: number,
  region: string,
  gameIndex: number,
  team1Id: number | null,
  team2Id: number | null
): SimGame {
  return { id, round, region, gameIndex, team1Id, team2Id };
}

describe("generateSimBracket", () => {
  it("always picks the higher-probability team (deterministic)", () => {
    // Two R1 games in a region: 1v16 and 8v9
    const teams: SimTeam[] = [
      makeTeam(1, "Duke", 1, "East"),
      makeTeam(2, "LowSeed16", 16, "East"),
      makeTeam(3, "MidTeam8", 8, "East"),
      makeTeam(4, "MidTeam9", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(100, 1, "East", 0, 1, 2),  // 1-seed vs 16-seed
      makeGame(101, 1, "East", 1, 3, 4),  // 8-seed vs 9-seed
      makeGame(102, 2, "East", 0, null, null), // R2 game
    ];

    // KenPom: Duke much stronger
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("duke", 30);
    kenpomMap.set("lowseed16", -10);
    kenpomMap.set("midteam8", 10);
    kenpomMap.set("midteam9", 8);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    // Should pick Duke (1-seed, much higher adjEM)
    const dukePick = result.picks.find((p) => p.gameId === 100);
    expect(dukePick).toBeDefined();
    expect(dukePick!.pickedTeamId).toBe(1); // Duke

    // Should pick MidTeam8 (slightly higher adjEM)
    const midPick = result.picks.find((p) => p.gameId === 101);
    expect(midPick).toBeDefined();
    expect(midPick!.pickedTeamId).toBe(3); // MidTeam8

    // Should have 3 picks total (2 R1 + 1 R2)
    expect(result.picks).toHaveLength(3);
  });

  it("produces confidence values between 0.5 and 1.0", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "TeamA", 1, "South"),
      makeTeam(2, "TeamB", 16, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(10, 1, "South", 0, 1, 2)];
    const kenpomMap = new Map<string, number>();

    const result = generateSimBracket(games, teamsById, kenpomMap);

    for (const [, conf] of Object.entries(result.confidences)) {
      expect(conf).toBeGreaterThanOrEqual(0.5);
      expect(conf).toBeLessThanOrEqual(1.0);
    }
  });

  it("propagates R1 winners to correct R2 slots", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "TopTeam", 1, "East"),
      makeTeam(2, "BottomTeam", 16, "East"),
      makeTeam(3, "MidA", 8, "East"),
      makeTeam(4, "MidB", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(100, 1, "East", 0, 1, 2),
      makeGame(101, 1, "East", 1, 3, 4),
      makeGame(102, 2, "East", 0, null, null),
    ];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("topteam", 30);
    kenpomMap.set("bottomteam", -15);
    kenpomMap.set("mida", 12);
    kenpomMap.set("midb", 5);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    // R2 game should have a pick (winners were propagated)
    const r2Pick = result.picks.find((p) => p.gameId === 102);
    expect(r2Pick).toBeDefined();
    // TopTeam (id=1) should beat MidA (id=3) in R2
    expect(r2Pick!.pickedTeamId).toBe(1);
  });

  it("skips games without both teams", () => {
    const teams: SimTeam[] = [makeTeam(1, "Solo", 1, "West")];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(200, 1, "West", 0, null, null), // No teams at all
    ];

    const kenpomMap = new Map<string, number>();
    const result = generateSimBracket(games, teamsById, kenpomMap);

    expect(result.picks).toHaveLength(0);
  });

  it("handles a game with only one team (bye)", () => {
    const teams: SimTeam[] = [makeTeam(1, "OnlyTeam", 1, "Midwest")];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(300, 1, "Midwest", 0, 1, null),
    ];

    const kenpomMap = new Map<string, number>();
    const result = generateSimBracket(games, teamsById, kenpomMap);

    expect(result.picks).toHaveLength(1);
    expect(result.picks[0].pickedTeamId).toBe(1);
    expect(result.confidences[300]).toBe(1.0);
  });

  it("is deterministic — same inputs always produce same outputs", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "Alpha", 3, "South"),
      makeTeam(2, "Beta", 14, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(50, 1, "South", 0, 1, 2)];
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("alpha", 15);
    kenpomMap.set("beta", -2);

    const r1 = generateSimBracket(games, teamsById, kenpomMap);
    const r2 = generateSimBracket(games, teamsById, kenpomMap);

    expect(r1.picks).toEqual(r2.picks);
    expect(r1.confidences).toEqual(r2.confidences);
  });
});
