import { describe, it, expect } from "vitest";
import { generateSimBracket, seededRandom, selectR1Upsets, MIN_UPSET_PROB, type GameOddsEntry, type KenPomDetails } from "@/lib/sim-bracket";
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

describe("generateSimBracket (Monte Carlo + upset budget)", () => {
  // --- Core behavior ---

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
    expect(pick!.pickedTeamId).toBe(1); // Duke dominates
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
    expect(pick!.pickedTeamId).toBe(3);
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

  // --- Upset budget tests ---

  it("budget produces 5-10 upsets for a realistic R1 field", () => {
    // Create a full 32-game R1 across 4 regions (8 per region)
    const teams: SimTeam[] = [];
    const games: SimGame[] = [];
    const kenpomMap = new Map<string, number>();
    const regions = ["East", "South", "Midwest", "West"];
    let teamId = 1;
    let gameId = 1;

    // Standard R1 matchups: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
    const matchups = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];

    for (const region of regions) {
      for (let gi = 0; gi < matchups.length; gi++) {
        const [s1, s2] = matchups[gi];
        const t1 = makeTeam(teamId++, `${region}S${s1}`, s1, region);
        const t2 = makeTeam(teamId++, `${region}S${s2}`, s2, region);
        teams.push(t1, t2);
        games.push(makeGame(gameId++, 1, region, gi, t1.id, t2.id));
        // KenPom roughly correlates with seed
        kenpomMap.set(t1.name.toLowerCase(), 30 - s1 * 1.5);
        kenpomMap.set(t2.name.toLowerCase(), 30 - s2 * 1.5);
      }
    }

    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const result = simWithSeed(games, teamsById, kenpomMap);

    // Count R1 upsets (higher seed number picked over lower seed number, excluding 8v9)
    let upsetCount = 0;
    for (const pick of result.picks) {
      const game = games.find((g) => g.id === pick.gameId)!;
      const t1 = teamsById.get(game.team1Id!)!;
      const t2 = teamsById.get(game.team2Id!)!;
      const matchup = `${Math.min(t1.seed, t2.seed)}-${Math.max(t1.seed, t2.seed)}`;
      if (matchup === "8-9") continue;
      const picked = teamsById.get(pick.pickedTeamId)!;
      const favorite = t1.seed < t2.seed ? t1 : t2;
      if (picked.id !== favorite.id) upsetCount++;
    }

    expect(upsetCount).toBeGreaterThanOrEqual(5);
    expect(upsetCount).toBeLessThanOrEqual(10);
  });

  it("highest-probability upsets are selected first", () => {
    const candidates = [
      { gameId: 1, favorite: makeTeam(1, "F1", 5, "E"), underdog: makeTeam(2, "U1", 12, "E"), underdogProb: 0.45 },
      { gameId: 2, favorite: makeTeam(3, "F2", 6, "E"), underdog: makeTeam(4, "U2", 11, "E"), underdogProb: 0.30 },
      { gameId: 3, favorite: makeTeam(5, "F3", 7, "E"), underdog: makeTeam(6, "U3", 10, "E"), underdogProb: 0.40 },
      { gameId: 4, favorite: makeTeam(7, "F4", 4, "E"), underdog: makeTeam(8, "U4", 13, "E"), underdogProb: 0.25 },
      { gameId: 5, favorite: makeTeam(9, "F5", 3, "E"), underdog: makeTeam(10, "U5", 14, "E"), underdogProb: 0.20 },
      { gameId: 6, favorite: makeTeam(11, "F6", 5, "S"), underdog: makeTeam(12, "U6", 12, "S"), underdogProb: 0.42 },
    ];

    const upsets = selectR1Upsets(candidates);

    // Budget = sum = 0.45+0.30+0.40+0.25+0.20+0.42 = 2.02 → clamped to 5
    // Top 5 by prob: gameId 1 (0.45), 6 (0.42), 3 (0.40), 2 (0.30), 4 (0.25)
    expect(upsets.size).toBe(5);
    expect(upsets.has(1)).toBe(true);  // 0.45 — highest prob, selected
    expect(upsets.has(6)).toBe(true);  // 0.42
    expect(upsets.has(3)).toBe(true);  // 0.40
    expect(upsets.has(2)).toBe(true);  // 0.30
    expect(upsets.has(4)).toBe(true);  // 0.25
    expect(upsets.has(5)).toBe(false); // 0.20 — 6th highest, cut by budget of 5
  });

  it("minimum probability floor excludes 1v16 and 2v15 absurd upsets", () => {
    const candidates = [
      { gameId: 1, favorite: makeTeam(1, "F1", 1, "E"), underdog: makeTeam(2, "U1", 16, "E"), underdogProb: 0.01 },
      { gameId: 2, favorite: makeTeam(3, "F2", 2, "E"), underdog: makeTeam(4, "U2", 15, "E"), underdogProb: 0.07 },
      { gameId: 3, favorite: makeTeam(5, "F3", 5, "E"), underdog: makeTeam(6, "U3", 12, "E"), underdogProb: 0.40 },
      { gameId: 4, favorite: makeTeam(7, "F4", 6, "E"), underdog: makeTeam(8, "U4", 11, "E"), underdogProb: 0.35 },
      { gameId: 5, favorite: makeTeam(9, "F5", 7, "E"), underdog: makeTeam(10, "U5", 10, "E"), underdogProb: 0.38 },
    ];

    const upsets = selectR1Upsets(candidates);

    // 1v16 (0.01) and 2v15 (0.07) both below MIN_UPSET_PROB (0.15) — excluded
    expect(upsets.has(1)).toBe(false);
    expect(upsets.has(2)).toBe(false);
    // The 3 eligible games should all be picked (budget clamped to min 5, but only 3 eligible)
    expect(upsets.has(3)).toBe(true);
    expect(upsets.has(4)).toBe(true);
    expect(upsets.has(5)).toBe(true);
  });

  it("8v9 games excluded from budget, just pick MC favorite", () => {
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
    // 8-seed has higher KenPom, MC should favor them
    expect(pick!.pickedTeamId).toBe(3);
  });

  // --- R2+ behavior unchanged ---

  it("picks underdog in R2+ when KenPom gap is small (underseeded bonus)", () => {
    const teams: SimTeam[] = [
      makeTeam(10, "HighSeed", 2, "East"),
      makeTeam(11, "LowSeed", 7, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(400, 2, "East", 0, 10, 11)];

    // Equal KenPom → MC probability ~0.55, below 0.56 underseeded threshold
    const kenpomMap = new Map<string, number>();
    kenpomMap.set("highseed", 18);
    kenpomMap.set("lowseed", 18);

    const result = simWithSeed(games, teamsById, kenpomMap);

    const pick = result.picks.find((p) => p.gameId === 400);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(11); // LowSeed upset
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

  // --- Propagation & edge cases ---

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

    const r2Pick = result.picks.find((p) => p.gameId === 102);
    expect(r2Pick).toBeDefined();
    expect(r2Pick!.pickedTeamId).toBe(1); // TopTeam dominates R2
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

  it("confidence reflects the picked team's MC win frequency", () => {
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

    // Strong favorite: confidence should be very high
    expect(result.confidences[10]).toBeGreaterThan(0.9);
    expect(result.confidences[10]).toBeLessThanOrEqual(1.0);
  });

  // --- Vegas Odds Blending ---

  it("flips pick when moneyline odds strongly favor the underdog", () => {
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

    // Vegas strongly favors team2 → blended prob ~0.48 for team1
    const gameOdds = new Map<number, GameOddsEntry>();
    gameOdds.set(500, { moneylineTeam1: "+200", moneylineTeam2: "-200" });

    const result = simWithSeed(games, teamsById, kenpomMap, { gameOdds });
    const pick = result.picks.find((p) => p.gameId === 500);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(2); // Vegas odds shift the MC probability
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
    // 8v9 with near-equal KenPom. Luck adj shifts MC prob past 0.5.
    const teams: SimTeam[] = [
      makeTeam(1, "LuckyEight", 8, "East"),
      makeTeam(2, "UnluckyNine", 9, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(600, 1, "East", 1, 1, 2)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("luckyeight", 10.2);
    kenpomMap.set("unluckynine", 10);

    // team1 is much luckier → prob -= 0.02 in each sim
    const luckMap = new Map<string, number>();
    luckMap.set("luckyeight", 0.08);
    luckMap.set("unluckynine", -0.02);

    const result = simWithSeed(games, teamsById, kenpomMap, { luckMap });
    const pick = result.picks.find((p) => p.gameId === 600);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(2); // Luck regression shifts MC probability
  });

  it("lucky underdog does not get boosted", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "SolidFour", 4, "East"),
      makeTeam(2, "LuckyThirteen", 13, "East"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(601, 1, "East", 5, 1, 2)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("solidfour", 18);
    kenpomMap.set("luckythirteen", 10);

    const luckMap = new Map<string, number>();
    luckMap.set("solidfour", -0.01);
    luckMap.set("luckythirteen", 0.06);

    const result = simWithSeed(games, teamsById, kenpomMap, { luckMap });
    const pick = result.picks.find((p) => p.gameId === 601);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(1); // Lucky underdog penalized
  });

  // --- Stylistic Matchup Edge ---

  it("matchup edge flips a close game when underdog exploits defensive weakness", () => {
    const teams: SimTeam[] = [
      makeTeam(1, "WeakDEight", 8, "Midwest"),
      makeTeam(2, "StrongONine", 9, "Midwest"),
    ];
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const games: SimGame[] = [makeGame(700, 1, "Midwest", 1, 1, 2)];

    const kenpomMap = new Map<string, number>();
    kenpomMap.set("weakdeight", 10.2);
    kenpomMap.set("strongonine", 10);

    // t2Edge = (120 - 110) - (106 - 102) = 10 - 4 = 6 > 4 → matchup adj
    const kenpomDetailsMap = new Map<string, KenPomDetails>();
    kenpomDetailsMap.set("weakdeight", { adjO: 106, adjD: 110 });
    kenpomDetailsMap.set("strongonine", { adjO: 120, adjD: 102 });

    const result = simWithSeed(games, teamsById, kenpomMap, { kenpomDetails: kenpomDetailsMap });
    const pick = result.picks.find((p) => p.gameId === 700);
    expect(pick).toBeDefined();
    expect(pick!.pickedTeamId).toBe(2); // Matchup edge shifts MC probability
  });

  // --- Monte Carlo convergence ---

  it("captures cascading path effects across rounds", () => {
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

    // R2 should pick Dominant regardless of R1 coin flip opponent
    const r2Pick = result.picks.find((p) => p.gameId === 102);
    expect(r2Pick).toBeDefined();
    expect(r2Pick!.pickedTeamId).toBe(3);
  });
});
