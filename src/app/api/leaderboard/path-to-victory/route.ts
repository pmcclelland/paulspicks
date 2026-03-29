import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { POINTS_PER_ROUND } from "@/lib/scoring";
import { ROUND_NAMES } from "@/lib/bracket-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [allUsers, allPicks, allGames, allTeams] = await Promise.all([
      db
        .select()
        .from(schema.users)
        .where(
          or(eq(schema.users.isSpectator, 0), isNull(schema.users.isSpectator))
        ),
      db
        .select({
          userId: schema.picks.userId,
          gameId: schema.picks.gameId,
          pickedTeamId: schema.picks.pickedTeamId,
          pointsEarned: schema.picks.pointsEarned,
          isCorrect: schema.picks.isCorrect,
          round: schema.games.round,
          gameStatus: schema.games.status,
          winnerTeamId: schema.games.winnerTeamId,
        })
        .from(schema.picks)
        .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id)),
      db.select().from(schema.games),
      db.select().from(schema.teams),
    ]);

    const teamsMap = new Map(allTeams.map((t) => [t.id, t]));
    const gamesMap = new Map(allGames.map((g) => [g.id, g]));
    const userNameMap = new Map(allUsers.map((u) => [u.id, u.name]));
    const userIdSet = new Set(allUsers.map((u) => u.id));

    // Build eliminated teams set
    const eliminatedTeamIds = new Set<number>();
    for (const game of allGames) {
      if (
        game.status === "final" &&
        game.winnerTeamId &&
        game.team1Id &&
        game.team2Id
      ) {
        const loserId =
          game.winnerTeamId === game.team1Id ? game.team2Id : game.team1Id;
        eliminatedTeamIds.add(loserId);
      }
    }

    // Compute current points per user
    const currentPoints = new Map<number, number>();
    for (const user of allUsers) {
      currentPoints.set(user.id, 0);
    }
    for (const pick of allPicks) {
      if (!userIdSet.has(pick.userId)) continue;
      if (pick.isCorrect === 1) {
        currentPoints.set(
          pick.userId,
          (currentPoints.get(pick.userId) ?? 0) + (pick.pointsEarned ?? 0)
        );
      }
    }

    // Build per-game pick map: gameId -> { teamId -> userId[] }
    // Only for remaining games (not final, at least one alive team picked)
    const gamePickMap = new Map<number, Map<number, number[]>>();
    for (const pick of allPicks) {
      if (!userIdSet.has(pick.userId)) continue;
      if (pick.gameStatus === "final") continue;
      if (eliminatedTeamIds.has(pick.pickedTeamId)) continue;

      if (!gamePickMap.has(pick.gameId)) {
        gamePickMap.set(pick.gameId, new Map());
      }
      const teamPickers = gamePickMap.get(pick.gameId)!;
      if (!teamPickers.has(pick.pickedTeamId)) {
        teamPickers.set(pick.pickedTeamId, []);
      }
      teamPickers.get(pick.pickedTeamId)!.push(pick.userId);
    }

    // Build per-user pick lookup: userId -> gameId -> pickedTeamId
    const userPickMap = new Map<number, Map<number, number>>();
    for (const pick of allPicks) {
      if (!userIdSet.has(pick.userId)) continue;
      if (!userPickMap.has(pick.userId)) {
        userPickMap.set(pick.userId, new Map());
      }
      userPickMap.get(pick.userId)!.set(pick.gameId, pick.pickedTeamId);
    }

    // Get championship picks for display
    const championPicks = new Map<
      number,
      {
        teamName: string;
        abbreviation: string;
        seed: number;
        logoUrl: string | null;
      }
    >();
    for (const pick of allPicks) {
      const game = gamesMap.get(pick.gameId);
      if (game && game.round === 6) {
        const team = teamsMap.get(pick.pickedTeamId);
        if (team) {
          championPicks.set(pick.userId, {
            teamName: team.name,
            abbreviation: team.abbreviation,
            seed: team.seed,
            logoUrl: team.logoUrl,
          });
        }
      }
    }

    // Compute points remaining per user
    const pointsRemaining = new Map<number, number>();
    for (const user of allUsers) {
      pointsRemaining.set(user.id, 0);
    }
    for (const pick of allPicks) {
      if (!userIdSet.has(pick.userId)) continue;
      if (
        pick.gameStatus !== "final" &&
        !eliminatedTeamIds.has(pick.pickedTeamId)
      ) {
        pointsRemaining.set(
          pick.userId,
          (pointsRemaining.get(pick.userId) ?? 0) +
            (POINTS_PER_ROUND[pick.round ?? 1] ?? 0)
        );
      }
    }

    // Compute best case points
    const bestCasePoints = new Map<number, number>();
    for (const user of allUsers) {
      bestCasePoints.set(
        user.id,
        (currentPoints.get(user.id) ?? 0) +
          (pointsRemaining.get(user.id) ?? 0)
      );
    }

    // Current ranks
    const sortedByPoints = [...allUsers]
      .map((u) => ({ userId: u.id, pts: currentPoints.get(u.id) ?? 0 }))
      .sort((a, b) => b.pts - a.pts);
    const currentRankMap = new Map<number, number>();
    let rank = 1;
    for (let i = 0; i < sortedByPoints.length; i++) {
      if (i > 0 && sortedByPoints[i].pts < sortedByPoints[i - 1].pts) {
        rank = i + 1;
      }
      currentRankMap.set(sortedByPoints[i].userId, rank);
    }

    const maxCurrentPoints = Math.max(
      ...allUsers.map((u) => currentPoints.get(u.id) ?? 0)
    );

    // Helper to build team info
    function teamInfo(teamId: number | null) {
      if (!teamId) return null;
      const t = teamsMap.get(teamId);
      if (!t) return null;
      return {
        name: t.name,
        abbreviation: t.abbreviation,
        seed: t.seed,
        logoUrl: t.logoUrl,
      };
    }

    // For each user, build their path to victory:
    // For each remaining game, determine the outcome this user needs and
    // show the cross-bracket impact (which named users gain/lose points)
    const entries = allUsers.map((user) => {
      const userId = user.id;
      const userPts = currentPoints.get(userId) ?? 0;
      const userBest = bestCasePoints.get(userId) ?? 0;
      const userRemaining = pointsRemaining.get(userId) ?? 0;

      const bestCaseRank =
        1 +
        allUsers.filter(
          (u) =>
            u.id !== userId && (currentPoints.get(u.id) ?? 0) > userBest
        ).length;

      const worstCaseRank =
        1 +
        allUsers.filter(
          (u) =>
            u.id !== userId &&
            (bestCasePoints.get(u.id) ?? 0) > userPts
        ).length;

      const canStillWin = userBest >= maxCurrentPoints;

      // Build needed outcomes for this user
      // Two categories:
      // 1. "Needs to win" — games where this user has a live pick
      // 2. "Needs to lose" — games where this user has NO live pick (their team
      //    eliminated or they agree with everyone) BUT a competitor ahead has a
      //    live pick, so this user needs the competitor's pick to lose
      type OutcomeEntry = {
        gameId: number;
        round: number;
        roundName: string;
        pointsAvailable: number;
        neededWinner: {
          name: string;
          abbreviation: string;
          seed: number;
          logoUrl: string | null;
        };
        opponent: {
          name: string;
          abbreviation: string;
          seed: number;
          logoUrl: string | null;
        } | null;
        type: "win" | "lose";
        gameStatus: string;
        // Cross-bracket impact: who gains and who loses points from this outcome
        usersGaining: { name: string; points: number }[];
        usersLosing: { name: string; points: number }[];
      };

      const outcomes: OutcomeEntry[] = [];
      const processedGames = new Set<number>();

      // Category 1: Games where this user has a live pick
      for (const [gameId, teamPickers] of gamePickMap) {
        const game = gamesMap.get(gameId);
        if (!game) continue;

        const myPick = userPickMap.get(userId)?.get(gameId);
        if (!myPick || eliminatedTeamIds.has(myPick)) continue;

        // Check if this user's pick is in the live picks for this game
        const myTeamPickers = teamPickers.get(myPick);
        if (!myTeamPickers || !myTeamPickers.includes(userId)) continue;

        processedGames.add(gameId);

        const pts = POINTS_PER_ROUND[game.round] ?? 0;
        const pickedTeamInfo = teamInfo(myPick);
        if (!pickedTeamInfo) continue;

        // Opponent is the other team in the game
        const opponentTeamId =
          game.team1Id === myPick ? game.team2Id : game.team1Id;

        // Who gains points if my pick wins (same team pickers)
        const usersGaining: { name: string; points: number }[] = [];
        const usersLosing: { name: string; points: number }[] = [];
        const samePickers = teamPickers.get(myPick) ?? [];
        for (const uid of samePickers) {
          if (uid === userId) continue;
          usersGaining.push({ name: userNameMap.get(uid) ?? "?", points: pts });
        }
        // Who loses points if my pick wins (other team pickers)
        for (const [tid, pickers] of teamPickers) {
          if (tid === myPick) continue;
          for (const uid of pickers) {
            if (uid === userId) continue;
            usersLosing.push({
              name: userNameMap.get(uid) ?? "?",
              points: pts,
            });
          }
        }

        outcomes.push({
          gameId,
          round: game.round,
          roundName: ROUND_NAMES[game.round] ?? `Round ${game.round}`,
          pointsAvailable: pts,
          neededWinner: pickedTeamInfo,
          opponent: teamInfo(opponentTeamId),
          type: "win",
          gameStatus: game.status,
          usersGaining,
          usersLosing,
        });
      }

      // Category 2: Games where this user does NOT have a live pick,
      // but competitors do — user needs the outcome that hurts competitors
      // (especially those ahead in standings)
      for (const [gameId, teamPickers] of gamePickMap) {
        if (processedGames.has(gameId)) continue;

        const game = gamesMap.get(gameId);
        if (!game) continue;

        // Collect all competitors with live picks in this game
        const competitorsByTeam = new Map<number, string[]>(); // teamId -> names
        for (const [tid, pickers] of teamPickers) {
          const names = pickers
            .filter((uid) => uid !== userId)
            .map((uid) => userNameMap.get(uid) ?? "?");
          if (names.length > 0) {
            competitorsByTeam.set(tid, names);
          }
        }

        if (competitorsByTeam.size === 0) continue;

        // If all competitors picked the same team, user needs the OTHER team to win
        // If competitors split, pick the outcome that hurts the most competitors
        // (especially those ahead in the standings)
        const pts = POINTS_PER_ROUND[game.round] ?? 0;
        const teamEntries = [...competitorsByTeam.entries()];

        // For each possible team that could win, compute how many competitor
        // points are lost. User wants to maximize competitors' pain.
        // Find which team winning would deny the most points to competitors
        // ahead of this user.
        let bestOutcomeTeam: number | null = null;
        let bestOutcomeLosing: { name: string; points: number }[] = [];
        let bestOutcomeGaining: { name: string; points: number }[] = [];
        let bestScore = -1;

        // Get all teams involved in live picks for this game
        const teamsInGame = new Set<number>();
        for (const [tid] of teamPickers) teamsInGame.add(tid);
        // Also add any team in the game itself that's alive
        if (game.team1Id && !eliminatedTeamIds.has(game.team1Id))
          teamsInGame.add(game.team1Id);
        if (game.team2Id && !eliminatedTeamIds.has(game.team2Id))
          teamsInGame.add(game.team2Id);

        for (const winnerTeamId of teamsInGame) {
          const losing: { name: string; points: number }[] = [];
          const gaining: { name: string; points: number }[] = [];

          for (const [tid, names] of teamEntries) {
            if (tid === winnerTeamId) {
              for (const n of names) gaining.push({ name: n, points: pts });
            } else {
              for (const n of names) losing.push({ name: n, points: pts });
            }
          }

          // Score: prefer outcomes that hurt more competitors (weighted by
          // whether they're ahead of us)
          const score = losing.length;
          if (score > bestScore) {
            bestScore = score;
            bestOutcomeTeam = winnerTeamId;
            bestOutcomeLosing = losing;
            bestOutcomeGaining = gaining;
          }
        }

        if (bestOutcomeTeam && bestScore > 0) {
          const winnerInfo = teamInfo(bestOutcomeTeam);
          if (!winnerInfo) continue;

          const opponentTeamId =
            game.team1Id === bestOutcomeTeam ? game.team2Id : game.team1Id;

          outcomes.push({
            gameId,
            round: game.round,
            roundName: ROUND_NAMES[game.round] ?? `Round ${game.round}`,
            pointsAvailable: pts,
            neededWinner: winnerInfo,
            opponent: teamInfo(opponentTeamId),
            type: "lose",
            gameStatus: game.status,
            usersGaining: bestOutcomeGaining,
            usersLosing: bestOutcomeLosing,
          });
        }
      }

      // Sort: "win" outcomes first, then by round (later rounds = more points),
      // then by number of competitors hurt
      outcomes.sort((a, b) => {
        // Wins first
        if (a.type !== b.type) return a.type === "win" ? -1 : 1;
        // Higher points first
        if (b.pointsAvailable !== a.pointsAvailable)
          return b.pointsAvailable - a.pointsAvailable;
        // More competitors hurt first
        return b.usersLosing.length - a.usersLosing.length;
      });

      return {
        userId,
        name: user.name,
        currentPoints: userPts,
        currentRank: currentRankMap.get(userId) ?? allUsers.length,
        bestCasePoints: userBest,
        bestCaseRank,
        worstCaseRank,
        canStillWin,
        championPick: championPicks.get(userId) ?? null,
        outcomes,
        totalPointsRemaining: userRemaining,
      };
    });

    // Sort: canStillWin first, then bestCaseRank asc, then currentPoints desc
    entries.sort((a, b) => {
      if (a.canStillWin !== b.canStillWin) return a.canStillWin ? -1 : 1;
      if (a.bestCaseRank !== b.bestCaseRank)
        return a.bestCaseRank - b.bestCaseRank;
      return b.currentPoints - a.currentPoints;
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Path to victory error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
