import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { POINTS_PER_ROUND } from "@/lib/scoring";
import { ROUND_NAMES } from "@/lib/bracket-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch all data in parallel
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

    // Build team lookup
    const teamsMap = new Map(allTeams.map((t) => [t.id, t]));

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

    // Build games lookup
    const gamesMap = new Map(allGames.map((g) => [g.id, g]));

    // Compute current points and remaining points per user
    const userStats = new Map<
      number,
      { currentPoints: number; pointsRemaining: number }
    >();
    for (const user of allUsers) {
      userStats.set(user.id, { currentPoints: 0, pointsRemaining: 0 });
    }

    // For each non-final game, track who picked which team
    const gamePickMap = new Map<
      number,
      Map<number, number[]>
    >(); // gameId -> teamId -> userId[]

    for (const pick of allPicks) {
      const stats = userStats.get(pick.userId);
      if (!stats) continue;

      // Accumulate current points
      if (pick.isCorrect === 1) {
        stats.currentPoints += pick.pointsEarned ?? 0;
      }

      // Track remaining points and build pick maps for non-final games
      if (
        pick.gameStatus !== "final" &&
        !eliminatedTeamIds.has(pick.pickedTeamId)
      ) {
        stats.pointsRemaining += POINTS_PER_ROUND[pick.round ?? 1] ?? 0;

        // Track who picked what in this game
        if (!gamePickMap.has(pick.gameId)) {
          gamePickMap.set(pick.gameId, new Map());
        }
        const teamPickers = gamePickMap.get(pick.gameId)!;
        if (!teamPickers.has(pick.pickedTeamId)) {
          teamPickers.set(pick.pickedTeamId, []);
        }
        teamPickers.get(pick.pickedTeamId)!.push(pick.userId);
      }
    }

    // Get championship picks for each user
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

    // Compute best/worst case for all users first
    const allUserData: {
      userId: number;
      currentPoints: number;
      bestCasePoints: number;
    }[] = [];
    for (const user of allUsers) {
      const stats = userStats.get(user.id)!;
      allUserData.push({
        userId: user.id,
        currentPoints: stats.currentPoints,
        bestCasePoints: stats.currentPoints + stats.pointsRemaining,
      });
    }

    // Assign current ranks
    const sortedByPoints = [...allUserData].sort(
      (a, b) => b.currentPoints - a.currentPoints
    );
    const currentRankMap = new Map<number, number>();
    let currentRank = 1;
    for (let i = 0; i < sortedByPoints.length; i++) {
      if (
        i > 0 &&
        sortedByPoints[i].currentPoints < sortedByPoints[i - 1].currentPoints
      ) {
        currentRank = i + 1;
      }
      currentRankMap.set(sortedByPoints[i].userId, currentRank);
    }

    const maxCurrentPoints = Math.max(
      ...allUserData.map((u) => u.currentPoints)
    );

    // Build entries
    const entries = allUsers.map((user) => {
      const stats = userStats.get(user.id)!;
      const bestCasePoints = stats.currentPoints + stats.pointsRemaining;

      // Best case rank: how many users have current points already above my best case?
      const bestCaseRank =
        1 +
        allUserData.filter(
          (u) => u.userId !== user.id && u.currentPoints > bestCasePoints
        ).length;

      // Worst case rank: how many users could end up above my current points?
      const worstCaseRank =
        1 +
        allUserData.filter(
          (u) => u.userId !== user.id && u.bestCasePoints > stats.currentPoints
        ).length;

      const canStillWin = bestCasePoints >= maxCurrentPoints;

      // Build needed outcomes from this user's remaining picks
      const neededOutcomes: {
        gameId: number;
        round: number;
        roundName: string;
        pointsAvailable: number;
        pickedTeam: {
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
        othersAgree: number;
        othersDisagree: number;
        gameStatus: string;
      }[] = [];

      for (const pick of allPicks) {
        if (pick.userId !== user.id) continue;
        if (pick.gameStatus === "final") continue;
        if (eliminatedTeamIds.has(pick.pickedTeamId)) continue;

        const game = gamesMap.get(pick.gameId);
        if (!game) continue;

        const pickedTeam = teamsMap.get(pick.pickedTeamId);
        if (!pickedTeam) continue;

        // Find opponent in this game
        const opponentTeamId =
          game.team1Id === pick.pickedTeamId ? game.team2Id : game.team1Id;
        const opponentTeam = opponentTeamId
          ? teamsMap.get(opponentTeamId)
          : null;

        // Count who agrees/disagrees on this game
        const pickersByTeam = gamePickMap.get(pick.gameId);
        let othersAgree = 0;
        let othersDisagree = 0;
        if (pickersByTeam) {
          for (const [teamId, userIds] of pickersByTeam) {
            const otherCount = userIds.filter((id) => id !== user.id).length;
            if (teamId === pick.pickedTeamId) {
              othersAgree = otherCount;
            } else {
              othersDisagree += otherCount;
            }
          }
        }

        const round = game.round;
        neededOutcomes.push({
          gameId: game.id,
          round,
          roundName: ROUND_NAMES[round] ?? `Round ${round}`,
          pointsAvailable: POINTS_PER_ROUND[round] ?? 0,
          pickedTeam: {
            name: pickedTeam.name,
            abbreviation: pickedTeam.abbreviation,
            seed: pickedTeam.seed,
            logoUrl: pickedTeam.logoUrl,
          },
          opponent: opponentTeam
            ? {
                name: opponentTeam.name,
                abbreviation: opponentTeam.abbreviation,
                seed: opponentTeam.seed,
                logoUrl: opponentTeam.logoUrl,
              }
            : null,
          othersAgree,
          othersDisagree,
          gameStatus: game.status,
        });
      }

      // Sort by impact: points * disagreement count (highest swing first)
      neededOutcomes.sort(
        (a, b) =>
          b.pointsAvailable * b.othersDisagree -
          a.pointsAvailable * a.othersDisagree
      );

      return {
        userId: user.id,
        name: user.name,
        currentPoints: stats.currentPoints,
        currentRank: currentRankMap.get(user.id) ?? allUsers.length,
        bestCasePoints,
        bestCaseRank,
        worstCaseRank,
        canStillWin,
        championPick: championPicks.get(user.id) ?? null,
        neededOutcomes,
        totalPointsRemaining: stats.pointsRemaining,
      };
    });

    // Sort: canStillWin first, then by bestCaseRank asc, then currentPoints desc
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
