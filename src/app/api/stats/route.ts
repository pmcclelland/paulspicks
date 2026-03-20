import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games, teams, kenpomRankings, picks, users, playerStats } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { schoolName } from "@/lib/school-names";
import { ROUND_NAMES } from "@/lib/bracket-utils";
import { refreshScoresIfStale } from "@/lib/refresh-scores";
import {
  HISTORICAL_UPSETS_PER_ROUND,
  HISTORICAL_SEED_WIN_RATES,
  HISTORICAL_CONFERENCE_TOURNAMENT_WINS,
  HISTORICAL_AVERAGE_MARGIN,
} from "@/lib/historical-constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Auto-refresh scores from ESPN if stale
    try {
      await refreshScoresIfStale();
    } catch (e) {
      console.warn("Stats auto-refresh failed:", e);
    }

    const [allGames, allTeams, allKenpom, allPicks, allUsers] = await Promise.all([
      db.select().from(games),
      db.select().from(teams),
      db.select().from(kenpomRankings),
      db.select().from(picks),
      db.select().from(users),
    ]);

    const teamMap = new Map(allTeams.map((t) => [t.id, t]));
    const kenpomMap = new Map(allKenpom.map((k) => [k.teamName, k]));
    const nonSpectatorUserIds = new Set(allUsers.filter((u) => !u.isSpectator).map((u) => u.id));

    // Helper: get kenpom row for a team
    function getKenpom(team: (typeof allTeams)[0]) {
      return kenpomMap.get(schoolName(team.name)) ?? null;
    }

    // --- Summary ---
    const completedGames = allGames.filter((g) => g.status === "final");
    const inProgressGames = allGames.filter((g) => g.status === "in_progress");
    const scheduledGames = allGames.filter((g) => g.status === "scheduled");
    const currentRound = allGames.reduce((max, g) => {
      if (g.status === "final" || g.status === "in_progress") return Math.max(max, g.round);
      return max;
    }, 0);

    const summary = {
      gamesCompleted: completedGames.length,
      gamesRemaining: scheduledGames.length,
      gamesInProgress: inProgressGames.length,
      totalGames: allGames.length,
      currentRound,
      currentRoundName: ROUND_NAMES[currentRound] || `Round ${currentRound}`,
    };

    // --- Upsets ---
    const upsetsByRound: Record<number, number> = {};
    const biggestUpsets: {
      round: number;
      seedDiff: number;
      winner: { name: string; abbreviation: string; seed: number; logoUrl: string | null };
      loser: { name: string; abbreviation: string; seed: number; logoUrl: string | null };
      score: string;
    }[] = [];

    for (const game of completedGames) {
      if (!game.winnerTeamId || !game.team1Id || !game.team2Id) continue;
      const team1 = teamMap.get(game.team1Id);
      const team2 = teamMap.get(game.team2Id);
      if (!team1 || !team2) continue;

      const winner = game.winnerTeamId === team1.id ? team1 : team2;
      const loser = game.winnerTeamId === team1.id ? team2 : team1;
      const winnerScore = game.winnerTeamId === team1.id ? game.team1Score : game.team2Score;
      const loserScore = game.winnerTeamId === team1.id ? game.team2Score : game.team1Score;

      if (winner.seed > loser.seed) {
        upsetsByRound[game.round] = (upsetsByRound[game.round] || 0) + 1;
        biggestUpsets.push({
          round: game.round,
          seedDiff: winner.seed - loser.seed,
          winner: { name: winner.name, abbreviation: winner.abbreviation, seed: winner.seed, logoUrl: winner.logoUrl },
          loser: { name: loser.name, abbreviation: loser.abbreviation, seed: loser.seed, logoUrl: loser.logoUrl },
          score: `${winnerScore}-${loserScore}`,
        });
      }
    }
    biggestUpsets.sort((a, b) => b.seedDiff - a.seedDiff);

    const totalUpsets = Object.values(upsetsByRound).reduce((s, v) => s + v, 0);

    const upsetTracker = Object.keys(HISTORICAL_UPSETS_PER_ROUND).map((r) => {
      const round = Number(r);
      return {
        round,
        roundName: ROUND_NAMES[round] || `Round ${round}`,
        actual: upsetsByRound[round] || 0,
        historical: HISTORICAL_UPSETS_PER_ROUND[round],
      };
    });

    // --- Seed Performance ---
    // Only track seeds 1-16 (valid tournament seeds)
    const seedStats: Record<number, { wins: number; losses: number; teamsRemaining: number }> = {};
    for (let s = 1; s <= 16; s++) seedStats[s] = { wins: 0, losses: 0, teamsRemaining: 0 };

    // Filter to teams actually in the bracket (assigned to a game), with valid seeds
    const teamsInBracket = new Set<number>();
    for (const game of allGames) {
      if (game.team1Id) teamsInBracket.add(game.team1Id);
      if (game.team2Id) teamsInBracket.add(game.team2Id);
    }
    const tournamentTeams = allTeams.filter((t) => t.seed >= 1 && t.seed <= 16 && teamsInBracket.has(t.id));

    // Track eliminated teams
    const eliminatedTeamIds = new Set<number>();
    for (const game of completedGames) {
      if (!game.winnerTeamId || !game.team1Id || !game.team2Id) continue;
      const loserId = game.winnerTeamId === game.team1Id ? game.team2Id : game.team1Id;
      eliminatedTeamIds.add(loserId);
      const winner = teamMap.get(game.winnerTeamId);
      const loser = teamMap.get(loserId);
      if (winner && seedStats[winner.seed]) seedStats[winner.seed].wins++;
      if (loser && seedStats[loser.seed]) seedStats[loser.seed].losses++;
    }

    for (const team of tournamentTeams) {
      if (!eliminatedTeamIds.has(team.id)) {
        seedStats[team.seed].teamsRemaining++;
      }
    }

    const seedPerformance = Object.entries(seedStats).map(([seed, stats]) => {
      const s = Number(seed);
      const totalGamesPlayed = stats.wins + stats.losses;
      const actualWinRate = totalGamesPlayed > 0 ? (stats.wins / totalGamesPlayed) * 100 : null;
      const historicalR1 = HISTORICAL_SEED_WIN_RATES[1]?.[s] ?? null;
      return {
        seed: s,
        wins: stats.wins,
        losses: stats.losses,
        teamsRemaining: stats.teamsRemaining,
        actualWinRate,
        historicalWinRate: historicalR1,
      };
    });

    // --- Conference Performance ---
    const conferenceData: Record<string, {
      conference: string;
      wins: number;
      losses: number;
      teamsRemaining: number;
      teams: { name: string; abbreviation: string; seed: number; logoUrl: string | null; eliminated: boolean }[];
    }> = {};

    // Helper: get conference for a team (from DB, fall back to KenPom)
    function getConference(team: (typeof allTeams)[0]): string {
      if (team.conference) return team.conference;
      const kp = getKenpom(team);
      return kp?.conference || "Unknown";
    }

    for (const team of tournamentTeams) {
      const conf = getConference(team);
      if (!conferenceData[conf]) {
        conferenceData[conf] = { conference: conf, wins: 0, losses: 0, teamsRemaining: 0, teams: [] };
      }
      const eliminated = eliminatedTeamIds.has(team.id);
      conferenceData[conf].teams.push({
        name: team.name,
        abbreviation: team.abbreviation,
        seed: team.seed,
        logoUrl: team.logoUrl,
        eliminated,
      });
      if (!eliminated) conferenceData[conf].teamsRemaining++;
    }

    // Count wins/losses by conference
    for (const game of completedGames) {
      if (!game.winnerTeamId || !game.team1Id || !game.team2Id) continue;
      const winner = teamMap.get(game.winnerTeamId);
      const loserId = game.winnerTeamId === game.team1Id ? game.team2Id : game.team1Id;
      const loser = teamMap.get(loserId);
      if (winner) {
        const wConf = getConference(winner);
        if (conferenceData[wConf]) conferenceData[wConf].wins++;
      }
      if (loser) {
        const lConf = getConference(loser);
        if (conferenceData[lConf]) conferenceData[lConf].losses++;
      }
    }

    const conferencePerformance = Object.values(conferenceData)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
      .map((c) => ({
        ...c,
        historicalAvgWins: HISTORICAL_CONFERENCE_TOURNAMENT_WINS[c.conference] ?? null,
        teams: c.teams.sort((a, b) => a.seed - b.seed),
      }));

    // --- Game Extremes ---
    const gamesWithMargin = completedGames
      .filter((g) => g.team1Score !== null && g.team2Score !== null)
      .map((g) => {
        const margin = Math.abs((g.team1Score ?? 0) - (g.team2Score ?? 0));
        const team1 = g.team1Id ? teamMap.get(g.team1Id) : null;
        const team2 = g.team2Id ? teamMap.get(g.team2Id) : null;
        return {
          round: g.round,
          roundName: ROUND_NAMES[g.round] || `Round ${g.round}`,
          margin,
          team1: team1 ? { name: team1.name, abbreviation: team1.abbreviation, seed: team1.seed, logoUrl: team1.logoUrl } : null,
          team2: team2 ? { name: team2.name, abbreviation: team2.abbreviation, seed: team2.seed, logoUrl: team2.logoUrl } : null,
          score: `${g.team1Score}-${g.team2Score}`,
          isOvertime: g.statusDetail?.toLowerCase().includes("ot") ?? false,
        };
      });

    const closestGames = [...gamesWithMargin].sort((a, b) => a.margin - b.margin).slice(0, 5);
    const biggestBlowouts = [...gamesWithMargin].sort((a, b) => b.margin - a.margin).slice(0, 5);
    const overtimeCount = gamesWithMargin.filter((g) => g.isOvertime).length;
    const avgMargin = gamesWithMargin.length > 0
      ? gamesWithMargin.reduce((s, g) => s + g.margin, 0) / gamesWithMargin.length
      : 0;

    // --- Betting Insights ---
    let favoritesCovered = 0;
    let totalBettableGames = 0;
    let underdogOutrightWins = 0;
    let totalSpreadError = 0;

    for (const game of completedGames) {
      if (!game.spreadLine || !game.team1Score || !game.team2Score) continue;
      const spread = parseFloat(game.spreadLine);
      if (isNaN(spread)) continue;

      totalBettableGames++;
      // spreadLine is typically negative for favorite (team1 perspective)
      const actualMargin = game.team1Score - game.team2Score;
      const coveredSpread = actualMargin + spread < 0; // team1 covered if they beat the spread
      if (spread < 0) {
        // team1 is favorite
        if (actualMargin + spread < 0) favoritesCovered++;
        if (actualMargin < 0) underdogOutrightWins++;
      } else if (spread > 0) {
        // team2 is favorite
        if (actualMargin + spread > 0) favoritesCovered++;
        if (actualMargin > 0) underdogOutrightWins++;
      }
      totalSpreadError += Math.abs(actualMargin - (-spread));
    }

    const bettingInsights = {
      favoritesCoveringPct: totalBettableGames > 0 ? (favoritesCovered / totalBettableGames) * 100 : null,
      underdogOutrightWins,
      avgSpreadError: totalBettableGames > 0 ? totalSpreadError / totalBettableGames : null,
      totalBettableGames,
    };

    // --- Pool Pick Insights ---
    const poolPicks = allPicks.filter((p) => nonSpectatorUserIds.has(p.userId));

    // Most picked champion (round 6 picks)
    const championshipGames = allGames.filter((g) => g.round === 6);
    const championshipGameIds = new Set(championshipGames.map((g) => g.id));
    const championPicks: Record<number, number> = {};
    for (const pick of poolPicks) {
      if (championshipGameIds.has(pick.gameId)) {
        championPicks[pick.pickedTeamId] = (championPicks[pick.pickedTeamId] || 0) + 1;
      }
    }
    const mostPickedChampionEntry = Object.entries(championPicks).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const mostPickedChampion = mostPickedChampionEntry
      ? (() => {
          const team = teamMap.get(Number(mostPickedChampionEntry[0]));
          return team
            ? { name: team.name, abbreviation: team.abbreviation, seed: team.seed, logoUrl: team.logoUrl, count: Number(mostPickedChampionEntry[1]) }
            : null;
        })()
      : null;

    // Chalk score: % of picks choosing higher seed
    let chalkPicks = 0;
    let totalPicksWithSeeds = 0;
    for (const pick of poolPicks) {
      const game = allGames.find((g) => g.id === pick.gameId);
      if (!game || !game.team1Id || !game.team2Id) continue;
      const team1 = teamMap.get(game.team1Id);
      const team2 = teamMap.get(game.team2Id);
      if (!team1 || !team2) continue;
      totalPicksWithSeeds++;
      const pickedTeam = pick.pickedTeamId === team1.id ? team1 : team2;
      const otherTeam = pick.pickedTeamId === team1.id ? team2 : team1;
      if (pickedTeam.seed < otherTeam.seed) chalkPicks++;
    }
    const chalkScore = totalPicksWithSeeds > 0 ? (chalkPicks / totalPicksWithSeeds) * 100 : null;

    // Hardest game to pick (closest to 50/50)
    const gamePickSplits: { gameId: number; team1Picks: number; team2Picks: number; total: number; splitPct: number;
      team1: { name: string; abbreviation: string; seed: number; logoUrl: string | null } | null;
      team2: { name: string; abbreviation: string; seed: number; logoUrl: string | null } | null;
      round: number;
    }[] = [];

    for (const game of allGames) {
      if (!game.team1Id || !game.team2Id) continue;
      const gamePicks = poolPicks.filter((p) => p.gameId === game.id);
      if (gamePicks.length < 2) continue;
      const team1Picks = gamePicks.filter((p) => p.pickedTeamId === game.team1Id).length;
      const team2Picks = gamePicks.filter((p) => p.pickedTeamId === game.team2Id).length;
      const total = team1Picks + team2Picks;
      const splitPct = Math.abs(50 - (team1Picks / total) * 100);
      const t1 = teamMap.get(game.team1Id);
      const t2 = teamMap.get(game.team2Id);
      gamePickSplits.push({
        gameId: game.id,
        team1Picks,
        team2Picks,
        total,
        splitPct,
        team1: t1 ? { name: t1.name, abbreviation: t1.abbreviation, seed: t1.seed, logoUrl: t1.logoUrl } : null,
        team2: t2 ? { name: t2.name, abbreviation: t2.abbreviation, seed: t2.seed, logoUrl: t2.logoUrl } : null,
        round: game.round,
      });
    }
    gamePickSplits.sort((a, b) => a.splitPct - b.splitPct);
    const hardestGameToPick = gamePickSplits[0] || null;

    const poolPickInsights = {
      mostPickedChampion,
      chalkScore,
      hardestGameToPick,
      totalPoolParticipants: nonSpectatorUserIds.size,
    };

    // --- KenPom Insights ---
    const remainingTeams = tournamentTeams.filter((t) => !eliminatedTeamIds.has(t.id));
    const remainingWithKenpom = remainingTeams
      .map((t) => {
        const kp = getKenpom(t);
        return kp
          ? { name: t.name, abbreviation: t.abbreviation, seed: t.seed, logoUrl: t.logoUrl, adjEM: parseFloat(kp.adjEM || "0"), rank: kp.rank }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b!.adjEM - a!.adjEM);

    const topRemainingByAdjEM = remainingWithKenpom.slice(0, 5);

    // Biggest KenPom upsets: winner had worse KenPom rank than loser
    const kenpomUpsets: {
      winner: { name: string; abbreviation: string; seed: number; logoUrl: string | null; rank: number };
      loser: { name: string; abbreviation: string; seed: number; logoUrl: string | null; rank: number };
      rankDiff: number;
      round: number;
      score: string;
    }[] = [];

    for (const game of completedGames) {
      if (!game.winnerTeamId || !game.team1Id || !game.team2Id) continue;
      const winner = teamMap.get(game.winnerTeamId);
      const loserId = game.winnerTeamId === game.team1Id ? game.team2Id : game.team1Id;
      const loser = teamMap.get(loserId);
      if (!winner || !loser) continue;
      const winnerKp = getKenpom(winner);
      const loserKp = getKenpom(loser);
      if (!winnerKp || !loserKp) continue;
      if (winnerKp.rank > loserKp.rank) {
        const winnerScore = game.winnerTeamId === game.team1Id ? game.team1Score : game.team2Score;
        const loserScore = game.winnerTeamId === game.team1Id ? game.team2Score : game.team1Score;
        kenpomUpsets.push({
          winner: { name: winner.name, abbreviation: winner.abbreviation, seed: winner.seed, logoUrl: winner.logoUrl, rank: winnerKp.rank },
          loser: { name: loser.name, abbreviation: loser.abbreviation, seed: loser.seed, logoUrl: loser.logoUrl, rank: loserKp.rank },
          rankDiff: winnerKp.rank - loserKp.rank,
          round: game.round,
          score: `${winnerScore}-${loserScore}`,
        });
      }
    }
    kenpomUpsets.sort((a, b) => b.rankDiff - a.rankDiff);

    // --- Player Leaders ---
    // Fetch box scores from ESPN for completed games that don't have player stats yet
    const existingStatGameIds = new Set(
      (await db.select({ gameId: playerStats.gameId }).from(playerStats)).map((r) => r.gameId)
    );
    const gamesToFetch = completedGames.filter(
      (g) => g.espnEventId && !existingStatGameIds.has(g.id)
    );

    const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";
    // Fetch up to 5 at a time to avoid slow requests on first load
    for (const game of gamesToFetch.slice(0, 5)) {
      try {
        const res = await fetch(`${ESPN_BASE}/summary?event=${game.espnEventId}`);
        if (!res.ok) continue;
        const data = await res.json();
        const boxPlayers = data?.boxscore?.players || [];
        for (const teamBox of boxPlayers) {
          const espnTeamId = teamBox?.team?.id;
          const dbTeam = espnTeamId ? allTeams.find((t) => t.espnTeamId === espnTeamId) : null;
          const stats = teamBox?.statistics?.[0];
          if (!stats?.athletes) continue;
          const labels: string[] = stats.labels || [];
          const ptsIdx = labels.indexOf("PTS");
          const rebIdx = labels.indexOf("REB");
          const astIdx = labels.indexOf("AST");
          const stlIdx = labels.indexOf("STL");
          const blkIdx = labels.indexOf("BLK");
          const toIdx = labels.indexOf("TO");
          const minIdx = labels.indexOf("MIN");
          const fgIdx = labels.indexOf("FG");
          const tpIdx = labels.indexOf("3PT");
          const ftIdx = labels.indexOf("FT");

          for (const athlete of stats.athletes) {
            const s = athlete.stats || [];
            if (!s.length || s[0] === "--") continue; // DNP
            const espnAthleteId = athlete.athlete?.id || "";
            const name = athlete.athlete?.displayName || "";
            if (!espnAthleteId || !name) continue;

            function parseNum(idx: number): number {
              return idx >= 0 && s[idx] ? parseInt(s[idx], 10) || 0 : 0;
            }
            function parseFrac(idx: number): [number, number] {
              if (idx < 0 || !s[idx]) return [0, 0];
              const parts = s[idx].split("-");
              return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0];
            }

            const [fgM, fgA] = parseFrac(fgIdx);
            const [tpM, tpA] = parseFrac(tpIdx);
            const [ftM, ftA] = parseFrac(ftIdx);

            try {
              await db.insert(playerStats).values({
                gameId: game.id,
                espnAthleteId,
                name,
                teamId: dbTeam?.id ?? null,
                minutes: parseNum(minIdx),
                points: parseNum(ptsIdx),
                rebounds: parseNum(rebIdx),
                assists: parseNum(astIdx),
                steals: parseNum(stlIdx),
                blocks: parseNum(blkIdx),
                turnovers: parseNum(toIdx),
                fgMade: fgM,
                fgAttempted: fgA,
                threePtMade: tpM,
                threePtAttempted: tpA,
                ftMade: ftM,
                ftAttempted: ftA,
              });
            } catch {
              // Ignore duplicates
            }
          }
        }
      } catch {
        // Skip failed fetches
      }
    }

    // Aggregate player leaders from cached stats
    const allPlayerStats = await db.select().from(playerStats);

    // Aggregate by player (espnAthleteId)
    const playerAgg: Record<string, {
      name: string;
      espnAthleteId: string;
      teamId: number | null;
      gamesPlayed: number;
      totalPoints: number;
      totalRebounds: number;
      totalAssists: number;
      totalBlocks: number;
      totalSteals: number;
    }> = {};

    for (const ps of allPlayerStats) {
      if (!playerAgg[ps.espnAthleteId]) {
        playerAgg[ps.espnAthleteId] = {
          name: ps.name,
          espnAthleteId: ps.espnAthleteId,
          teamId: ps.teamId,
          gamesPlayed: 0,
          totalPoints: 0,
          totalRebounds: 0,
          totalAssists: 0,
          totalBlocks: 0,
          totalSteals: 0,
        };
      }
      const p = playerAgg[ps.espnAthleteId];
      p.gamesPlayed++;
      p.totalPoints += ps.points ?? 0;
      p.totalRebounds += ps.rebounds ?? 0;
      p.totalAssists += ps.assists ?? 0;
      p.totalBlocks += ps.blocks ?? 0;
      p.totalSteals += ps.steals ?? 0;
    }

    const playerList = Object.values(playerAgg);

    function buildLeaderboard(sortKey: "totalPoints" | "totalRebounds" | "totalAssists" | "totalBlocks" | "totalSteals", perGameKey: string) {
      return playerList
        .filter((p) => p.gamesPlayed > 0)
        .sort((a, b) => b[sortKey] - a[sortKey])
        .slice(0, 5)
        .map((p) => {
          const team = p.teamId ? teamMap.get(p.teamId) : null;
          return {
            name: p.name,
            team: team ? { name: team.name, abbreviation: team.abbreviation, seed: team.seed, logoUrl: team.logoUrl } : null,
            total: p[sortKey],
            gamesPlayed: p.gamesPlayed,
            perGame: Math.round((p[sortKey] / p.gamesPlayed) * 10) / 10,
          };
        });
    }

    const playerLeaders = {
      points: buildLeaderboard("totalPoints", "ppg"),
      rebounds: buildLeaderboard("totalRebounds", "rpg"),
      assists: buildLeaderboard("totalAssists", "apg"),
      blocks: buildLeaderboard("totalBlocks", "bpg"),
    };

    return NextResponse.json({
      summary,
      upsets: {
        total: totalUpsets,
        byRound: upsetTracker,
        biggest: biggestUpsets.slice(0, 5),
      },
      seedPerformance,
      conferencePerformance,
      gameExtremes: {
        closestGames,
        biggestBlowouts,
        overtimeCount,
        avgMargin: Math.round(avgMargin * 10) / 10,
        historicalAvgMargin: HISTORICAL_AVERAGE_MARGIN,
      },
      bettingInsights,
      poolPickInsights,
      kenpomInsights: {
        topRemainingByAdjEM,
        biggestKenpomUpsets: kenpomUpsets.slice(0, 5),
      },
      playerLeaders,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
