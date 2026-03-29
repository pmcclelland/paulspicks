import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { runSimulation, type SimGame, type SimTeam, type SimPick } from "@/lib/simulation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [allGames, allTeams, allPicks, allUsers] = await Promise.all([
      db.select().from(schema.games),
      db.select().from(schema.teams),
      db.select().from(schema.picks),
      db.select({
        id: schema.users.id,
        name: schema.users.name,
      }).from(schema.users),
    ]);

    // Build teams map
    const teamsMap = new Map<number, SimTeam>();
    for (const t of allTeams) {
      teamsMap.set(t.id, {
        id: t.id,
        name: t.name,
        seed: t.seed,
        logoUrl: t.logoUrl,
      });
    }

    // Convert games to SimGame format
    const simGames: SimGame[] = allGames.map((g) => ({
      id: g.id,
      round: g.round,
      region: g.region,
      gameIndex: g.gameIndex,
      team1Id: g.team1Id,
      team2Id: g.team2Id,
      winnerTeamId: g.winnerTeamId,
      status: g.status,
    }));

    // Convert picks to SimPick format
    const simPicks: SimPick[] = allPicks.map((p) => ({
      userId: p.userId,
      gameId: p.gameId,
      pickedTeamId: p.pickedTeamId,
    }));

    const result = runSimulation(simGames, teamsMap, simPicks, allUsers);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Simulation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
