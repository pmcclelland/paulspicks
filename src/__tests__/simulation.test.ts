import { describe, it, expect } from "vitest";
import {
  getWinProbability,
  buildKenPomMap,
  simulateTournament,
  simulateTournamentWithActuals,
  runSimulations,
  runSimulationsWithActuals,
  evaluateUserBrackets,
  computeInjuryPenalty,
  type SimTeam,
  type SimGame,
} from "@/lib/simulation";
import { getHistoricalWinRate } from "@/lib/seed-matchup-history";

// Helper: create a team
function makeTeam(id: number, name: string, seed: number, region: string): SimTeam {
  return { id, name, abbreviation: name.slice(0, 4).toUpperCase(), seed, region, logoUrl: null };
}

// Helper: create a game
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

describe("seed-matchup-history", () => {
  it("returns high probability for 1 vs 16", () => {
    const p = getHistoricalWinRate(1, 16, 1);
    expect(p).not.toBeNull();
    expect(p!).toBeGreaterThan(0.95);
  });

  it("returns ~50% for 8 vs 9", () => {
    const p = getHistoricalWinRate(8, 9, 1);
    expect(p).not.toBeNull();
    expect(p!).toBeGreaterThan(0.4);
    expect(p!).toBeLessThan(0.6);
  });

  it("returns complement when seeds are reversed", () => {
    const p1 = getHistoricalWinRate(1, 16, 1)!;
    const p2 = getHistoricalWinRate(16, 1, 1)!;
    expect(p1 + p2).toBeCloseTo(1, 5);
  });

  it("falls back to seed-difference formula for unseen matchups", () => {
    const p = getHistoricalWinRate(1, 15, 4); // unlikely E8 matchup
    expect(p).not.toBeNull();
    // 1 seed should be favored
    expect(p!).toBeGreaterThan(0.5);
  });
});

describe("getWinProbability", () => {
  it("favors team with higher KenPom adjEM", () => {
    const kenpomMap = buildKenPomMap([
      { teamName: "Duke", adjEM: "30" },
      { teamName: "Howard", adjEM: "-5" },
    ]);
    const duke = makeTeam(1, "Duke Blue Devils", 1, "South");
    const howard = makeTeam(2, "Howard Bison", 16, "South");
    const p = getWinProbability(duke, howard, 1, kenpomMap);
    expect(p).toBeGreaterThan(0.9);
  });

  it("returns ~0.5 for evenly matched teams", () => {
    const kenpomMap = buildKenPomMap([
      { teamName: "TeamA", adjEM: "15" },
      { teamName: "TeamB", adjEM: "15" },
    ]);
    const a = makeTeam(1, "TeamA", 5, "East");
    const b = makeTeam(2, "TeamB", 5, "East");
    const p = getWinProbability(a, b, 1, kenpomMap);
    expect(p).toBeCloseTo(0.5, 1);
  });

  it("works with only historical data (no kenpom)", () => {
    const kenpomMap = new Map<string, number>();
    const t1 = makeTeam(1, "UnknownA", 1, "South");
    const t2 = makeTeam(2, "UnknownB", 16, "South");
    const p = getWinProbability(t1, t2, 1, kenpomMap);
    expect(p).toBeGreaterThan(0.9); // Historical 1v16 rate
  });

  it("blends kenpom and historical data", () => {
    const kenpomMap = buildKenPomMap([
      { teamName: "TeamC", adjEM: "15" },
      { teamName: "TeamD", adjEM: "14" },
    ]);
    const t1 = makeTeam(1, "TeamC", 1, "South");
    const t2 = makeTeam(2, "TeamD", 16, "South");
    const p = getWinProbability(t1, t2, 1, kenpomMap);
    // KenPom says ~52%, historical says ~99%, blend: 0.7*0.52 + 0.3*0.99 ≈ 0.66
    // It should be pulled up by historical
    expect(p).toBeGreaterThan(0.55);
  });
});

