import { db } from "@/lib/db";
import { games, picks, teams, appState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchScoreboard, parseTournamentData, TOURNAMENT_DATES } from "@/lib/espn";
import { getNextGame, getSlotInNextGame, REGIONS, FINAL_FOUR_MATCHUPS } from "@/lib/bracket-utils";
import { POINTS_PER_ROUND } from "@/lib/scoring";

const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Check if scores are stale and refresh from ESPN if needed.
 * Returns true if a refresh was performed.
 */
export async function refreshScoresIfStale(): Promise<boolean> {
  const refreshState = await db
    .select()
    .from(appState)
    .where(eq(appState.key, "last_refresh"));

  const lastRefresh = refreshState.length > 0 ? refreshState[0].value : null;
  if (lastRefresh) {
    const elapsed = Date.now() - new Date(lastRefresh).getTime();
    if (elapsed < REFRESH_INTERVAL_MS) {
      return false; // Not stale
    }
  }

  // Check if there are any games that could have live scores
  const allGameRows = await db
    .select()
    .from(games);
  const activeGames = allGameRows.filter((g) => g.status === "in_progress" || g.status === "scheduled");

  if (activeGames.length === 0) {
    return false; // No games to update
  }

  await doRefreshScores();
  return true;
}

/**
 * Actually refresh scores from ESPN. Called by auto-refresh and admin endpoint.
 */
