import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { games, teams, kenpomRankings } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { REGIONS } from "@/lib/bracket-utils";

export const dynamic = "force-dynamic";

// Historical upset rates by seed matchup (lower seed wins %)
const HISTORICAL_UPSET_RATES: Record<string, number> = {
  "1v16": 0.02,
  "2v15": 0.06,
  "3v14": 0.15,
  "4v13": 0.20,
  "5v12": 0.35,
  "6v11": 0.37,
  "7v10": 0.39,
  "8v9":  0.48,
};

// Target number of upsets per round (historical averages)
const TARGET_UPSETS_PER_ROUND: Record<number, [number, number]> = {
  1: [5, 9],   // R1: 5-9 upsets (of 32 games)
  2: [2, 5],   // R2: 2-5 upsets (of 16 games)
  3: [1, 3],   // Sweet 16: 1-3 upsets
  4: [0, 2],   // Elite 8: 0-2 upsets
  5: [0, 1],   // Final Four: 0-1
  6: [0, 1],   // Championship: 0-1
};

type TeamInfo = {
  id: number;
  name: string;
  seed: number;
  region: string;
  kenpomRank: number; // 1-365, lower = better
  adjEM: number;
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickWinner(
  team1: TeamInfo,
  team2: TeamInfo,
  round: number,
  random: () => number,
  forceWinner?: number // teamId to force as winner
): number {
  if (forceWinner === team1.id) return team1.id;
  if (forceWinner === team2.id) return team2.id;

  const higherSeed = team1.seed <= team2.seed ? team1 : team2;
  const lowerSeed = team1.seed <= team2.seed ? team2 : team1;

  // Base upset probability from historical rates (R1 only has fixed matchups)
  let upsetProb: number;
  if (round === 1) {
    const key = `${higherSeed.seed}v${lowerSeed.seed}`;
    upsetProb = HISTORICAL_UPSET_RATES[key] ?? 0.3;
  } else {
    // Later rounds: base upset rate from seed difference
    const seedDiff = lowerSeed.seed - higherSeed.seed;
    upsetProb = seedDiff <= 1 ? 0.45 : seedDiff <= 3 ? 0.35 : seedDiff <= 5 ? 0.25 : 0.15;
  }

  // Adjust based on KenPom rankings
  // If the lower seed has a significantly better KenPom rank, increase upset probability
  const kenpomDiff = higherSeed.kenpomRank - lowerSeed.kenpomRank;
  if (kenpomDiff > 0) {
    // Higher seed has WORSE kenpom — boost upset prob
    const boost = Math.min(kenpomDiff / 100, 0.25);
    upsetProb = Math.min(upsetProb + boost, 0.75);
  } else {
    // Higher seed has better kenpom — reduce upset prob
    const reduction = Math.min(Math.abs(kenpomDiff) / 150, 0.2);
    upsetProb = Math.max(upsetProb - reduction, 0.03);
  }

  // AdjEM comparison as a tiebreaker signal
  const emDiff = lowerSeed.adjEM - higherSeed.adjEM;
  if (emDiff > 5) {
    // Lower seed is significantly better by efficiency
    upsetProb = Math.min(upsetProb + 0.15, 0.8);
  } else if (emDiff > 0) {
    upsetProb = Math.min(upsetProb + 0.08, 0.65);
  }

  const roll = random();
  return roll < upsetProb ? lowerSeed.id : higherSeed.id;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.isSpectator) {
      return NextResponse.json({ error: "Spectators cannot submit picks" }, { status: 403 });
    }

    const body = await request.json();
    const championTeamId: number = body.championTeamId;

    if (!championTeamId) {
      return NextResponse.json({ error: "championTeamId required" }, { status: 400 });
    }

    // Load all data
    const allGames = await db.select().from(games).orderBy(asc(games.round), asc(games.gameIndex));
    const allTeams = await db.select().from(teams);
    const allKenpom = await db.select().from(kenpomRankings);

    const teamMap = new Map(allTeams.map((t) => [t.id, t]));

    // Build KenPom lookup by team name (fuzzy)
    function findKenpom(name: string) {
      const lower = name.toLowerCase();
      return allKenpom.find(
        (k) =>
          k.teamName.toLowerCase() === lower ||
          lower.includes(k.teamName.toLowerCase()) ||
          k.teamName.toLowerCase().includes(lower)
      );
    }

    // Build TeamInfo for each team
    const teamInfoMap = new Map<number, TeamInfo>();
    for (const t of allTeams) {
      const kp = findKenpom(t.name);
      teamInfoMap.set(t.id, {
        id: t.id,
        name: t.name,
        seed: t.seed,
        region: t.region,
        kenpomRank: kp?.rank ?? 200,
        adjEM: kp ? parseFloat(kp.adjEM!) : 0,
      });
    }

    // Verify champion exists
    const champion = teamInfoMap.get(championTeamId);
    if (!champion) {
      return NextResponse.json({ error: "Champion team not found" }, { status: 400 });
    }

    // Find the champion's path: which gameIds they must win
    const championRegion = champion.region;
    const championPath = new Set<number>(); // gameIds the champion plays in

    // Build game lookup by round+region+gameIndex
    const gameLookup = new Map<string, typeof allGames[0]>();
    for (const g of allGames) {
      gameLookup.set(`${g.round}-${g.region}-${g.gameIndex}`, g);
    }

    // Find champion's R1 game
    const r1Games = allGames.filter((g) => g.round === 1 && g.region === championRegion);
    const champR1 = r1Games.find((g) => g.team1Id === championTeamId || g.team2Id === championTeamId);
    if (!champR1) {
      return NextResponse.json({ error: "Champion not found in any R1 game" }, { status: 400 });
    }

    // Trace champion's path through the bracket
    championPath.add(champR1.id);
    let currentGameIndex = champR1.gameIndex;
    let currentRegion = championRegion;

    for (let round = 2; round <= 6; round++) {
      const nextGameIndex = Math.floor(currentGameIndex / 2);
      let nextRegion = currentRegion;

      if (round === 5) {
        // E8 → FF: map region to FF game index
        const regionIdx = REGIONS.indexOf(currentRegion as typeof REGIONS[number]);
        const ffGameIndex = Math.floor(regionIdx / 2);
        const ffGame = gameLookup.get(`5-Final Four-${ffGameIndex}`);
        if (ffGame) {
          championPath.add(ffGame.id);
          currentGameIndex = ffGameIndex;
          currentRegion = "Final Four";
        }
        continue;
      }

      if (round === 6) {
        const champGame = gameLookup.get("6-Final Four-0");
        if (champGame) championPath.add(champGame.id);
        continue;
      }

      const nextGame = gameLookup.get(`${round}-${nextRegion}-${nextGameIndex}`);
      if (nextGame) {
        championPath.add(nextGame.id);
        currentGameIndex = nextGameIndex;
      }
    }

    // Simulate the bracket round by round
    const random = seededRandom(Date.now());
    const picks = new Map<number, number>(); // gameId → winnerId
    const winners = new Map<string, number>(); // "round-region-gameIndex" → winnerId

    // R1: pick all winners
    for (const game of allGames.filter((g) => g.round === 1)) {
      if (!game.team1Id || !game.team2Id) continue;
      const t1 = teamInfoMap.get(game.team1Id);
      const t2 = teamInfoMap.get(game.team2Id);
      if (!t1 || !t2) continue;

      const forceWinner = championPath.has(game.id) ? championTeamId : undefined;
      const winner = pickWinner(t1, t2, 1, random, forceWinner);
      picks.set(game.id, winner);
      winners.set(`1-${game.region}-${game.gameIndex}`, winner);
    }

    // R2 through E8 (within regions)
    for (let round = 2; round <= 4; round++) {
      const gamesPerRegion = Math.pow(2, 4 - round);
      for (const region of REGIONS) {
        for (let idx = 0; idx < gamesPerRegion; idx++) {
          const game = gameLookup.get(`${round}-${region}-${idx}`);
          if (!game) continue;

          // Get feeders
          const feeder1Key = `${round - 1}-${region}-${idx * 2}`;
          const feeder2Key = `${round - 1}-${region}-${idx * 2 + 1}`;
          const team1Id = winners.get(feeder1Key);
          const team2Id = winners.get(feeder2Key);
          if (!team1Id || !team2Id) continue;

          const t1 = teamInfoMap.get(team1Id);
          const t2 = teamInfoMap.get(team2Id);
          if (!t1 || !t2) continue;

          const forceWinner = championPath.has(game.id) ? championTeamId : undefined;
          const winner = pickWinner(t1, t2, round, random, forceWinner);
          picks.set(game.id, winner);
          winners.set(`${round}-${region}-${idx}`, winner);
        }
      }
    }

    // Final Four (round 5)
    for (let idx = 0; idx < 2; idx++) {
      const game = gameLookup.get(`5-Final Four-${idx}`);
      if (!game) continue;

      // Feeders: E8 winners from paired regions
      const region1 = REGIONS[idx * 2];
      const region2 = REGIONS[idx * 2 + 1];
      const team1Id = winners.get(`4-${region1}-0`);
      const team2Id = winners.get(`4-${region2}-0`);
      if (!team1Id || !team2Id) continue;

      const t1 = teamInfoMap.get(team1Id);
      const t2 = teamInfoMap.get(team2Id);
      if (!t1 || !t2) continue;

      const forceWinner = championPath.has(game.id) ? championTeamId : undefined;
      const winner = pickWinner(t1, t2, 5, random, forceWinner);
      picks.set(game.id, winner);
      winners.set(`5-Final Four-${idx}`, winner);
    }

    // Championship (round 6)
    const champGame = gameLookup.get("6-Final Four-0");
    if (champGame) {
      const team1Id = winners.get("5-Final Four-0");
      const team2Id = winners.get("5-Final Four-1");
      if (team1Id && team2Id) {
        const t1 = teamInfoMap.get(team1Id);
        const t2 = teamInfoMap.get(team2Id);
        if (t1 && t2) {
          // Champion must win
          picks.set(champGame.id, championTeamId);
        }
      }
    }

    const picksArray = Array.from(picks.entries()).map(([gameId, pickedTeamId]) => ({
      gameId,
      pickedTeamId,
    }));

    return NextResponse.json({
      picks: picksArray,
      championTeamId,
      totalPicks: picksArray.length,
    });
  } catch (error) {
    console.error("Autopick error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