describe("simulateTournament", () => {
  // Create a minimal 2-region bracket (South + East) for testing
  function createMiniBracket() {
    const teams: SimTeam[] = [
      makeTeam(1, "Team1", 1, "South"),
      makeTeam(2, "Team2", 16, "South"),
      makeTeam(3, "Team3", 8, "South"),
      makeTeam(4, "Team4", 9, "South"),
      makeTeam(5, "Team5", 5, "South"),
      makeTeam(6, "Team6", 12, "South"),
      makeTeam(7, "Team7", 4, "South"),
      makeTeam(8, "Team8", 13, "South"),
      makeTeam(9, "Team9", 6, "South"),
      makeTeam(10, "Team10", 11, "South"),
      makeTeam(11, "Team11", 3, "South"),
      makeTeam(12, "Team12", 14, "South"),
      makeTeam(13, "Team13", 7, "South"),
      makeTeam(14, "Team14", 10, "South"),
      makeTeam(15, "Team15", 2, "South"),
      makeTeam(16, "Team16", 15, "South"),
      // East region
      makeTeam(17, "Team17", 1, "East"),
      makeTeam(18, "Team18", 16, "East"),
      makeTeam(19, "Team19", 8, "East"),
      makeTeam(20, "Team20", 9, "East"),
      makeTeam(21, "Team21", 5, "East"),
      makeTeam(22, "Team22", 12, "East"),
      makeTeam(23, "Team23", 4, "East"),
      makeTeam(24, "Team24", 13, "East"),
      makeTeam(25, "Team25", 6, "East"),
      makeTeam(26, "Team26", 11, "East"),
      makeTeam(27, "Team27", 3, "East"),
      makeTeam(28, "Team28", 14, "East"),
      makeTeam(29, "Team29", 7, "East"),
      makeTeam(30, "Team30", 10, "East"),
      makeTeam(31, "Team31", 2, "East"),
      makeTeam(32, "Team32", 15, "East"),
      // Midwest
      makeTeam(33, "Team33", 1, "Midwest"),
      makeTeam(34, "Team34", 16, "Midwest"),
      makeTeam(35, "Team35", 8, "Midwest"),
      makeTeam(36, "Team36", 9, "Midwest"),
      makeTeam(37, "Team37", 5, "Midwest"),
      makeTeam(38, "Team38", 12, "Midwest"),
      makeTeam(39, "Team39", 4, "Midwest"),
      makeTeam(40, "Team40", 13, "Midwest"),
      makeTeam(41, "Team41", 6, "Midwest"),
      makeTeam(42, "Team42", 11, "Midwest"),
      makeTeam(43, "Team43", 3, "Midwest"),
      makeTeam(44, "Team44", 14, "Midwest"),
      makeTeam(45, "Team45", 7, "Midwest"),
      makeTeam(46, "Team46", 10, "Midwest"),
      makeTeam(47, "Team47", 2, "Midwest"),
      makeTeam(48, "Team48", 15, "Midwest"),
      // West
      makeTeam(49, "Team49", 1, "West"),
      makeTeam(50, "Team50", 16, "West"),
      makeTeam(51, "Team51", 8, "West"),
      makeTeam(52, "Team52", 9, "West"),
      makeTeam(53, "Team53", 5, "West"),
      makeTeam(54, "Team54", 12, "West"),
      makeTeam(55, "Team55", 4, "West"),
      makeTeam(56, "Team56", 13, "West"),
      makeTeam(57, "Team57", 6, "West"),
      makeTeam(58, "Team58", 11, "West"),
      makeTeam(59, "Team59", 3, "West"),
      makeTeam(60, "Team60", 14, "West"),
      makeTeam(61, "Team61", 7, "West"),
      makeTeam(62, "Team62", 10, "West"),
      makeTeam(63, "Team63", 2, "West"),
      makeTeam(64, "Team64", 15, "West"),
    ];

    const games: SimGame[] = [];
    let gameId = 1;

    const regions = ["South", "East", "Midwest", "West"];
    for (const region of regions) {
      const regionTeams = teams.filter((t) => t.region === region);
      // R1: 8 games
      for (let i = 0; i < 8; i++) {
        games.push(makeGame(gameId++, 1, region, i, regionTeams[i * 2].id, regionTeams[i * 2 + 1].id));
      }
      // R2: 4 games
      for (let i = 0; i < 4; i++) games.push(makeGame(gameId++, 2, region, i, null, null));
      // R3: 2 games
      for (let i = 0; i < 2; i++) games.push(makeGame(gameId++, 3, region, i, null, null));
      // R4: 1 game
      games.push(makeGame(gameId++, 4, region, 0, null, null));
    }
    // Final Four: 2 games
    games.push(makeGame(gameId++, 5, "Final Four", 0, null, null));
    games.push(makeGame(gameId++, 5, "Final Four", 1, null, null));
    // Championship
    games.push(makeGame(gameId++, 6, "Final Four", 0, null, null));

    return { teams, games };
  }

  it("produces exactly 63 winners for a full bracket", () => {
    const { teams, games } = createMiniBracket();
    const kenpomMap = new Map<string, number>();
    const winners = simulateTournament(games, new Map(teams.map((t) => [t.id, t])), kenpomMap);
    expect(winners.size).toBe(63);
  });

  it("championship winner is always a valid team", () => {
    const { teams, games } = createMiniBracket();
    const kenpomMap = new Map<string, number>();
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const winners = simulateTournament(games, teamsById, kenpomMap);

    const champGame = games.find((g) => g.round === 6)!;
    const champId = winners.get(champGame.id);
    expect(champId).toBeDefined();
    expect(teamsById.has(champId!)).toBe(true);
  });

  it("runSimulations produces team odds that sum to ~100% for champion", () => {
    const { teams, games } = createMiniBracket();
    const kenpomMap = new Map<string, number>();
    const { teamOdds } = runSimulations(games, teams, kenpomMap, 500);

    const champSum = teamOdds.reduce((sum, t) => sum + t.champion, 0);
    expect(champSum).toBeCloseTo(1, 1);
  });

  it("1-seeds have higher champion probability than 16-seeds", () => {
    const { teams, games } = createMiniBracket();
    const kenpomMap = new Map<string, number>();
    const { teamOdds } = runSimulations(games, teams, kenpomMap, 1000);

    const seed1Avg =
      teamOdds.filter((t) => t.seed === 1).reduce((s, t) => s + t.champion, 0) / 4;
    const seed16Avg =
      teamOdds.filter((t) => t.seed === 16).reduce((s, t) => s + t.champion, 0) / 4;

    expect(seed1Avg).toBeGreaterThan(seed16Avg);
  });
});

