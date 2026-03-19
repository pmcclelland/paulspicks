"use client";

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BracketRegion, { type GameData } from "./bracket-region";
import FinalFour from "./final-four";
import { type TeamData } from "./bracket-game";
import { REGIONS } from "@/lib/bracket-utils";

type BracketViewProps = {
  games: GameData[];
  teams: TeamData[];
  initialPicks: { gameId: number; pickedTeamId: number }[];
  locked: boolean;
};

export default function BracketView({
  games,
  teams: teamsList,
  initialPicks,
  locked,
}: BracketViewProps) {
  const [userPicks, setUserPicks] = useState<Map<number, number>>(() => {
    const map = new Map<number, number>();
    for (const pick of initialPicks) {
      map.set(pick.gameId, pick.pickedTeamId);
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Build team lookup map
  const teamsMap = useMemo(() => {
    const map = new Map<number, TeamData>();
    for (const team of teamsList) {
      map.set(team.id, team);
    }
    return map;
  }, [teamsList]);

  // Build game lookup by id
  const gamesById = useMemo(() => {
    const map = new Map<number, GameData>();
    for (const game of games) {
      map.set(game.id, game);
    }
    return map;
  }, [games]);

  // Build sorted game lists per region per round for feeder lookup
  const gamesByRegionRound = useMemo(() => {
    const map = new Map<string, GameData[]>();
    for (const game of games) {
      const key = `${game.region}-${game.round}`;
      const list = map.get(key) || [];
      list.push(game);
      map.set(key, list);
    }
    // Sort each list by gameIndex
    for (const list of map.values()) {
      list.sort((a, b) => a.gameIndex - b.gameIndex);
    }
    return map;
  }, [games]);

  // Find the two feeder games for a given game
  const getFeederGames = useCallback(
    (game: GameData): [GameData | null, GameData | null] => {
      if (game.round === 1) return [null, null];

      if (game.round >= 2 && game.round <= 4) {
        // Within region: feeder games are from previous round, same region
        const prevRoundGames = gamesByRegionRound.get(
          `${game.region}-${game.round - 1}`
        ) || [];
        // This game's position in its round
        const myRoundGames = gamesByRegionRound.get(
          `${game.region}-${game.round}`
        ) || [];
        const myLocalIdx = myRoundGames.findIndex((g) => g.id === game.id);
        // Feeder games are at positions myLocalIdx*2 and myLocalIdx*2+1
        const feeder1 = prevRoundGames[myLocalIdx * 2] || null;
        const feeder2 = prevRoundGames[myLocalIdx * 2 + 1] || null;
        return [feeder1, feeder2];
      }

      if (game.round === 5) {
        // Final Four: fed by Elite 8 winners from specific regions
        const ffGames = (gamesByRegionRound.get("Final Four-5") || []);
        const myLocalIdx = ffGames.findIndex((g) => g.id === game.id);
        // Semi 0: REGIONS[0] vs REGIONS[1], Semi 1: REGIONS[2] vs REGIONS[3]
        const region1 = REGIONS[myLocalIdx * 2];
        const region2 = REGIONS[myLocalIdx * 2 + 1];
        const e8_1 = (gamesByRegionRound.get(`${region1}-4`) || [])[0] || null;
        const e8_2 = (gamesByRegionRound.get(`${region2}-4`) || [])[0] || null;
        return [e8_1, e8_2];
      }

      if (game.round === 6) {
        // Championship: fed by two Final Four games
        const ffGames = gamesByRegionRound.get("Final Four-5") || [];
        return [ffGames[0] || null, ffGames[1] || null];
      }

      return [null, null];
    },
    [gamesByRegionRound]
  );

  // Find the next game that a winner advances to
  const findNextGame = useCallback(
    (game: GameData): { nextGame: GameData; slot: "team1Id" | "team2Id" } | null => {
      if (game.round >= 6) return null;

      if (game.round >= 1 && game.round <= 3) {
        const myRoundGames = gamesByRegionRound.get(
          `${game.region}-${game.round}`
        ) || [];
        const nextRoundGames = gamesByRegionRound.get(
          `${game.region}-${game.round + 1}`
        ) || [];
        const localIdx = myRoundGames.findIndex((g) => g.id === game.id);
        const nextLocalIdx = Math.floor(localIdx / 2);
        const nextGame = nextRoundGames[nextLocalIdx];
        if (!nextGame) return null;
        const slot: "team1Id" | "team2Id" = localIdx % 2 === 0 ? "team1Id" : "team2Id";
        return { nextGame, slot };
      }

      if (game.round === 4) {
        const ffGames = (gamesByRegionRound.get("Final Four-5") || []);
        const regionIdx = REGIONS.indexOf(game.region as typeof REGIONS[number]);
        if (regionIdx === -1) return null;
        const ffGameIdx = Math.floor(regionIdx / 2);
        const nextGame = ffGames[ffGameIdx];
        if (!nextGame) return null;
        const slot: "team1Id" | "team2Id" = regionIdx % 2 === 0 ? "team1Id" : "team2Id";
        return { nextGame, slot };
      }

      if (game.round === 5) {
        const champGames = gamesByRegionRound.get("Final Four-6") || [];
        const champGame = champGames[0];
        if (!champGame) return null;
        const ffGames = gamesByRegionRound.get("Final Four-5") || [];
        const localIdx = ffGames.findIndex((g) => g.id === game.id);
        const slot: "team1Id" | "team2Id" = localIdx % 2 === 0 ? "team1Id" : "team2Id";
        return { nextGame: champGame, slot };
      }

      return null;
    },
    [gamesByRegionRound]
  );

  // Collect all downstream game IDs from a game
  const getDownstreamGameIds = useCallback(
    (gameId: number): number[] => {
      const game = gamesById.get(gameId);
      if (!game) return [];
      const result: number[] = [];
      const next = findNextGame(game);
      if (next) {
        result.push(next.nextGame.id);
        result.push(...getDownstreamGameIds(next.nextGame.id));
      }
      return result;
    },
    [gamesById, findNextGame]
  );

  // Compute effective games: propagate user picks into team slots for future rounds
  const effectiveGames = useMemo(() => {
    return games.map((game) => {
      // R1 games already have teams from the DB
      if (game.round === 1) return game;

      // For R2+, compute team slots from feeder game picks
      const [feeder1, feeder2] = getFeederGames(game);

      // team1 comes from feeder1's winner (user pick or actual winner)
      let effectiveTeam1Id = game.team1Id;
      if (feeder1) {
        const actualWinner = feeder1.winnerTeamId;
        const userPick = userPicks.get(feeder1.id);
        effectiveTeam1Id = actualWinner || userPick || null;
      }

      // team2 comes from feeder2's winner
      let effectiveTeam2Id = game.team2Id;
      if (feeder2) {
        const actualWinner = feeder2.winnerTeamId;
        const userPick = userPicks.get(feeder2.id);
        effectiveTeam2Id = actualWinner || userPick || null;
      }

      return {
        ...game,
        team1Id: effectiveTeam1Id,
        team2Id: effectiveTeam2Id,
      };
    });
  }, [games, userPicks, getFeederGames]);

  const handlePick = useCallback(
    (gameId: number, teamId: number) => {
      if (locked) return;

      setUserPicks((prev) => {
        const next = new Map(prev);
        const previousPick = prev.get(gameId);
        next.set(gameId, teamId);

        // If pick changed, clear downstream picks that reference the old team
        if (previousPick !== undefined && previousPick !== teamId) {
          const downstreamIds = getDownstreamGameIds(gameId);
          for (const dsId of downstreamIds) {
            const dsPickedTeam = next.get(dsId);
            if (dsPickedTeam === previousPick) {
              next.delete(dsId);
            }
          }
        }

        return next;
      });
      setDirty(true);
    },
    [locked, getDownstreamGameIds]
  );

  // Save bracket
  async function handleSave() {
    setSaving(true);
    try {
      const picksArray = Array.from(userPicks.entries()).map(
        ([gameId, pickedTeamId]) => ({ gameId, pickedTeamId })
      );

      const res = await fetch("/api/bracket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: picksArray }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save bracket.");
        return;
      }

      toast.success("Bracket saved successfully!");
      setDirty(false);
    } catch {
      toast.error("Failed to save bracket. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Count picks
  const totalPicks = userPicks.size;
  const totalGames = 63;

  // Separate effective games by region
  const regionGames = useMemo(() => {
    const map = new Map<string, GameData[]>();
    for (const region of REGIONS) {
      map.set(
        region,
        effectiveGames.filter((g) => g.region === region && g.round >= 1 && g.round <= 4)
      );
    }
    return map;
  }, [effectiveGames]);

  const finalFourGames = useMemo(
    () => effectiveGames.filter((g) => g.round >= 5),
    [effectiveGames]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-extrabold text-[#1B365D]">Your Bracket</h1>
          <span className="text-sm font-medium text-muted-foreground">
            {totalPicks}/{totalGames} picks made
          </span>
          {locked && (
            <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
              Locked
            </span>
          )}
        </div>
        {!locked && (
          <Button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="bg-[#F4793B] hover:bg-[#E06830] text-white"
          >
            {saving ? "Saving..." : "Save Bracket"}
          </Button>
        )}
      </div>

      {locked && (
        <div className="mx-4 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Brackets are locked. No changes can be made.
        </div>
      )}

      {/* Desktop Layout */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="inline-flex p-4">
          <div className="flex items-start gap-2">
            {/* ── Left half: headers + regions ── */}
            <div className="flex flex-col flex-shrink-0">
              {/* Round headers (LTR) */}
              <div className="flex gap-3 mb-4">
                {[
                  { name: "ROUND 1", dates: "Mar 19 – 20" },
                  { name: "ROUND 2", dates: "Mar 21 – 22" },
                  { name: "SWEET 16", dates: "Mar 26 – 27" },
                  { name: "ELITE 8", dates: "Mar 28 – 29" },
                ].map((h) => (
                  <div key={h.name} className="w-56 flex-shrink-0">
                    <div className="bg-[#1B365D] rounded-md px-3 py-2 text-center">
                      <div className="text-xs font-extrabold text-white uppercase tracking-widest leading-none">
                        {h.name}
                      </div>
                      <div className="text-[10px] text-white/50 mt-1 leading-none">
                        {h.dates}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Left regions */}
              <div className="flex flex-col gap-12">
                <BracketRegion
                  regionName="East"
                  games={regionGames.get("East") || []}
                  teams={teamsMap}
                  userPicks={userPicks}
                  onPick={handlePick}
                  disabled={locked}
                  direction="ltr"
                />
                <BracketRegion
                  regionName="South"
                  games={regionGames.get("South") || []}
                  teams={teamsMap}
                  userPicks={userPicks}
                  onPick={handlePick}
                  disabled={locked}
                  direction="ltr"
                />
              </div>
            </div>

            {/* ── Center: Final Four ── */}
            <div className="flex flex-col flex-shrink-0">
              {/* Header pill aligned with the round headers */}
              <div className="mb-4 px-2">
                <div className="bg-[#F4793B] rounded-md px-5 py-2 text-center">
                  <div className="text-xs font-extrabold text-white uppercase tracking-widest leading-none">
                    FINAL FOUR
                  </div>
                  <div className="text-[10px] text-white/80 mt-1 leading-none">
                    Apr 4 &middot; Apr 6
                  </div>
                </div>
              </div>
              {/* Final Four card — vertically centered */}
              <div className="flex items-center flex-1 px-2">
                <FinalFour
                  games={finalFourGames}
                  teams={teamsMap}
                  userPicks={userPicks}
                  onPick={handlePick}
                  disabled={locked}
                />
              </div>
            </div>

            {/* ── Right half: headers + regions ── */}
            <div className="flex flex-col flex-shrink-0">
              {/* Round headers (RTL — E8 nearest center, R1 on far right) */}
              <div className="flex flex-row-reverse gap-3 mb-4">
                {[
                  { name: "ROUND 1", dates: "Mar 19 – 20" },
                  { name: "ROUND 2", dates: "Mar 21 – 22" },
                  { name: "SWEET 16", dates: "Mar 26 – 27" },
                  { name: "ELITE 8", dates: "Mar 28 – 29" },
                ].map((h) => (
                  <div key={h.name} className="w-56 flex-shrink-0">
                    <div className="bg-[#1B365D] rounded-md px-3 py-2 text-center">
                      <div className="text-xs font-extrabold text-white uppercase tracking-widest leading-none">
                        {h.name}
                      </div>
                      <div className="text-[10px] text-white/50 mt-1 leading-none">
                        {h.dates}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Right regions */}
              <div className="flex flex-col gap-12">
                <BracketRegion
                  regionName="West"
                  games={regionGames.get("West") || []}
                  teams={teamsMap}
                  userPicks={userPicks}
                  onPick={handlePick}
                  disabled={locked}
                  direction="rtl"
                />
                <BracketRegion
                  regionName="Midwest"
                  games={regionGames.get("Midwest") || []}
                  teams={teamsMap}
                  userPicks={userPicks}
                  onPick={handlePick}
                  disabled={locked}
                  direction="rtl"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Layout: Tabs */}
      <div className="lg:hidden px-4">
        <Tabs defaultValue="East" className="w-full">
          <TabsList className="w-full grid grid-cols-5">
            {(["East", "West", "South", "Midwest"] as const).map((region) => (
              <TabsTrigger key={region} value={region} className="text-xs">
                {region}
              </TabsTrigger>
            ))}
            <TabsTrigger value="final-four" className="text-xs">
              Final 4
            </TabsTrigger>
          </TabsList>

          {(["East", "West", "South", "Midwest"] as const).map((region) => (
            <TabsContent key={region} value={region}>
              <div className="overflow-x-auto py-4">
                <BracketRegion
                  regionName={region}
                  games={regionGames.get(region) || []}
                  teams={teamsMap}
                  userPicks={userPicks}
                  onPick={handlePick}
                  disabled={locked}
                  direction="ltr"
                />
              </div>
            </TabsContent>
          ))}

          <TabsContent value="final-four">
            <div className="py-4">
              <FinalFour
                games={finalFourGames}
                teams={teamsMap}
                userPicks={userPicks}
                onPick={handlePick}
                disabled={locked}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
