import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { games, teams, picks, users, kenpomRankings, appState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildKenPomMap, type SimGame, type SimTeam } from "@/lib/simulation";
import { generateSimBracket, type GameOddsEntry, type KenPomDetails } from "@/lib/sim-bracket";
import { POINTS_PER_ROUND } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const SIM_USER_EMAIL = "sim@paulspicks.app";
const SIM_USER_NAME = "Monte Carlo";
const APP_STATE_KEY = "sim_bracket_user_id";
const CONFIDENCES_KEY = "sim_bracket_confidences";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find or create sim user
    let simUserId: number;
    const existing = await db
      .select()
      .from(appState)
      .where(eq(appState.key, APP_STATE_KEY));

    if (existing.length > 0) {
      simUserId = parseInt(existing[0].value);
      // Verify user still exists
      const user = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, simUserId));
      if (user.length === 0) {
        // User was deleted, recreate
        const [newUser] = await db
          .insert(users)
          .values({
            email: SIM_USER_EMAIL,
            name: SIM_USER_NAME,
            passwordHash: "$DISABLED$",
            isAdmin: 0,
            isSpectator: 0,
          })
          .returning({ id: users.id });
        simUserId = newUser.id;
        await db
          .insert(appState)
          .values({ key: APP_STATE_KEY, value: String(simUserId) })
          .onConflictDoUpdate({
            target: appState.key,
            set: { value: String(simUserId) },
          });
      }
    } else {
      // Check if user already exists by email
      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, SIM_USER_EMAIL));

      if (existingUser.length > 0) {
        simUserId = existingUser[0].id;
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            email: SIM_USER_EMAIL,
            name: SIM_USER_NAME,
            passwordHash: "$DISABLED$",
            isAdmin: 0,
            isSpectator: 0,
          })
          .returning({ id: users.id });
        simUserId = newUser.id;
      }

      await db
        .insert(appState)
        .values({ key: APP_STATE_KEY, value: String(simUserId) })
        .onConflictDoUpdate({
          target: appState.key,
          set: { value: String(simUserId) },
        });
    }

    // Load data
    const [allGames, allTeams, allKenpom] = await Promise.all([
      db.select().from(games),
      db.select().from(teams),
      db.select().from(kenpomRankings),
    ]);

    const simGames: SimGame[] = allGames
      .filter((g) => g.round >= 1)
      .map((g) => ({
        id: g.id,
        round: g.round,
        region: g.region,
        gameIndex: g.gameIndex,
        team1Id: g.team1Id,
        team2Id: g.team2Id,
      }));

    const simTeams: SimTeam[] = allTeams
      .filter((t) => t.seed < 17 && t.abbreviation !== "TBD")
      .map((t) => ({
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        seed: t.seed,
        region: t.region,
        logoUrl: t.logoUrl,
      }));

    const teamsById = new Map(simTeams.map((t) => [t.id, t]));
    const kenpomMap = buildKenPomMap(allKenpom);

    // Build game odds map from stored moneyline data
    const gameOdds = new Map<number, GameOddsEntry>();
    for (const g of allGames) {
      if (g.moneylineTeam1 && g.moneylineTeam2) {
        gameOdds.set(g.id, {
          moneylineTeam1: g.moneylineTeam1,
          moneylineTeam2: g.moneylineTeam2,
        });
      }
    }

    // Build luck map from KenPom data
    const luckMap = new Map<string, number>();
    for (const k of allKenpom) {
      if (k.luck !== null) {
        luckMap.set(k.teamName.toLowerCase(), parseFloat(k.luck));
      }
    }

    // Build KenPom details map (adjO/adjD) for matchup edge
    const kenpomDetails = new Map<string, KenPomDetails>();
    for (const k of allKenpom) {
      if (k.adjO !== null && k.adjD !== null) {
        kenpomDetails.set(k.teamName.toLowerCase(), {
          adjO: parseFloat(k.adjO),
          adjD: parseFloat(k.adjD),
        });
      }
    }

    // Generate deterministic bracket
    const result = generateSimBracket(simGames, teamsById, kenpomMap, undefined, gameOdds, luckMap, kenpomDetails);

    // Delete existing picks for sim user and insert new ones
    await db.delete(picks).where(eq(picks.userId, simUserId));

    // Build a lookup of completed games for retroactive scoring
    const gamesById = new Map(allGames.map((g) => [g.id, g]));

    if (result.picks.length > 0) {
      await db.insert(picks).values(
        result.picks.map((p) => {
          const game = gamesById.get(p.gameId);
          const isFinal = game?.status === "final" && game.winnerTeamId != null;
          const isCorrect = isFinal && p.pickedTeamId === game.winnerTeamId;
          const pointsForRound = game ? (POINTS_PER_ROUND[game.round] ?? 0) : 0;
          return {
            userId: simUserId,
            gameId: p.gameId,
            pickedTeamId: p.pickedTeamId,
            isCorrect: isFinal ? (isCorrect ? 1 : 0) : null,
            pointsEarned: isCorrect ? pointsForRound : 0,
          };
        })
      );
    }

    // Store confidences in appState
    await db
      .insert(appState)
      .values({ key: CONFIDENCES_KEY, value: JSON.stringify(result.confidences) })
      .onConflictDoUpdate({
        target: appState.key,
        set: { value: JSON.stringify(result.confidences) },
      });

    // Find champion pick
    const championGame = allGames.find((g) => g.round === 6);
    const championPick = result.picks.find((p) => p.gameId === championGame?.id);
    const championTeam = championPick ? teamsById.get(championPick.pickedTeamId) : null;

    return NextResponse.json({
      message: `Sim bracket generated: ${result.picks.length} picks. Champion: ${championTeam?.name ?? "Unknown"}`,
      simUserId,
      totalPicks: result.picks.length,
      champion: championTeam
        ? { name: championTeam.name, abbreviation: championTeam.abbreviation, seed: championTeam.seed }
        : null,
    });
  } catch (error) {
    console.error("Sim bracket error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