describe("evaluateUserBrackets", () => {
  it("user who picked all 1-seeds gets positive expected points", () => {
    // Minimal bracket: 1 game
    const games: SimGame[] = [makeGame(1, 1, "South", 0, 1, 2)];
    const teams: SimTeam[] = [
      makeTeam(1, "Fav", 1, "South"),
      makeTeam(2, "Dog", 16, "South"),
    ];

    // Fake simulation results: team 1 wins 80% of the time
    const simResults: Map<number, number>[] = [];
    for (let i = 0; i < 100; i++) {
      const map = new Map<number, number>();
      map.set(1, i < 80 ? 1 : 2);
      simResults.push(map);
    }

    const projections = evaluateUserBrackets(
      simResults,
      [{ userId: 1, name: "Test", picks: [{ gameId: 1, pickedTeamId: 1 }], isSpectator: false }],
      games
    );

    expect(projections).toHaveLength(1);
    expect(projections[0].expectedPoints).toBeGreaterThan(0);
  });

  it("excludes spectators from projections", () => {
    const games: SimGame[] = [makeGame(1, 1, "South", 0, 1, 2)];
    const simResults = [new Map([[1, 1]])];

    const projections = evaluateUserBrackets(
      simResults,
      [
        { userId: 1, name: "Player", picks: [{ gameId: 1, pickedTeamId: 1 }], isSpectator: false },
        { userId: 2, name: "Spectator", picks: [{ gameId: 1, pickedTeamId: 1 }], isSpectator: true },
      ],
      games
    );

    expect(projections).toHaveLength(1);
    expect(projections[0].name).toBe("Player");
  });
});

