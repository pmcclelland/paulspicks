import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { games, teams, picks, users, appState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { POINTS_PER_ROUND } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const ROUND_NAMES: Record<number, string> = {
  1: "Round of 64",
  2: "Round of 32",
  3: "Sweet 16",
  4: "Elite Eight",
  5: "Final Four",
  6: "Championship",
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get sim user ID
    const simUserState = await db
      .select()
      .from(appState)
      .where(eq(appState.key, "sim_bracket_user_id"));

    if (simUserState.length === 0) {
      return NextResponse.json({ error: "Sim bracket not generated yet" }, { status: 404 });
    }

    const simUserId = parseInt(simUserState[0].value);

    // Get sim user info
    const simUser = await db
      .select()
      .from(users)
      .where(eq(users.id, simUserId));

    if (simUser.length === 0) {
      return NextResponse.json({ error: "Sim bracket user not found" }, { status: 404 });
    }

    // Load data in parallel
    const [simPicks, allGames, allTeams, allPicks, allUsers, confidencesState] =
      await Promise.all([
        db.select().from(picks).where(eq(picks.userId, simUserId)),
        db.select().from(games),
        db.select().from(teams),
        db.select().from(picks),
        db.select().from(users),
        db
          .select()
          .from(appState)
          .where(eq(appState.key, "sim_bracket_confidences")),
      ]);

    const confidences: Record<number, number> = confidencesState.length > 0
      ? JSON.parse(confidencesState[0].value)
      : {};

    const teamsById = new Map(allTeams.map((t) => [t.id, t]));
    const gamesById = new Map(allGames.map((g) => [g.id, g]));

    // === Round-by-round breakdown ===
    const roundStats: {
      round: number;
      roundName: string;
      correct: number;
      total: number;
      points: number;
      maxPossible: number;
    }[] = [];

    for (let r = 1; r <= 6; r++) {
      const roundPicks = simPicks.filter((p) => {
        const game = gamesById.get(p.gameId);
        return game && game.round === r;
      });
      const correct = roundPicks.filter((p) => p.isCorrect === 1).length;
      const pointsEarned = roundPicks.reduce((sum, p) => sum + (p.pointsEarned ?? 0), 0);
      const gamesInRound = allGames.filter((g) => g.round === r).length;

      roundStats.push({
        round: r,
        roundName: ROUND_NAMES[r],
        correct,
        total: roundPicks.length,
        points: pointsEarned,
        maxPossible: gamesInRound * (POINTS_PER_ROUND[r] ?? 0),
      });
    }

    const totalPoints = roundStats.reduce((sum, r) => sum + r.points, 0);

    // === Ranking among non-spectator users ===
    const nonSpectatorUsers = allUsers.filter((u) => u.isSpectator !== 1);
    const userPoints = new Map<number, number>();
    for (const u of nonSpectatorUsers) {
      userPoints.set(u.id, 0);
    }
    for (const pick of allPicks) {
      if (userPoints.has(pick.userId) && pick.isCorrect === 1) {
        userPoints.set(pick.userId, (userPoints.get(pick.userId) ?? 0) + (pick.pointsEarned ?? 0));
      }
    }
    const sortedPoints = Array.from(userPoints.values()).sort((a, b) => b - a);
    const rank = sortedPoints.findIndex((p) => p <= totalPoints) + 1;
    const humansBeaten = nonSpectatorUsers.filter(
      (u) => u.id !== simUserId && (userPoints.get(u.id) ?? 0) < totalPoints
    ).length;
    const totalParticipants = nonSpectatorUsers.length;

    // === Confidence calibration ===
    const buckets = [
      { label: "50-60%", min: 0.5, max: 0.6, correct: 0, total: 0 },
      { label: "60-70%", min: 0.6, max: 0.7, correct: 0, total: 0 },
      { label: "70-80%", min: 0.7, max: 0.8, correct: 0, total: 0 },
      { label: "80-90%", min: 0.8, max: 0.9, correct: 0, total: 0 },
      { label: "90-100%", min: 0.9, max: 1.01, correct: 0, total: 0 },
    ];

    for (const pick of simPicks) {
      const game = gamesById.get(pick.gameId);
      if (!game || game.status !== "final") continue;

      const conf = confidences[pick.gameId] ?? 0.5;
      for (const bucket of buckets) {
        if (conf >= bucket.min && conf < bucket.max) {
          bucket.total++;
          if (pick.isCorrect === 1) bucket.correct++;
          break;
        }
      }
    }

    const calibration = buckets
      .filter((b) => b.total > 0)
      .map((b) => ({
        label: b.label,
        expectedMidpoint: (b.min + b.max) / 2,
        actual: b.total > 0 ? b.correct / b.total : 0,
        correct: b.correct,
        total: b.total,
      }));

    // === Surprise upsets (sim had >60% confidence but was wrong, final games only) ===
    const surprises = simPicks
      .filter((p) => {
        const game = gamesById.get(p.gameId);
        const conf = confidences[p.gameId] ?? 0.5;
        return game && game.status === "final" && conf > 0.6 && p.isCorrect === 0;
      })
      .map((p) => {
        const game = gamesById.get(p.gameId)!;
        const pickedTeam = teamsById.get(p.pickedTeamId);
        const winnerId = game.winnerTeamId;
        const actualWinner = winnerId ? teamsById.get(winnerId) : null;
        return {
          gameId: p.gameId,
          round: game.round,
          roundName: ROUND_NAMES[game.round],
          confidence: confidences[p.gameId] ?? 0.5,
          pickedTeam: pickedTeam
            ? {
                name: pickedTeam.name,
                abbreviation: pickedTeam.abbreviation,
                seed: pickedTeam.seed,
                logoUrl: pickedTeam.logoUrl,
              }
            : null,
          actualWinner: actualWinner
            ? {
                name: actualWinner.name,
                abbreviation: actualWinner.abbreviation,
                seed: actualWinner.seed,
                logoUrl: actualWinner.logoUrl,
              }
            : null,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    // === Champion path ===
    const championPath: {
      round: number;
      roundName: string;
      gameId: number;
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
      confidence: number;
      isCorrect: number | null;
      gameStatus: string;
    }[] = [];

    // Find champion pick (R6)
    const championshipGame = allGames.find((g) => g.round === 6);
    const championPick = simPicks.find((p) => p.gameId === championshipGame?.id);
    const championTeamId = championPick?.pickedTeamId;

    if (championTeamId) {
      // Trace this team's path through all rounds
      for (let r = 1; r <= 6; r++) {
        const pickForRound = simPicks.find((p) => {
          const game = gamesById.get(p.gameId);
          return game && game.round === r && p.pickedTeamId === championTeamId;
        });

        if (!pickForRound) {
          // Check if the champion was picked for a game that it was part of in this round
          const gameInRound = simPicks.find((p) => {
            const game = gamesById.get(p.gameId);
            if (!game || game.round !== r) return false;
            // Check if the sim bracket picked this champion team as the winner in this game's chain
            return p.pickedTeamId === championTeamId;
          });
          if (!gameInRound) continue;
        }

        const pick = pickForRound!;
        const game = gamesById.get(pick.gameId)!;
        const pickedTeam = teamsById.get(pick.pickedTeamId)!;

        // Find opponent (the other team in this game from the sim bracket's perspective)
        let opponentId: number | null = null;
        if (game.team1Id && game.team2Id) {
          opponentId = pick.pickedTeamId === game.team1Id ? game.team2Id : game.team1Id;
        }
        // For later rounds, opponent might have been propagated by the sim
        const opponent = opponentId ? teamsById.get(opponentId) : null;

        championPath.push({
          round: r,
          roundName: ROUND_NAMES[r],
          gameId: pick.gameId,
          pickedTeam: {
            name: pickedTeam.name,
            abbreviation: pickedTeam.abbreviation,
            seed: pickedTeam.seed,
            logoUrl: pickedTeam.logoUrl,
          },
          opponent: opponent
            ? {
                name: opponent.name,
                abbreviation: opponent.abbreviation,
                seed: opponent.seed,
                logoUrl: opponent.logoUrl,
              }
            : null,
          confidence: confidences[pick.gameId] ?? 0.5,
          isCorrect: pick.isCorrect,
          gameStatus: game.status,
        });
      }
    }

    return NextResponse.json({
      simUserId,
      name: simUser[0].name,
      totalPoints,
      rank,
      humansBeaten,
      totalParticipants,
      roundStats,
      calibration,
      surprises,
      championPath,
      championTeam: championTeamId ? (() => {
        const t = teamsById.get(championTeamId);
        return t ? { name: t.name, abbreviation: t.abbreviation, seed: t.seed, logoUrl: t.logoUrl } : null;
      })() : null,
    });
  } catch (error) {
    console.error("Sim bracket stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