export async function doRefreshScores(): Promise<{ updatedGames: number; scoredPicks: number }> {
  const allEvents: any[] = [];
  for (const round of Object.keys(TOURNAMENT_DATES)) {
    const r = parseInt(round);
    if (r === 0) continue; // Skip First Four dates for score refresh
    const dates = TOURNAMENT_DATES[r];
    for (const dateStr of dates) {
      try {
        const data = await fetchScoreboard(dateStr);
        if (data.events) {
          allEvents.push(...data.events);
        }
      } catch (e) {
        // Skip dates with no data
      }
    }
  }

  const parsed = parseTournamentData(allEvents);
  let updatedGames = 0;
  let scoredPicks = 0;

  const allTeams = await db.select().from(teams);
  const espnToDbId = new Map<string, number>();
  for (const t of allTeams) {
    espnToDbId.set(t.espnTeamId, t.id);
  }

  const allGames = await db.select().from(games);
  const gameByRoundRegionIndex = new Map<string, (typeof allGames)[0]>();
  const gameByEspnEventId = new Map<string, (typeof allGames)[0]>();
  for (const g of allGames) {
    gameByRoundRegionIndex.set(`${g.round}-${g.region}-${g.gameIndex}`, g);
    if (g.espnEventId) gameByEspnEventId.set(g.espnEventId, g);
  }

  // Build team-to-R1-game lookup for R2+ bracket position matching
  const teamToR1Game = new Map<number, (typeof allGames)[0]>();
  for (const g of allGames) {
    if (g.round === 1) {
      if (g.team1Id) teamToR1Game.set(g.team1Id, g);
      if (g.team2Id) teamToR1Game.set(g.team2Id, g);
      // Also map winners from completed games
      if (g.winnerTeamId) teamToR1Game.set(g.winnerTeamId, g);
    }
  }

  /**
   * Given a team's R1 gameIndex, walk the bracket structure forward to find
   * which game slot they should be in at a given round.
   * R1 idx → R2 floor(idx/2) → R3 floor(idx/4) → R4 floor(idx/8) = 0
   */
  function r1IndexToGameIndex(r1GameIndex: number, targetRound: number): number {
    let idx = r1GameIndex;
    for (let r = 1; r < targetRound; r++) {
      idx = Math.floor(idx / 2);
    }
    return idx;
  }

  for (const event of parsed.games) {
    if (event.round === 0) continue; // Skip First Four

    let dbGame: (typeof allGames)[0] | undefined;

    if (event.round === 1) {
      // R1: match by round-region-gameIndex (standard bracket order)
      const key = `${event.round}-${event.region}-${event.gameIndex}`;
      dbGame = gameByRoundRegionIndex.get(key);
    } else {
      // R2+: first try matching by espnEventId (already assigned from prior refresh)
      if (event.espnEventId) {
        dbGame = gameByEspnEventId.get(event.espnEventId);
      }

      // If no espnEventId match, find correct DB game by tracing team's bracket path
      // Try both team1 and team2 since either could map back to an R1 game
      if (!dbGame && event.round <= 4) {
        for (const eventTeam of [event.team1, event.team2]) {
          if (!eventTeam || dbGame) continue;
          const teamDbId = espnToDbId.get(eventTeam.espnTeamId);
          if (teamDbId) {
            const r1Game = teamToR1Game.get(teamDbId);
            if (r1Game) {
              const targetIdx = r1IndexToGameIndex(r1Game.gameIndex, event.round);
              const key = `${event.round}-${event.region}-${targetIdx}`;
              dbGame = gameByRoundRegionIndex.get(key);
            }
          }
        }
      }

      // R5 (Final Four) and R6 (Championship): match by team region
      if (!dbGame && event.round >= 5) {
        if (event.round === 6) {
          // Only one championship game
          dbGame = gameByRoundRegionIndex.get("6-Final Four-0");
        } else {
          // Round 5: determine which semifinal by team region
          for (const eventTeam of [event.team1, event.team2]) {
            if (!eventTeam || dbGame) continue;
            const teamDbId = espnToDbId.get(eventTeam.espnTeamId);
            if (!teamDbId) continue;
            const teamRecord = allTeams.find((t) => t.id === teamDbId);
            if (!teamRecord) continue;
            if (teamRecord.name === "TBD" || teamRecord.abbreviation === "TBD") continue;
            const semiIndex = FINAL_FOUR_MATCHUPS.findIndex(
              (matchup) => (matchup as readonly string[]).includes(teamRecord.region)
            );
            if (semiIndex !== -1) {
              dbGame = gameByRoundRegionIndex.get(`5-Final Four-${semiIndex}`);
            }
          }
        }
      }
    }

    if (!dbGame) continue;

    const wasCompleted = dbGame.status === "final";

    // Resolve ESPN team IDs to DB IDs, but skip TBD placeholder teams
    // so we don't overwrite properly advanced winners with placeholders
    const resolveTeamId = (espnTeam: { espnTeamId: string; name?: string } | null, fallback: number | null) => {
      if (!espnTeam) return fallback;
      const dbId = espnToDbId.get(espnTeam.espnTeamId);
      if (dbId == null) return fallback;
      // Check if this is a TBD placeholder team
      const team = allTeams.find((t) => t.id === dbId);
      if (team && (team.name === "TBD" || team.abbreviation === "TBD")) return fallback;
      return dbId;
    };

    const team1DbId = resolveTeamId(event.team1, dbGame.team1Id);
    const team2DbId = resolveTeamId(event.team2, dbGame.team2Id);
    const winnerDbId = event.winnerEspnTeamId
      ? espnToDbId.get(event.winnerEspnTeamId) ?? null
      : null;

    // ESPN sorts competitors by seed (lower seed = team1), but our DB assigns
    // team1/team2 by bracket position. When ESPN's order doesn't match the DB,
    // we need to swap scores to keep them aligned with the correct team.
    const espnTeam1DbId = event.team1 ? espnToDbId.get(event.team1.espnTeamId) ?? null : null;
    const scoresSwapped = espnTeam1DbId != null && team2DbId != null && espnTeam1DbId === team2DbId;

    await db.update(games)
      .set({
        team1Id: team1DbId,
        team2Id: team2DbId,
        team1Score: scoresSwapped ? event.team2Score : event.team1Score,
        team2Score: scoresSwapped ? event.team1Score : event.team2Score,
        status: event.status,
        winnerTeamId: winnerDbId,
        espnEventId: dbGame.espnEventId
          || (event.espnEventId && !allGames.some(g => g.espnEventId === event.espnEventId) ? event.espnEventId : null),
        startTime: event.startTime || dbGame.startTime,
        venue: event.venue || dbGame.venue,
        broadcast: event.broadcast || dbGame.broadcast,
        statusDetail: event.statusDetail,
        spreadLine: event.spreadLine ?? dbGame.spreadLine,
        spreadDetails: event.spreadDetails ?? dbGame.spreadDetails,
        moneylineTeam1: scoresSwapped
          ? (event.moneylineTeam2 ?? dbGame.moneylineTeam1)
          : (event.moneylineTeam1 ?? dbGame.moneylineTeam1),
        moneylineTeam2: scoresSwapped
          ? (event.moneylineTeam1 ?? dbGame.moneylineTeam2)
          : (event.moneylineTeam2 ?? dbGame.moneylineTeam2),
        overUnder: event.overUnder ?? dbGame.overUnder,
        oddsProvider: event.oddsProvider ?? dbGame.oddsProvider,
      })
      .where(eq(games.id, dbGame.id));
    updatedGames++;

    const isNowComplete = event.status === "final" && !wasCompleted;
    if (isNowComplete && winnerDbId) {
      const gamePicks = await db
        .select()
        .from(picks)
        .where(eq(picks.gameId, dbGame.id));

      const pointsForRound = POINTS_PER_ROUND[dbGame.round] || 0;

      for (const pick of gamePicks) {
        const isCorrect = pick.pickedTeamId === winnerDbId;
        await db.update(picks)
          .set({
            isCorrect: isCorrect ? 1 : 0,
            pointsEarned: isCorrect ? pointsForRound : 0,
          })
          .where(eq(picks.id, pick.id));
        scoredPicks++;
      }

      // Winner advancement to next round is handled by ESPN's team assignments
      // during the next refresh cycle. ESPN's R2+ gameIndex mapping doesn't follow
      // our floor(idx/2) convention, so manual advancement would place teams in
      // the wrong games.
    }
  }

  // Update last_refresh timestamp
  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(appState)
    .where(eq(appState.key, "last_refresh"));

  if (existing.length > 0) {
    await db.update(appState)
      .set({ value: now })
      .where(eq(appState.key, "last_refresh"));
  } else {
    await db.insert(appState)
      .values({ key: "last_refresh", value: now });
  }

  return { updatedGames, scoredPicks };
}
