import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teams, games } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchScoreboard, parseTournamentData, TOURNAMENT_DATES } from "@/lib/espn";
import { REGIONS } from "@/lib/bracket-utils";
import { SAMPLE_TEAMS } from "@/lib/sample-teams";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Try to fetch from ESPN first
    const allEvents: any[] = [];
    for (const round of Object.keys(TOURNAMENT_DATES)) {
      const dates = TOURNAMENT_DATES[parseInt(round)];
      for (const dateStr of dates) {
        try {
          const data = await fetchScoreboard(dateStr);
          if (data.events) {
            allEvents.push(...data.events);
          }
        } catch (e) {
          console.warn(`No ESPN data for ${dateStr}, skipping`);
        }
      }
    }

    const parsed = parseTournamentData(allEvents);
    // parsed.games includes round 0 (First Four) games used for play-in mapping
    let teamsCount = 0;
    let gamesCount = 0;
    const useSampleData = parsed.teams.length < 32; // Need at least 32 teams for a real bracket

    // If ESPN doesn't have full bracket, use sample data for the teams
    if (useSampleData) {
      console.log(
        `ESPN returned ${parsed.teams.length} teams, using sample data for 64 teams`
      );

      // Clear existing data for a clean seed
      await db.delete(games);
      await db.delete(teams);

      // Insert all 64 sample teams
      for (const team of SAMPLE_TEAMS) {
        await db.insert(teams)
          .values({
            espnTeamId: `sample-${team.abbreviation}`,
            name: team.name,
            abbreviation: team.abbreviation,
            seed: team.seed,
            region: team.region,
            logoUrl: null,
          });
        teamsCount++;
      }
    } else {
      // Use ESPN data — upsert teams
      for (const team of parsed.teams) {
        const existing = await db
          .select()
          .from(teams)
          .where(eq(teams.espnTeamId, team.espnTeamId));

        if (existing.length > 0) {
          await db.update(teams)
            .set({
              name: team.name,
              abbreviation: team.abbreviation,
              seed: team.seed,
              region: team.region,
              logoUrl: team.logoUrl,
            })
            .where(eq(teams.espnTeamId, team.espnTeamId));
        } else {
          await db.insert(teams).values(team);
        }
        teamsCount++;
      }
    }

    // Build team lookup maps
    const allTeams = await db.select().from(teams);
    const espnToDbId = new Map<string, number>();
    const teamByRegionSeed = new Map<string, number>();
    for (const t of allTeams) {
      espnToDbId.set(t.espnTeamId, t.id);
      teamByRegionSeed.set(`${t.region}-${t.seed}`, t.id);
    }

    // Build map of parsed ESPN games
    const espnGameMap = new Map<string, (typeof parsed.games)[0]>();
    for (const g of parsed.games) {
      const key = `${g.round}-${g.region}-${g.gameIndex}`;
      espnGameMap.set(key, g);
    }

    // Standard R1 matchup seed pairings: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
    const R1_SEED_MATCHUPS: [number, number][] = [
      [1, 16], [8, 9], [5, 12], [4, 13],
      [6, 11], [3, 14], [7, 10], [2, 15],
    ];

    // Process First Four (play-in) games: build a map of region+seed -> play-in team pairs
    // First Four games have round=0 in our parsed data
    const firstFourGames = parsed.games.filter((g) => g.round === 0);
    // Map: "region-seed" -> [{espnTeamId, name, abbreviation, seed, logoUrl}, ...]
    const playInMap = new Map<string, { id: number; name: string; abbreviation: string; seed: number; logoUrl: string | null }[]>();
    for (const ffg of firstFourGames) {
      const playInTeams: typeof playInMap extends Map<string, infer V> ? V : never = [];
      for (const t of [ffg.team1, ffg.team2]) {
        if (!t) continue;
        const dbId = espnToDbId.get(t.espnTeamId);
        if (dbId) {
          playInTeams.push({ id: dbId, name: t.name, abbreviation: t.abbreviation, seed: t.seed, logoUrl: t.logoUrl });
        }
      }
      if (playInTeams.length === 2) {
        const key = `${ffg.region}-${playInTeams[0].seed}`;
        playInMap.set(key, playInTeams);
      }

      // If the First Four game has a winner, find the corresponding R1 game and set the team
      if (ffg.winnerEspnTeamId) {
        const winnerId = espnToDbId.get(ffg.winnerEspnTeamId);
        if (winnerId) {
          // The winner replaces the TBD slot in R1
          // We'll handle this below when creating R1 games
        }
      }
    }

    // Create all 63 game rows
    const roundConfigs = [
      { round: 1, gamesPerRegion: 8, regions: REGIONS as readonly string[] },
      { round: 2, gamesPerRegion: 4, regions: REGIONS as readonly string[] },
      { round: 3, gamesPerRegion: 2, regions: REGIONS as readonly string[] },
      { round: 4, gamesPerRegion: 1, regions: REGIONS as readonly string[] },
      { round: 5, gamesPerRegion: 2, regions: ["Final Four"] },
      { round: 6, gamesPerRegion: 1, regions: ["Final Four"] },
    ];

    for (const config of roundConfigs) {
      for (const region of config.regions) {
        for (let idx = 0; idx < config.gamesPerRegion; idx++) {
          const existingRows = (await db
            .select()
            .from(games)
            .where(eq(games.round, config.round)))
            .filter((r) => r.region === region && r.gameIndex === idx);

          const espnKey = `${config.round}-${region}-${idx}`;
          const espnGame = espnGameMap.get(espnKey);

          let team1Id: number | null = null;
          let team2Id: number | null = null;

          if (espnGame?.team1) {
            team1Id = espnToDbId.get(espnGame.team1.espnTeamId) ?? null;
          }
          if (espnGame?.team2) {
            team2Id = espnToDbId.get(espnGame.team2.espnTeamId) ?? null;
          }

          // For R1 with sample data, assign teams by seed matchup
          if (config.round === 1 && useSampleData && !team1Id && !team2Id) {
            const [seed1, seed2] = R1_SEED_MATCHUPS[idx];
            team1Id = teamByRegionSeed.get(`${region}-${seed1}`) ?? null;
            team2Id = teamByRegionSeed.get(`${region}-${seed2}`) ?? null;
          }

          // For R1 games, check if either team slot is a First Four TBD
          let playInTeamsJson: string | null = null;
          if (config.round === 1) {
            // Check if team1 or team2 is a TBD/play-in slot (seed 99 or missing)
            const t1 = team1Id ? allTeams.find((t) => t.id === team1Id) : null;
            const t2 = team2Id ? allTeams.find((t) => t.id === team2Id) : null;

            // If one team has seed 99 or is missing, look for play-in teams
            if (t2 && (t2.seed === 99 || t2.abbreviation === "TBD")) {
              // team2 is TBD — find play-in for this region + the expected seed
              // The real seed for this slot is the opponent's matchup seed
              // e.g. 1v16 play-in → look for region-16, 6v11 play-in → look for region-11
              const expectedSeed = R1_SEED_MATCHUPS[idx]?.[1];
              const piTeams = playInMap.get(`${region}-${expectedSeed}`);
              if (piTeams) {
                playInTeamsJson = JSON.stringify(piTeams);
                team2Id = null; // Clear the TBD team reference

                // Check if the First Four game already has a winner
                const ffg = firstFourGames.find(
                  (g) => g.region === region && g.team1?.seed === expectedSeed
                );
                if (ffg?.winnerEspnTeamId) {
                  const winnerId = espnToDbId.get(ffg.winnerEspnTeamId);
                  if (winnerId) {
                    team2Id = winnerId;
                    playInTeamsJson = null; // No longer needed — winner is determined
                  }
                }
              }
            }
            if (t1 && (t1.seed === 99 || t1.abbreviation === "TBD")) {
              const expectedSeed = R1_SEED_MATCHUPS[idx]?.[0];
              const piTeams = playInMap.get(`${region}-${expectedSeed}`);
              if (piTeams) {
                playInTeamsJson = JSON.stringify(piTeams);
                team1Id = null;
                const ffg = firstFourGames.find(
                  (g) => g.region === region && g.team1?.seed === expectedSeed
                );
                if (ffg?.winnerEspnTeamId) {
                  const winnerId = espnToDbId.get(ffg.winnerEspnTeamId);
                  if (winnerId) {
                    team1Id = winnerId;
                    playInTeamsJson = null;
                  }
                }
              }
            }
          }

          const baseData = {
            round: config.round,
            region,
            gameIndex: idx,
            espnEventId: espnGame?.espnEventId ?? null,
            team1Id,
            team2Id,
            status: espnGame?.status ?? "scheduled",
            startTime: espnGame?.startTime ?? null,
            venue: espnGame?.venue ?? null,
            broadcast: espnGame?.broadcast ?? null,
            team1Score: espnGame?.team1Score ?? null,
            team2Score: espnGame?.team2Score ?? null,
            winnerTeamId: espnGame?.winnerEspnTeamId
              ? espnToDbId.get(espnGame.winnerEspnTeamId) ?? null
              : null,
            playInTeams: playInTeamsJson,
          };

          if (existingRows.length > 0) {
            await db.update(games)
              .set(baseData)
              .where(eq(games.id, existingRows[0].id));
          } else {
            await db.insert(games).values(baseData);
          }
          gamesCount++;
        }
      }
    }

    return NextResponse.json({
      message: `Seeded ${teamsCount} teams and ${gamesCount} games${useSampleData ? " (using sample data)" : ""}`,
      teamsCount,
      gamesCount,
      useSampleData,
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