describe("simulateTournamentWithActuals", () => {
  it("locks in completed game winners", () => {
    // 2 R1 games feeding into 1 R2 game
    const teams: SimTeam[] = [
      makeTeam(1, "A", 1, "South"),
      makeTeam(2, "B", 16, "South"),
      makeTeam(3, "C", 8, "South"),
      makeTeam(4, "D", 9, "South"),
    ];

    const games: SimGame[] = [
      { id: 1, round: 1, region: "South", gameIndex: 0, team1Id: 1, team2Id: 2, status: "final", winnerTeamId: 2 }, // upset! B wins
      { id: 2, round: 1, region: "South", gameIndex: 1, team1Id: 3, team2Id: 4, status: "scheduled", winnerTeamId: null },
      { id: 3, round: 2, region: "South", gameIndex: 0, team1Id: null, team2Id: null },
    ];

    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const kenpomMap = new Map<string, number>();

    // Run 100 times — game 1 should always be team 2 (locked in)
    for (let i = 0; i < 100; i++) {
      const winners = simulateTournamentWithActuals(games, teamsById, kenpomMap);
      expect(winners.get(1)).toBe(2); // locked-in upset result
      // Game 2 should be simulated (could be 3 or 4)
      expect([3, 4]).toContain(winners.get(2));
      // Game 3 should have team 2 as one participant (from locked-in game 1)
      const r2Winner = winners.get(3);
      expect(r2Winner).toBeDefined();
      expect([2, 3, 4]).toContain(r2Winner); // team 2 from game 1, or 3/4 from game 2
    }
  });

  it("eliminated teams get 0% champion odds", () => {
    // Simple 3-game bracket: 2 R1 + 1 R2
    const teams: SimTeam[] = [
      makeTeam(1, "A", 1, "South"),
      makeTeam(2, "B", 16, "South"),
      makeTeam(3, "C", 8, "South"),
      makeTeam(4, "D", 9, "South"),
    ];

    // Both R1 games completed
    const games: SimGame[] = [
      { id: 1, round: 1, region: "South", gameIndex: 0, team1Id: 1, team2Id: 2, status: "final", winnerTeamId: 1 },
      { id: 2, round: 1, region: "South", gameIndex: 1, team1Id: 3, team2Id: 4, status: "final", winnerTeamId: 3 },
      { id: 3, round: 2, region: "South", gameIndex: 0, team1Id: 1, team2Id: 3 },
    ];

    const { teamOdds } = runSimulationsWithActuals(games, teams, new Map(), 500);

    // Teams 2 and 4 were eliminated — they should never win round 2
    const team2 = teamOdds.find((t) => t.teamId === 2)!;
    const team4 = teamOdds.find((t) => t.teamId === 4)!;
    expect(team2.s16).toBe(0);
    expect(team4.s16).toBe(0);

    // Teams 1 and 3 should share the round 2 wins
    const team1 = teamOdds.find((t) => t.teamId === 1)!;
    const team3 = teamOdds.find((t) => t.teamId === 3)!;
    expect(team1.s16 + team3.s16).toBeCloseTo(1, 1);
  });
});

describe("computeInjuryPenalty", () => {
  it("returns 0 for no injuries", () => {
    expect(computeInjuryPenalty([])).toBe(0);
  });

  it("penalizes Out players at -1.5", () => {
    const penalty = computeInjuryPenalty([{ status: "Out" }]);
    expect(penalty).toBe(-1.5);
  });

  it("penalizes GTD players at -0.5", () => {
    const penalty = computeInjuryPenalty([{ status: "Game Time Decision" }]);
    expect(penalty).toBe(-0.5);
  });

  it("accumulates multiple injuries", () => {
    const penalty = computeInjuryPenalty([
      { status: "Out" },
      { status: "Out" },
      { status: "Game Time Decision" },
    ]);
    expect(penalty).toBe(-3.5);
  });

  it("caps penalty at -6", () => {
    const penalty = computeInjuryPenalty([
      { status: "Out" },
      { status: "Out" },
      { status: "Out" },
      { status: "Out" },
      { status: "Out" },
    ]);
    expect(penalty).toBe(-6);
  });
});

describe("injury integration with win probability", () => {
  it("injuries reduce a team's win probability", () => {
    const kenpomMap = buildKenPomMap([
      { teamName: "Duke", adjEM: "20" },
      { teamName: "Howard", adjEM: "-5" },
    ]);
    const duke = makeTeam(1, "Duke Blue Devils", 1, "South");
    const howard = makeTeam(2, "Howard Bison", 16, "South");

    const probHealthy = getWinProbability(duke, howard, 1, kenpomMap);
    const injuries = new Map<number, number>([[1, -6]]); // Duke badly injured
    const probInjured = getWinProbability(duke, howard, 1, kenpomMap, injuries);

    expect(probInjured).toBeLessThan(probHealthy);
    // Duke still favored (adjEM 20 - 6 = 14 vs -5) but less so
    expect(probInjured).toBeGreaterThan(0.5);
  });
});
