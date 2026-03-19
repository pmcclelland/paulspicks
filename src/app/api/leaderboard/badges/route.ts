import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Badge = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  userId: number | null;
  userName: string | null;
  stat: string;
};

export async function GET() {
  try {
    const allPicks = await db
      .select({
        userId: schema.picks.userId,
        gameId: schema.picks.gameId,
        pickedTeamId: schema.picks.pickedTeamId,
        isCorrect: schema.picks.isCorrect,
        pointsEarned: schema.picks.pointsEarned,
      })
      .from(schema.picks);

    const allGames = await db.select().from(schema.games);
    const allTeams = await db.select().from(schema.teams);
    const allUsers = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users);

    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
    const teamMap = new Map(allTeams.map((t) => [t.id, t]));
    const gameMap = new Map(allGames.map((g) => [g.id, g]));

    // Group picks by user
    const picksByUser = new Map<number, typeof allPicks>();
    for (const pick of allPicks) {
      if (!picksByUser.has(pick.userId)) {
        picksByUser.set(pick.userId, []);
      }
      picksByUser.get(pick.userId)!.push(pick);
    }

    // Count picks per team per game (for Lone Wolf)
    const pickCounts = new Map<string, number>();
    for (const pick of allPicks) {
      const key = `${pick.gameId}-${pick.pickedTeamId}`;
      pickCounts.set(key, (pickCounts.get(key) || 0) + 1);
    }

    // Helper: get seed of a team
    const getSeed = (teamId: number) => teamMap.get(teamId)?.seed ?? 0;

    // Helper: is this an upset pick? (picked lower seed = higher number beating higher seed = lower number)
    const isUpsetPick = (gameId: number, pickedTeamId: number): boolean => {
      const game = gameMap.get(gameId);
      if (!game || !game.team1Id || !game.team2Id) return false;
      const seed1 = getSeed(game.team1Id);
      const seed2 = getSeed(game.team2Id);
      const pickedSeed = getSeed(pickedTeamId);
      const otherSeed = pickedTeamId === game.team1Id ? seed2 : seed1;
      return pickedSeed > otherSeed; // Higher seed number = lower-seeded team = underdog
    };

    // --- Badge computations ---

    // Chaos Agent: Most upsets correctly picked
    let chaosAgent: { userId: number; count: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      let count = 0;
      for (const pick of picks) {
        if (pick.isCorrect === 1 && isUpsetPick(pick.gameId, pick.pickedTeamId)) {
          count++;
        }
      }
      if (count > 0 && (!chaosAgent || count > chaosAgent.count)) {
        chaosAgent = { userId, count };
      }
    }

    // Chalk Walk: Highest % of chalk picks that were correct
    let chalkWalk: { userId: number; pct: number; count: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      let chalkPicks = 0;
      let correctChalk = 0;
      for (const pick of picks) {
        if (!isUpsetPick(pick.gameId, pick.pickedTeamId)) {
          chalkPicks++;
          if (pick.isCorrect === 1) correctChalk++;
        }
      }
      if (chalkPicks > 0) {
        const pct = correctChalk / chalkPicks;
        if (!chalkWalk || pct > chalkWalk.pct || (pct === chalkWalk.pct && correctChalk > chalkWalk.count)) {
          chalkWalk = { userId, pct, count: correctChalk };
        }
      }
    }

    // Clown Car: Most upset picks that were WRONG
    let clownCar: { userId: number; count: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      let count = 0;
      for (const pick of picks) {
        if (pick.isCorrect === 0 && isUpsetPick(pick.gameId, pick.pickedTeamId)) {
          count++;
        }
      }
      if (count > 0 && (!clownCar || count > clownCar.count)) {
        clownCar = { userId, count };
      }
    }

    // Cinderella Finder: Correctly picked a 12+ seed winning in R1 or R2
    let cinderellaFinder: { userId: number; teamName: string; seed: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      for (const pick of picks) {
        if (pick.isCorrect !== 1) continue;
        const game = gameMap.get(pick.gameId);
        if (!game || (game.round !== 1 && game.round !== 2)) continue;
        const pickedSeed = getSeed(pick.pickedTeamId);
        if (pickedSeed >= 12) {
          const team = teamMap.get(pick.pickedTeamId);
          if (!cinderellaFinder || pickedSeed > cinderellaFinder.seed) {
            cinderellaFinder = { userId, teamName: team?.name || "Unknown", seed: pickedSeed };
          }
        }
      }
    }

    // Oracle: Longest correct pick streak by round order
    let oracle: { userId: number; streak: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      // Sort picks by round then gameIndex
      const sorted = [...picks].sort((a, b) => {
        const ga = gameMap.get(a.gameId);
        const gb = gameMap.get(b.gameId);
        if (!ga || !gb) return 0;
        if (ga.round !== gb.round) return ga.round - gb.round;
        return ga.gameIndex - gb.gameIndex;
      });
      let maxStreak = 0;
      let currentStreak = 0;
      for (const pick of sorted) {
        if (pick.isCorrect === 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else if (pick.isCorrect === 0) {
          currentStreak = 0;
        }
        // null = game not decided yet, don't break streak
      }
      if (maxStreak > 0 && (!oracle || maxStreak > oracle.streak)) {
        oracle = { userId, streak: maxStreak };
      }
    }

    // Bold & Wrong: Most Final Four picks that didn't make it
    let boldAndWrong: { userId: number; count: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      let count = 0;
      for (const pick of picks) {
        const game = gameMap.get(pick.gameId);
        if (!game || game.round !== 5) continue; // F4 games
        if (pick.isCorrect === 0) count++;
      }
      if (count > 0 && (!boldAndWrong || count > boldAndWrong.count)) {
        boldAndWrong = { userId, count };
      }
    }

    // Perfect Round: Got every pick right in at least one full round
    let perfectRound: { userId: number; round: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      // Group picks by round
      const byRound = new Map<number, { correct: number; total: number; decided: number }>();
      for (const pick of picks) {
        const game = gameMap.get(pick.gameId);
        if (!game) continue;
        if (!byRound.has(game.round)) {
          byRound.set(game.round, { correct: 0, total: 0, decided: 0 });
        }
        const entry = byRound.get(game.round)!;
        entry.total++;
        if (pick.isCorrect === 1) {
          entry.correct++;
          entry.decided++;
        } else if (pick.isCorrect === 0) {
          entry.decided++;
        }
      }

      // Expected games per round: R1=32, R2=16, R3=8, R4=4, R5=2, R6=1
      const expectedGames: Record<number, number> = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 };

      for (const [round, data] of byRound) {
        const expected = expectedGames[round] || 0;
        // Need all games decided and all correct, with full round of picks
        if (data.correct === expected && data.decided === expected && data.total === expected) {
          if (!perfectRound || round > perfectRound.round) {
            perfectRound = { userId, round };
          }
        }
      }
    }

    // Heartbreaker: Most picks where the favored team (lower seed) lost
    let heartbreaker: { userId: number; count: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      let count = 0;
      for (const pick of picks) {
        if (pick.isCorrect !== 0) continue;
        // They picked a team that lost — was it the favorite?
        if (!isUpsetPick(pick.gameId, pick.pickedTeamId)) {
          count++; // They picked the favorite and the favorite lost
        }
      }
      if (count > 0 && (!heartbreaker || count > heartbreaker.count)) {
        heartbreaker = { userId, count };
      }
    }

    // Lone Wolf: Most unique picks (picks no one else made)
    let loneWolf: { userId: number; count: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      let count = 0;
      for (const pick of picks) {
        const key = `${pick.gameId}-${pick.pickedTeamId}`;
        if ((pickCounts.get(key) || 0) === 1) {
          count++;
        }
      }
      if (count > 0 && (!loneWolf || count > loneWolf.count)) {
        loneWolf = { userId, count };
      }
    }

    // Homer: Picked the same team to win 4+ consecutive rounds
    let homer: { userId: number; teamName: string; rounds: number } | null = null;
    for (const [userId, picks] of picksByUser) {
      // Track each team and which rounds they were picked in
      const teamRounds = new Map<number, number[]>();
      for (const pick of picks) {
        const game = gameMap.get(pick.gameId);
        if (!game) continue;
        if (!teamRounds.has(pick.pickedTeamId)) {
          teamRounds.set(pick.pickedTeamId, []);
        }
        teamRounds.get(pick.pickedTeamId)!.push(game.round);
      }

      for (const [teamId, rounds] of teamRounds) {
        rounds.sort((a, b) => a - b);
        // Count max consecutive rounds
        let maxConsec = 1;
        let consec = 1;
        for (let i = 1; i < rounds.length; i++) {
          if (rounds[i] === rounds[i - 1] + 1) {
            consec++;
            maxConsec = Math.max(maxConsec, consec);
          } else {
            consec = 1;
          }
        }
        if (maxConsec >= 4) {
          const team = teamMap.get(teamId);
          if (!homer || maxConsec > homer.rounds) {
            homer = { userId, teamName: team?.name || "Unknown", rounds: maxConsec };
          }
        }
      }
    }

    // Build badges array
    const roundNames: Record<number, string> = { 1: "R1", 2: "R2", 3: "Sweet 16", 4: "Elite 8", 5: "Final Four", 6: "Championship" };

    const badges: Badge[] = [
      {
        id: "chaos-agent",
        name: "Chaos Agent",
        emoji: "\u{1F52E}",
        description: "Most upsets correctly picked",
        userId: chaosAgent?.userId ?? null,
        userName: chaosAgent ? (userMap.get(chaosAgent.userId) ?? null) : null,
        stat: chaosAgent ? `${chaosAgent.count} upset${chaosAgent.count !== 1 ? "s" : ""} called` : "No upsets called yet",
      },
      {
        id: "chalk-walk",
        name: "Chalk Walk",
        emoji: "\u{1F6E1}\uFE0F",
        description: "Highest correct % on favorites",
        userId: chalkWalk?.userId ?? null,
        userName: chalkWalk ? (userMap.get(chalkWalk.userId) ?? null) : null,
        stat: chalkWalk ? `${Math.round(chalkWalk.pct * 100)}% correct on chalk` : "No chalk picks decided",
      },
      {
        id: "clown-car",
        name: "Clown Car",
        emoji: "\u{1F921}",
        description: "Most wrong upset picks",
        userId: clownCar?.userId ?? null,
        userName: clownCar ? (userMap.get(clownCar.userId) ?? null) : null,
        stat: clownCar ? `${clownCar.count} wrong upset${clownCar.count !== 1 ? "s" : ""}` : "No wrong upsets yet",
      },
      {
        id: "cinderella-finder",
        name: "Cinderella Finder",
        emoji: "\u{1FA70}",
        description: "Correctly picked a 12+ seed winning",
        userId: cinderellaFinder?.userId ?? null,
        userName: cinderellaFinder ? (userMap.get(cinderellaFinder.userId) ?? null) : null,
        stat: cinderellaFinder ? `Called #${cinderellaFinder.seed} ${cinderellaFinder.teamName}` : "No Cinderella called yet",
      },
      {
        id: "oracle",
        name: "Oracle",
        emoji: "\u{1F441}\uFE0F",
        description: "Longest correct pick streak",
        userId: oracle?.userId ?? null,
        userName: oracle ? (userMap.get(oracle.userId) ?? null) : null,
        stat: oracle ? `${oracle.streak} in a row` : "No streak yet",
      },
      {
        id: "bold-and-wrong",
        name: "Bold & Wrong",
        emoji: "\u{1F4A5}",
        description: "Most wrong Final Four picks",
        userId: boldAndWrong?.userId ?? null,
        userName: boldAndWrong ? (userMap.get(boldAndWrong.userId) ?? null) : null,
        stat: boldAndWrong ? `${boldAndWrong.count} F4 miss${boldAndWrong.count !== 1 ? "es" : ""}` : "No F4 misses yet",
      },
      {
        id: "perfect-round",
        name: "Perfect Round",
        emoji: "\u{2B50}",
        description: "Every pick correct in a full round",
        userId: perfectRound?.userId ?? null,
        userName: perfectRound ? (userMap.get(perfectRound.userId) ?? null) : null,
        stat: perfectRound ? `Perfect in ${roundNames[perfectRound.round] || `R${perfectRound.round}`}` : "Unclaimed",
      },
      {
        id: "heartbreaker",
        name: "Heartbreaker",
        emoji: "\u{1F494}",
        description: "Most favorites picked that lost",
        userId: heartbreaker?.userId ?? null,
        userName: heartbreaker ? (userMap.get(heartbreaker.userId) ?? null) : null,
        stat: heartbreaker ? `${heartbreaker.count} heartbreak${heartbreaker.count !== 1 ? "s" : ""}` : "No heartbreaks yet",
      },
      {
        id: "lone-wolf",
        name: "Lone Wolf",
        emoji: "\u{1F43A}",
        description: "Most picks no one else made",
        userId: loneWolf?.userId ?? null,
        userName: loneWolf ? (userMap.get(loneWolf.userId) ?? null) : null,
        stat: loneWolf ? `${loneWolf.count} unique pick${loneWolf.count !== 1 ? "s" : ""}` : "No lone picks yet",
      },
      {
        id: "homer",
        name: "Homer",
        emoji: "\u{1F3E0}",
        description: "Same team picked 4+ consecutive rounds",
        userId: homer?.userId ?? null,
        userName: homer ? (userMap.get(homer.userId) ?? null) : null,
        stat: homer ? `${homer.teamName} for ${homer.rounds} rounds` : "Unclaimed",
      },
    ];

    return NextResponse.json(badges);
  } catch (error) {
    console.error("Badges error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
