import { db } from "@/lib/db";
import { games, picks, teams, appState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchScoreboard, parseTournamentData, TOURNAMENT_DATES } from "@/lib/espn";
import { getNextGame, getSlotInNextGame, REGIONS } from "@/lib/bracket-utils";
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
  for (const g of allGames) {
    gameByRoundRegionIndex.set(`${g.round}-${g.region}-${g.gameIndex}`, g);
  }

  for (const event of parsed.games) {
    if (event.round === 0) continue; // Skip First Four
    const key = `${event.round}-${event.region}-${event.gameIndex}`;
    const dbGame = gameByRoundRegionIndex.get(key);
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

    await db.update(games)
      .set({
        team1Id: team1DbId,
        team2Id: team2DbId,
        team1Score: event.team1Score,
        team2Score: event.team2Score,
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
        moneylineTeam1: event.moneylineTeam1 ?? dbGame.moneylineTeam1,
        moneylineTeam2: event.moneylineTeam2 ?? dbGame.moneylineTeam2,
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

      // Advance winner to next round
      if (dbGame.round < 6) {
        const nextGameInfo = getNextGame(dbGame.round, dbGame.gameIndex);
        if (nextGameInfo) {
          const slot = getSlotInNextGame(dbGame.gameIndex);
          let nextRegion = dbGame.region;
          if (nextGameInfo.round >= 5) {
            nextRegion = "Final Four";
          }
          const nextKey = `${nextGameInfo.round}-${nextRegion}-${nextGameInfo.gameIndex}`;
          const nextGame = gameByRoundRegionIndex.get(nextKey);

          if (nextGame) {
            const updateField =
              slot === "team1"
                ? { team1Id: winnerDbId }
                : { team2Id: winnerDbId };
            await db.update(games)
              .set(updateField)
              .where(eq(games.id, nextGame.id));
          }
        }
      }
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
