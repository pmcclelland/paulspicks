import { describe, it, expect } from "vitest";
import { generateSimBracket, seededRandom, type GameOddsEntry, type KenPomDetails } from "@/lib/sim-bracket";
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

// Helper to run sim bracket with seeded RNG for deterministic results
function simWithSeed(
  games: SimGame[],
  teamsById: Map<number, SimTeam>,
  kenpomMap: Map<string, number>,
  opts: {
    gameOdds?: Map<number, GameOddsEntry>;
    luckMap?: Map<string, number>;
    kenpomDetails?: Map<string, KenPomDetails>;
    simCount?: number;
    seed?: number;
  } = {}
) {
  return generateSimBracket(
    games, teamsById, kenpomMap,
    undefined, // injuryPenalties
    opts.gameOdds,
    opts.luckMap,
    opts.kenpomDetails,
    opts.simCount ?? 10000,
    seededRandom(opts.seed ?? 42)
  );
}

describe("generateSimBracket (Monte Carlo)", () => {
  it("picks the favorite in large mismatches (1v16)", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "Duke", 1, "East"),
      makeTeam(2, "LowSeed16", 16, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(100, 1, "East", 0, 1, 2)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("duke", 30);
    kenpomMap.set("lowseed16", -10);

    const result = simWithSeed(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 100);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(1); // Duke dominates in sims
    expect(result.confidences[100]).toBeGreaterThan(0.95);
  });

  it("picks the 8-seed when it has higher KenPom in 8v9 matchup", () => {
    const teams: SimTeam[] = [
      makeTeam(3, "MidTeam8", 8, "East"),
      makeTeam(4, "MidTeam9", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(101, 1, "East", 1, 3, 4)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("midteam8", 15);
    kenpomMap.set("midteam9", 8);

    const result = simWithSeed(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 101);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(3); // MidTeam8 wins majority of sims
  });

  it("picks the 9-seed when it has higher KenPom in 8v9 matchup", () => {
    const teams: SimTeam[] = [
      makeTeam(3, "WeakEight", 8, "East"),
      makeTeam(4, "StrongNine", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(101, 1, "East", 1, 3, 4)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("weakeight", 4);
    kenpomMap.set("strongnine", 14);

    const result = simWithSeed(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 101);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(4); // StrongNine wins majority
  });

  it("picks the 5-seed when they have a clear KenPom edge in 5v12", () => {
    const teams: SimTeam[] = [
      makeTeam(5, "StrongFive", 5, "South"),
      makeTeam(6, "WeakTwelve", 12, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(200, 1, "South", 4, 5, 6)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("strongfive", 22);
    kenpomMap.set("weaktwelve", 2);

    const result = simWithSeed(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 200);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(5);
  });

  it("confidence reflects simulation win frequency", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "TeamA", 1, "South"),
      makeTeam(2, "TeamB", 16, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(10, 1, "South", 0, 1, 2)];
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("teama", 25);
    kenpomMap.set("teamb", -5);

    const result = simWithSeed(games, teamsById, kenpomMap);

    // With such a large gap, confidence should be very high
    expect(result.confidences[10]).toBeGreaterThan(0.9);
    expect(result.confidences[10]).toBeLessThanOrEqual(1.0);
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

    const result = simWithSeed(games, teamsById, kenpomMap);

    // R2 game should have a pick (winners were propagated)
    const r2Pick = result.picks.find((p) => p.gameId === 102);
    expect(r2Pick).toBeDefined();
    // TopTeam (id=1) should beat MidA (id=3) in R2 most often
    expect(r2Pick!.pickedTeamId).toBe(1);
  });

  it("skips games without both teams", () => {
    const teams: SimTeam[] = [makeTeam(1, "Solo", 1, "West")];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(200, 1, "West", 0, null, null)];
    const kenpomMap = new Map<string, number>();

    const result = simWithSeed(games, teamsById, kenpomMap);

    expect(result.picks).toHaveLength(0);
  });

  it("handles a game with only one team (bye)", () => {
    const teams: SimTeam[] = [makeTeam(1, "OnlyTeam", 1, "Midwest")];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(300, 1, "Midwest", 0, 1, null)];
    const kenpomMap = new Map<string, number>();

    const result = simWithSeed(games, teamsById, kenpomMap);

    expect(result.picks).toHaveLength(1);
    expect(result.picks[0].pickedTeamId).toBe(1);
    expect(result.confidences[300]).toBe(1.0);
  });

  it("is deterministic with seeded RNG", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "Alpha", 3, "South"),
      makeTeam(2, "Beta", 14, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(50, 1, "South", 0, 1, 2)];
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("alpha", 15);
    kenpomMap.set("beta", -2);

    const r1 = simWithSeed(games, teamsById, kenpomMap, { seed: 123 });
    const r2 = simWithSeed(games, teamsById, kenpomMap, { seed: 123 });

    expect(r1.picks).toEqual(r2.picks);
    expect(r1.confidences).toEqual(r2.confidences);
  });

  it("picks dominant favorite in R2+ with large KenPom gap", () => {
    const teams: SimTeam[] = [
      makeTeam(10, "DomFavorite", 1, "East"),
      makeTeam(11, "WeakDog", 8, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(400, 2, "East", 0, 10, 11)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("domfavorite", 28);
    kenpomMap.set("weakdog", 5);

    const result = simWithSeed(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 400);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(10);
  });

  // --- Vegas Odds Blending ---

  it("flips pick when moneyline odds strongly favor the underdog", () => {
    // KenPom slightly favors team1 but Vegas heavily favors team2
    const teams: SimTeam[] = [
      makeTeam(1, "FavFive", 5, "South"),
      makeTeam(2, "DogTwelve", 12, "South"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(500, 1, "South", 4, 1, 2)];

    // Small KenPom edge for team1 (base prob ~0.62)
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("favfive", 12);
    kenpomMap.set("dogtwelve", 10);

    // Vegas strongly favors team2 (underdog by seed)
    // +200/-200 → fair prob: team1=0.33, team2=0.67
    // Blended: 0.5*0.62 + 0.5*0.33 ≈ 0.48 → team2 wins majority
    const gameOdds = new Map<number, GameOddsEntry>();
    gameOdds.set(500, { moneylineTeam1: "+200", moneylineTeam2: "-200" });

    const result = simWithSeed(games, teamsById, kenpomMap, { gameOdds });
    const pick = result.picks.find((p) => p.gameId === 500);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(2); // Vegas odds flip the probability
  });

  it("falls back to model-only when no odds are available", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "BigFav", 1, "East"),
      makeTeam(2, "TinyDog", 16, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(501, 1, "East", 0, 1, 2)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("bigfav", 30);
    kenpomMap.set("tinydog", -10);

    const gameOdds = new Map<number, GameOddsEntry>(); // empty

    const result = simWithSeed(games, teamsById, kenpomMap, { gameOdds });
    const pick = result.picks.find((p) => p.gameId === 501);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(1);
  });

  // --- Luck Regression ---

  it("luck regression flips a close game when favorite is significantly luckier", () => {
    // 8v9 with near-equal KenPom: base prob ≈ 0.505 for team1
    // Luck adjustment -0.02 → ~0.485 → team2 wins majority of sims
    const teams: SimTeam[] = [
      makeTeam(1, "LuckyEight", 8, "East"),
      makeTeam(2, "UnluckyNine", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(600, 1, "East", 1, 1, 2)];

    // Near-equal KenPom (team1 very slightly ahead)
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("luckyeight", 10.2);
    kenpomMap.set("unluckynine", 10);

    // team1 is much luckier → luckDiff = 0.10 > 0.04 → prob -= 0.02
    const luckMap = new Map<string, number>();
    luckMap.set("luckyeight", 0.08);
    luckMap.set("unluckynine", -0.02);

    const result = simWithSeed(games, teamsById, kenpomMap, { luckMap });
    const pick = result.picks.find((p) => p.gameId === 600);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(2); // Luck regression shifts prob past 0.5
  });

  it("lucky underdog does not get boosted", () => {
    // team1 is favorite by KenPom, team2 (underdog) is luckier
    // Luck adjustment +0.02 → team1 even more favored
    const teams: SimTeam[] = [
      makeTeam(1, "SolidFour", 4, "East"),
      makeTeam(2, "LuckyThirteen", 13, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(601, 1, "East", 5, 1, 2)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("solidfour", 18);
    kenpomMap.set("luckythirteen", 10);

    // team2 is luckier → luckDiff < -0.04 → prob += 0.02 (helps team1)
    const luckMap = new Map<string, number>();
    luckMap.set("solidfour", -0.01);
    luckMap.set("luckythirteen", 0.06);

    const result = simWithSeed(games, teamsById, kenpomMap, { luckMap });
    const pick = result.picks.find((p) => p.gameId === 601);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(1); // SolidFour — lucky underdog penalized
  });

  // --- Stylistic Matchup Edge ---

  it("matchup edge flips a close game when underdog exploits defensive weakness", () => {
    // 8v9 with near-equal KenPom: base prob ≈ 0.505 for team1
    // team2 has stylistic edge > 4 → prob -= 0.01+ → team2 wins majority
    const teams: SimTeam[] = [
      makeTeam(1, "WeakDEight", 8, "Midwest"),
      makeTeam(2, "StrongONine", 9, "Midwest"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(700, 1, "Midwest", 1, 1, 2)];

    // Near-equal KenPom
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("weakdeight", 10.2);
    kenpomMap.set("strongonine", 10);

    // team2 has strong O vs team1's weak D
    // t2Edge = (118 - 108) - (108 - 100) = 10 - 8 = 2... needs to be > 4
    // Bigger gap: t2Edge = (120 - 110) - (106 - 102) = 10 - 4 = 6 > 4
    const kenpomDetailsMap = new Map<string, KenPomDetails>();
    kenpomDetailsMap.set("weakdeight", { adjO: 106, adjD: 110 });
    kenpomDetailsMap.set("strongonine", { adjO: 120, adjD: 102 });

    const result = simWithSeed(games, teamsById, kenpomMap, { kenpomDetails: kenpomDetailsMap });
    const pick = result.picks.find((p) => p.gameId === 700);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(2); // Matchup edge shifts prob past 0.5
  });

  // --- Monte Carlo convergence ---

  it("captures cascading path effects across rounds", () => {
    // R1: game 0 is a coin flip, game 1 has a strong team
    // R2: the strong team dominates whoever advances from game 0
    // Monte Carlo naturally picks the R2 winner correctly by simulating paths
    const teams: SimTeam[] = [
      makeTeam(1, "CoinA", 8, "East"),
      makeTeam(2, "CoinB", 9, "East"),
      makeTeam(3, "Dominant", 1, "East"),
      makeTeam(4, "Weak16", 16, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));

    const games: SimGame[] = [
      makeGame(100, 1, "East", 0, 3, 4), // Dominant vs Weak16
      makeGame(101, 1, "East", 1, 1, 2), // CoinA vs CoinB (close)
      makeGame(102, 2, "East", 0, null, null), // R2
    ];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("coina", 10);
    kenpomMap.set("coinb", 10);
    kenpomMap.set("dominant", 30);
    kenpomMap.set("weak16", -10);

    const result = simWithSeed(games, teamsById, kenpomMap);

    // R2 should always pick Dominant regardless of who they face
    const r2Pick = result.picks.find((p) => p.gameId === 102);
    expect(r2Pick).toBeDefined();
    expect(r2Pick!.pickedTeamId).toBe(3);
    expect(result.confidences[102]).toBeGreaterThan(0.9);
  });
});
