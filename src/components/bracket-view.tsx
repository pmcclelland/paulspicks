"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BracketRegion, { type GameData } from "./bracket-region";
import FinalFour from "./final-four";
import { type TeamData } from "./bracket-game";
import { REGIONS } from "@/lib/bracket-utils";
import { schoolName } from "@/lib/school-names";

function Countdown({ targetDate }: { targetDate: Date }) {
  const [now, setNow] = useState(() => new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const diff = targetDate.getTime() - now.getTime();
  if (diff <= 0) return null;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const urgent = diff < 3600000; // less than 1 hour

  return (
    <div className={`mx-4 rounded-lg px-4 py-3 flex flex-col sm:flex-row items-center justify-end gap-2 sm:gap-4 ${
      urgent ? "bg-red-50 border border-red-200" : "bg-[#EFF5FA] border border-[#BFD4E4]/50"
    }`}>
      <span className={`text-xs font-bold uppercase tracking-wider ${urgent ? "text-red-600" : "text-[#5A7A99]"}`}>
        {urgent ? "Hurry! Brackets lock in" : "Time until tipoff"}
      </span>
      <div className="flex items-center gap-1.5">
        {days > 0 && (
          <TimeUnit value={days} label="d" urgent={urgent} />
        )}
        <TimeUnit value={hours} label="h" urgent={urgent} />
        <TimeUnit value={minutes} label="m" urgent={urgent} />
        <TimeUnit value={seconds} label="s" urgent={urgent} />
      </div>
    </div>
  );
}

function TimeUnit({ value, label, urgent }: { value: number; label: string; urgent: boolean }) {
  return (
    <div className={`flex items-baseline gap-0.5 rounded-md px-2 py-1 ${
      urgent ? "bg-red-100" : "bg-white"
    }`}>
      <span className={`text-lg font-bold font-mono tabular-nums leading-none ${
        urgent ? "text-red-700" : "text-[#1B365D]"
      }`}>
        {String(value).padStart(2, "0")}
      </span>
      <span className={`text-[10px] font-bold uppercase ${
        urgent ? "text-red-500" : "text-[#5A7A99]"
      }`}>
        {label}
      </span>
    </div>
  );
}

type BracketViewProps = {
  games: GameData[];
  teams: TeamData[];
  initialPicks: { gameId: number; pickedTeamId: number }[];
  locked: boolean;
  title?: string;
  readOnly?: boolean;
};

export default function BracketView({
  games,
  teams: teamsList,
  initialPicks,
  locked,
  title = "Your Bracket",
  readOnly = false,
}: BracketViewProps) {
  const STORAGE_KEY = "paulspicks-bracket-draft";

  const [userPicks, setUserPicks] = useState<Map<number, number>>(() => {
    // In readOnly mode, skip localStorage
    if (!readOnly && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: [number, number][] = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const map = new Map<number, number>();
            for (const [gameId, teamId] of parsed) {
              map.set(gameId, teamId);
            }
            return map;
          }
        }
      } catch {
        // Ignore corrupt localStorage
      }
    }
    // Fall back to server-saved picks
    const map = new Map<number, number>();
    for (const pick of initialPicks) {
      map.set(pick.gameId, pick.pickedTeamId);
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(() => {
    if (readOnly || typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  });

  // Persist picks to localStorage whenever they change (skip in readOnly mode)
  useEffect(() => {
    if (readOnly || !dirty) return;
    try {
      const entries = Array.from(userPicks.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or unavailable
    }
  }, [userPicks, dirty, readOnly]);

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
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    } catch {
      toast.error("Failed to save bracket. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const [showAutoPick, setShowAutoPick] = useState(false);
  const [autoPickLoading, setAutoPickLoading] = useState(false);

  async function handleAutoPick(championTeamId: number) {
    setAutoPickLoading(true);
    try {
      const res = await fetch("/api/bracket/autopick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ championTeamId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Auto-pick failed.");
        return;
      }
      const newPicks = new Map<number, number>();
      for (const p of data.picks) {
        newPicks.set(p.gameId, p.pickedTeamId);
      }
      setUserPicks(newPicks);
      setDirty(true);
      setShowAutoPick(false);
      toast.success(`Bracket auto-filled with ${data.totalPicks} picks! Review and save when ready.`);
    } catch {
      toast.error("Auto-pick failed. Please try again.");
    } finally {
      setAutoPickLoading(false);
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

  // Find earliest R1 game start time for countdown
  const firstTipoff = useMemo(() => {
    let earliest: Date | null = null;
    for (const game of games) {
      if (game.round === 1 && game.startTime) {
        const d = new Date(game.startTime);
        if (!earliest || d < earliest) earliest = d;
      }
    }
    return earliest;
  }, [games]);

  const showCountdown = !locked && firstTipoff && firstTipoff.getTime() > Date.now();

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-extrabold text-[#1B365D]">{title}</h1>
          <span className="text-sm font-medium text-muted-foreground">
            {totalPicks}/{totalGames} picks made
          </span>
          {locked && !readOnly && (
            <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
              Locked
            </span>
          )}
        </div>
        {!locked && !readOnly && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAutoPick(true)}
              disabled={saving || autoPickLoading}
              variant="outline"
              className="border-[#1B365D] text-[#1B365D] hover:bg-[#1B365D] hover:text-white"
            >
              {autoPickLoading ? "Generating..." : "Auto Pick"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-[#F4793B] hover:bg-[#E06830] text-white"
            >
              {saving ? "Saving..." : "Save Bracket"}
            </Button>
          </div>
        )}
      </div>

      {!readOnly && showCountdown && firstTipoff && <Countdown targetDate={firstTipoff} />}

      {locked && !readOnly && (
        <div className="mx-4 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Brackets are locked. No changes can be made.
        </div>
      )}

      {/* Desktop Layout */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="inline-flex p-4">
          <div className="flex items-stretch gap-2">
            {/* ── Left half: headers + regions ── */}
            <div className="flex flex-col flex-shrink-0">
              {/* Round headers (LTR) */}
              <div className="flex mb-4">
                {[
                  { name: "ROUND 1", dates: "Mar 19 – 20" },
                  { name: "ROUND 2", dates: "Mar 21 – 22" },
                  { name: "SWEET 16", dates: "Mar 26 – 27" },
                  { name: "ELITE 8", dates: "Mar 28 – 29" },
                ].map((h, i) => (
                  <div key={h.name} className="flex items-center">
                    {i > 0 && <div className="w-8 flex-shrink-0" />}
                    <div className="w-56 flex-shrink-0">
                      <div className="bg-[#1B365D] rounded-md px-3 py-2 text-center">
                        <div className="text-xs font-extrabold text-white uppercase tracking-widest leading-none">
                          {h.name}
                        </div>
                        <div className="text-[10px] text-white/50 mt-1 leading-none">
                          {h.dates}
                        </div>
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
              <div className="flex items-center justify-center flex-1 px-2">
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
              <div className="flex flex-row-reverse mb-4">
                {[
                  { name: "ROUND 1", dates: "Mar 19 – 20" },
                  { name: "ROUND 2", dates: "Mar 21 – 22" },
                  { name: "SWEET 16", dates: "Mar 26 – 27" },
                  { name: "ELITE 8", dates: "Mar 28 – 29" },
                ].map((h, i) => (
                  <div key={h.name} className="flex items-center">
                    {i > 0 && <div className="w-8 flex-shrink-0" />}
                    <div className="w-56 flex-shrink-0">
                      <div className="bg-[#1B365D] rounded-md px-3 py-2 text-center">
                        <div className="text-xs font-extrabold text-white uppercase tracking-widest leading-none">
                          {h.name}
                        </div>
                        <div className="text-[10px] text-white/50 mt-1 leading-none">
                          {h.dates}
                        </div>
                      </div>
                    </div>
                    {i === 0 && <div className="w-8 flex-shrink-0" />}
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

      {/* Auto Pick Modal */}
      {showAutoPick && (
        <AutoPickModal
          teams={teamsList}
          loading={autoPickLoading}
          onPick={handleAutoPick}
          onClose={() => setShowAutoPick(false)}
        />
      )}
    </div>
  );
}

function AutoPickModal({
  teams,
  loading,
  onPick,
  onClose,
}: {
  teams: TeamData[];
  loading: boolean;
  onPick: (championTeamId: number) => void;
  onClose: () => void;
}) {
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

  // Group teams by region, sorted by seed
  const teamsByRegion = useMemo(() => {
    const map = new Map<string, TeamData[]>();
    for (const team of teams) {
      // Infer region from the team data — find from games context
      // Teams don't have region directly, so group by seed ranges
    }
    // Simpler: just sort all teams by seed then name
    return [...teams].sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name));
  }, [teams]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#1B365D] px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-white">Auto Pick Bracket</div>
            <div className="text-sm text-white/60 mt-0.5">
              Choose your champion, we'll fill the rest
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#1B365D]">
              Select National Champion
            </label>
            <select
              className="w-full border border-[#BFD4E4] rounded-lg px-3 py-2.5 text-sm bg-white text-[#1B365D] focus:outline-none focus:ring-2 focus:ring-[#F4793B] focus:border-transparent"
              value={selectedTeam ?? ""}
              onChange={(e) => setSelectedTeam(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Choose a team...</option>
              {teamsByRegion.map((team) => (
                <option key={team.id} value={team.id}>
                  ({team.seed}) {schoolName(team.name)}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-[#EFF5FA] rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-bold text-[#1B365D] uppercase tracking-wider">How it works</p>
            <ul className="text-xs text-[#5A7A99] space-y-1">
              <li>Your chosen champion wins every game on their path</li>
              <li>Other matchups decided by KenPom rankings + betting odds</li>
              <li>Historical upset rates applied (12 vs 5, 11 vs 6, etc.)</li>
              <li>A realistic number of upsets sprinkled in each round</li>
              <li>You can review and edit any pick before saving</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedTeam && onPick(selectedTeam)}
              disabled={!selectedTeam || loading}
              className="flex-1 bg-[#F4793B] hover:bg-[#E06830] text-white"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating...
                </span>
              ) : (
                "Generate Bracket"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
