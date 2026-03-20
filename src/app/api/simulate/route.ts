import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, teams, picks, users, kenpomRankings, appState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { schoolName } from "@/lib/school-names";
import {
  buildKenPomMap,
  runSimulations,
  runSimulationsWithActuals,
  evaluateUserBrackets,
  computeInjuryPenalty,
  type SimGame,
  type SimTeam,
  type SimPick,
} from "@/lib/simulation";

export const dynamic = "force-dynamic";

const CACHE_KEY = "simulation_cache_v4";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const ROTOWIRE_URL = "https://www.rotowire.com/cbasketball/tables/injury-report.php?team=ALL&pos=ALL";

// Rotowire uses different names for some schools
const ROTOWIRE_NAME_MAP: Record<string, string> = {
  "Connecticut": "UConn",
  "Central Florida": "UCF",
  "Hawaii": "Hawai'i",
  "Pennsylvania": "Penn",
  "California Baptist": "Cal Baptist",
  "LIU": "Long Island",
};

type RotowireInjury = {
  player: string;
  team: string;
  position: string;
  injury: string;
  status: string;
};

export async function GET() {
  // Check cache first
  const cached = await db
    .select()
    .from(appState)
    .where(eq(appState.key, CACHE_KEY));

  if (cached.length > 0) {
    try {
      const parsed = JSON.parse(cached[0].value);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        return NextResponse.json(parsed.data);
      }
    } catch {
      // Cache corrupt, regenerate
    }
  }

  // Load all data in parallel (including injuries)
  const [allGames, allTeams, allPicks, allUsers, allKenpom, injuryRes] = await Promise.all([
    db.select().from(games),
    db.select().from(teams),
    db.select().from(picks),
    db.select().from(users),
    db.select().from(kenpomRankings),
    fetch(ROTOWIRE_URL).then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);

  // Build injury penalties per team
  const injuryPenalties = new Map<number, number>();
  const teamInjuryCounts = new Map<number, { out: number; gtd: number; total: number }>();

  if (Array.isArray(injuryRes)) {
    // Map Rotowire team names to our team IDs
    const teamsBySchoolName = new Map<string, number>();
    for (const t of allTeams) {
      teamsBySchoolName.set(schoolName(t.name).toLowerCase(), t.id);
    }

    // Group injuries by team
    const injuriesByTeamId = new Map<number, RotowireInjury[]>();
    for (const entry of injuryRes as RotowireInjury[]) {
      const rotowireName = ROTOWIRE_NAME_MAP[entry.team] ?? entry.team;
      const teamId = teamsBySchoolName.get(rotowireName.toLowerCase());
      if (teamId !== undefined) {
        if (!injuriesByTeamId.has(teamId)) injuriesByTeamId.set(teamId, []);
        injuriesByTeamId.get(teamId)!.push(entry);
      }
    }

    // Compute penalty for each team
    for (const [teamId, injuries] of injuriesByTeamId) {
      const penalty = computeInjuryPenalty(injuries);
      if (penalty !== 0) {
        injuryPenalties.set(teamId, penalty);
      }
      const outCount = injuries.filter((i) => {
        const s = i.status.toLowerCase();
        return s.includes("out") || s.includes("doubtful");
      }).length;
      const gtdCount = injuries.filter((i) => {
        const s = i.status.toLowerCase();
        return s.includes("game time") || s.includes("gtd") || s.includes("questionable") || s.includes("day-to-day");
      }).length;
      teamInjuryCounts.set(teamId, { out: outCount, gtd: gtdCount, total: injuries.length });
    }
  }

  // Build simulation inputs (clean — no status/winner)
  const simGamesClean: SimGame[] = allGames
    .filter((g) => g.round >= 1)
    .map((g) => ({
      id: g.id,
      round: g.round,
      region: g.region,
      gameIndex: g.gameIndex,
      team1Id: g.team1Id,
      team2Id: g.team2Id,
    }));

  // Build simulation inputs (with actuals — includes status/winner)
  const simGamesActuals: SimGame[] = allGames
    .filter((g) => g.round >= 1)
    .map((g) => ({
      id: g.id,
      round: g.round,
      region: g.region,
      gameIndex: g.gameIndex,
      team1Id: g.team1Id,
      team2Id: g.team2Id,
      status: g.status,
      winnerTeamId: g.winnerTeamId,
    }));

  const simTeams: SimTeam[] = allTeams
    .filter((t) => t.seed < 17 && t.abbreviation !== "TBD") // Exclude First Four placeholders
    .map((t) => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      seed: t.seed,
      region: t.region,
      logoUrl: t.logoUrl,
    }));

  const kenpomMap = buildKenPomMap(allKenpom);
  const teamsById = new Map(simTeams.map((t) => [t.id, t]));

  const SIM_COUNT = 10000;

  // Run both simulation modes with injury penalties
  const { teamOdds: cleanTeamOdds, simulationResults: cleanSimResults } =
    runSimulations(simGamesClean, simTeams, kenpomMap, SIM_COUNT, injuryPenalties);

  const { teamOdds: liveTeamOdds, simulationResults: liveSimResults } =
    runSimulationsWithActuals(simGamesActuals, simTeams, kenpomMap, SIM_COUNT, injuryPenalties);

  // Find championship game to determine champion picks
  const championshipGame = allGames.find((g) => g.round === 6);

  // Build per-user pick data
  const userPicksGrouped = new Map<
    number,
    { picks: SimPick[]; name: string; isSpectator: boolean; championPick: { teamName: string; abbreviation: string; seed: number; logoUrl: string | null } | null }
  >();

  for (const user of allUsers) {
    userPicksGrouped.set(user.id, {
      picks: [],
      name: user.name,
      isSpectator: user.isSpectator === 1,
      championPick: null,
    });
  }

  for (const pick of allPicks) {
    const userData = userPicksGrouped.get(pick.userId);
    if (userData) {
      userData.picks.push({ gameId: pick.gameId, pickedTeamId: pick.pickedTeamId });

      if (championshipGame && pick.gameId === championshipGame.id) {
        const team = teamsById.get(pick.pickedTeamId);
        if (team) {
          userData.championPick = {
            teamName: team.name,
            abbreviation: team.abbreviation,
            seed: team.seed,
            logoUrl: team.logoUrl,
          };
        }
      }
    }
  }

  const userPicksArray = Array.from(userPicksGrouped.entries()).map(
    ([userId, data]) => ({
      userId,
      name: data.name,
      picks: data.picks,
      isSpectator: data.isSpectator,
      championPick: data.championPick,
    })
  );

  // Evaluate user brackets against BOTH simulation sets
  const cleanUserProjections = evaluateUserBrackets(
    cleanSimResults,
    userPicksArray,
    simGamesClean
  );

  const liveUserProjections = evaluateUserBrackets(
    liveSimResults,
    userPicksArray,
    simGamesActuals
  );

  // Sort
  cleanTeamOdds.sort((a, b) => b.champion - a.champion);
  liveTeamOdds.sort((a, b) => b.champion - a.champion);
  cleanUserProjections.sort((a, b) => b.winProbability - a.winProbability);
  liveUserProjections.sort((a, b) => b.winProbability - a.winProbability);

  // Count completed games for display
  const completedGames = allGames.filter((g) => g.round >= 1 && g.status === "final").length;
  const totalGames = allGames.filter((g) => g.round >= 1).length;

  // Build injury summary for UI display
  const injuredTeams: { teamId: number; abbreviation: string; out: number; gtd: number; penalty: number }[] = [];
  for (const [teamId, counts] of teamInjuryCounts) {
    const team = teamsById.get(teamId);
    const penalty = injuryPenalties.get(teamId) ?? 0;
    if (team && penalty !== 0) {
      injuredTeams.push({
        teamId,
        abbreviation: team.abbreviation,
        out: counts.out,
        gtd: counts.gtd,
        penalty,
      });
    }
  }
  injuredTeams.sort((a, b) => a.penalty - b.penalty); // most penalized first

  // Compute per-game win probabilities from live simulation results
  const gameOdds: Record<number, { team1Prob: number; team2Prob: number }> = {};
  {
    // Build a map of gameId -> { team1Id, team2Id } from actual game data
    const gameTeams = new Map<number, { team1Id: number | null; team2Id: number | null }>();
    for (const g of allGames) {
      if (g.round >= 1) {
        gameTeams.set(g.id, { team1Id: g.team1Id, team2Id: g.team2Id });
      }
    }

    // Count wins per game
    const gameWinCounts = new Map<number, Map<number, number>>();
    for (const simWinners of liveSimResults) {
      for (const [gameId, winnerId] of simWinners) {
        if (!gameWinCounts.has(gameId)) gameWinCounts.set(gameId, new Map());
        const counts = gameWinCounts.get(gameId)!;
        counts.set(winnerId, (counts.get(winnerId) || 0) + 1);
      }
    }

    // Convert to probabilities keyed by team1/team2 slot
    for (const [gameId, winCounts] of gameWinCounts) {
      const gt = gameTeams.get(gameId);
      if (!gt) continue;

      // For games with known teams, use team1Id/team2Id to assign slots
      // For future-round games, the simulation fills in teams dynamically,
      // so we just report the two most common winners as team1/team2
      let team1Wins = 0;
      let team2Wins = 0;
      let totalWins = 0;

      for (const [winnerId, count] of winCounts) {
        totalWins += count;
        if (gt.team1Id && winnerId === gt.team1Id) {
          team1Wins += count;
        } else if (gt.team2Id && winnerId === gt.team2Id) {
          team2Wins += count;
        }
      }

      // For future-round games where team1Id/team2Id are null,
      // distribute wins proportionally among all winners
      if (!gt.team1Id && !gt.team2Id && totalWins > 0) {
        // Sort winners by frequency, assign top to team1, rest to team2
        const sorted = Array.from(winCounts.entries()).sort((a, b) => b[1] - a[1]);
        team1Wins = sorted[0]?.[1] || 0;
        team2Wins = totalWins - team1Wins;
      } else if ((!gt.team1Id || !gt.team2Id) && totalWins > 0) {
        // One team known, one unknown — the "other" slot gets remaining wins
        if (!gt.team1Id) team1Wins = totalWins - team2Wins;
        if (!gt.team2Id) team2Wins = totalWins - team1Wins;
      }

      if (totalWins > 0) {
        gameOdds[gameId] = {
          team1Prob: team1Wins / totalWins,
          team2Prob: team2Wins / totalWins,
        };
      }
    }
  }

  const responseData = {
    // Clean (from-scratch) predictions
    teamOdds: cleanTeamOdds,
    userProjections: cleanUserProjections,
    // Live (actuals-aware) predictions
    liveTeamOdds,
    liveUserProjections,
    // Per-game win probabilities
    gameOdds,
    // Meta
    simulationCount: SIM_COUNT,
    completedGames,
    totalGames,
    injuredTeams,
  };

  // Cache the results
  const cacheValue = JSON.stringify({
    timestamp: Date.now(),
    data: responseData,
  });

  await db
    .insert(appState)
    .values({ key: CACHE_KEY, value: cacheValue })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value: cacheValue },
    });

  return NextResponse.json(responseData);
}
