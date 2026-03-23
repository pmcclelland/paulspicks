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
  it("picks the favorite in large mismatches (1v16)", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "Duke", 1, "East"),
      makeTeam(2, "LowSeed16", 16, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(100, 1, "East", 0, 1, 2),
    ];

    // KenPom: Duke much stronger — no upset threshold for 1v16
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("duke", 30);
    kenpomMap.set("lowseed16", -10);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 100);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(1); // Duke (1-seed favorite)
  });

  it("picks the 8-seed when it has higher KenPom in 8v9 matchup", () => {
    const teams: SimTeam[] = [
      makeTeam(3, "MidTeam8", 8, "East"),
      makeTeam(4, "MidTeam9", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(101, 1, "East", 1, 3, 4),
    ];

    // 8-seed has slightly higher KenPom
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("midteam8", 10);
    kenpomMap.set("midteam9", 8);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 101);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(3); // MidTeam8 (higher KenPom)
  });

  it("picks the 9-seed (underdog) when it has higher KenPom in 8v9 matchup", () => {
    const teams: SimTeam[] = [
      makeTeam(3, "WeakEight", 8, "East"),
      makeTeam(4, "StrongNine", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(101, 1, "East", 1, 3, 4),
    ];

    // 9-seed actually has higher KenPom
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("weakeight", 6);
    kenpomMap.set("strongnine", 12);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 101);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(4); // StrongNine (9-seed with better KenPom)
  });

  it("picks the 12-seed when probability is close in 5v12 matchup", () => {
    const teams: SimTeam[] = [
      makeTeam(5, "FiveSeed", 5, "South"),
      makeTeam(6, "TwelveSeed", 12, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(200, 1, "South", 4, 5, 6),
    ];

    // Nearly equal KenPom — blended prob (kenpom ~0.5 + historical ~0.64) ≈ 0.54 < 0.57
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("fiveseed", 12);
    kenpomMap.set("twelveseed", 12);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 200);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(6); // TwelveSeed upset
  });

  it("picks the 5-seed when probability is well above threshold in 5v12", () => {
    const teams: SimTeam[] = [
      makeTeam(5, "StrongFive", 5, "South"),
      makeTeam(6, "WeakTwelve", 12, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(200, 1, "South", 4, 5, 6),
    ];

    // Large KenPom gap — favorite prob will be well above 0.57
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("strongfive", 22);
    kenpomMap.set("weaktwelve", 2);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 200);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(5); // StrongFive (too big a gap for upset)
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

  it("picks underdog in R2+ when KenPom gap is small (underseeded bonus)", () => {
    // Simulate an R2 game where the "underdog" has nearly equal KenPom
    const teams: SimTeam[] = [
      makeTeam(10, "HighSeed", 2, "East"),
      makeTeam(11, "LowSeed", 7, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(400, 2, "East", 0, 10, 11),
    ];

    // Equal KenPom → kenpomProb = 0.5, historical 2v7 R2 ≈ 0.667
    // Blended ≈ 0.7*0.5 + 0.3*0.667 = 0.55 < threshold 0.56 (underseeded bonus)
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("highseed", 18);
    kenpomMap.set("lowseed", 18); // Equal KenPom → underseeded bonus triggers

    const result = generateSimBracket(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 400);
    expect(pick).toBeDefined();
    // With such close KenPom, the underseeded bonus + threshold should favor the underdog
    expect(pick!.pickedTeamId).toBe(11); // LowSeed (7-seed upset)
  });

  it("picks favorite in R2+ when probability is clearly above threshold", () => {
    const teams: SimTeam[] = [
      makeTeam(10, "DomFavorite", 1, "East"),
      makeTeam(11, "WeakDog", 8, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(400, 2, "East", 0, 10, 11),
    ];

    // Large KenPom gap — well above any threshold
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("domfavorite", 28);
    kenpomMap.set("weakdog", 5);

    const result = generateSimBracket(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 400);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(10); // DomFavorite
  });
});
