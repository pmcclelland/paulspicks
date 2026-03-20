"use client";

import { useEffect, useState, useCallback } from "react";
import { ROUND_NAMES } from "@/lib/bracket-utils";
import { schoolName } from "@/lib/school-names";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TeamInfo = {
  name: string;
  abbreviation: string;
  seed: number;
  logoUrl: string | null;
};

type StatsData = {
  summary: {
    gamesCompleted: number;
    gamesRemaining: number;
    gamesInProgress: number;
    totalGames: number;
    currentRound: number;
    currentRoundName: string;
  };
  upsets: {
    total: number;
    byRound: { round: number; roundName: string; actual: number; historical: number }[];
    biggest: { round: number; seedDiff: number; winner: TeamInfo; loser: TeamInfo; score: string }[];
  };
  seedPerformance: {
    seed: number;
    wins: number;
    losses: number;
    teamsRemaining: number;
    actualWinRate: number | null;
    historicalWinRate: number | null;
  }[];
  conferencePerformance: {
    conference: string;
    wins: number;
    losses: number;
    teamsRemaining: number;
    historicalAvgWins: number | null;
    teams: (TeamInfo & { eliminated: boolean })[];
  }[];
  gameExtremes: {
    closestGames: { round: number; roundName: string; margin: number; team1: TeamInfo | null; team2: TeamInfo | null; score: string; isOvertime: boolean }[];
    biggestBlowouts: { round: number; roundName: string; margin: number; team1: TeamInfo | null; team2: TeamInfo | null; score: string; isOvertime: boolean }[];
    overtimeCount: number;
    avgMargin: number;
    historicalAvgMargin: Record<number, number>;
  };
  bettingInsights: {
    favoritesCoveringPct: number | null;
    underdogOutrightWins: number;
    avgSpreadError: number | null;
    totalBettableGames: number;
  };
  poolPickInsights: {
    mostPickedChampion: (TeamInfo & { count: number }) | null;
    chalkScore: number | null;
    hardestGameToPick: {
      team1: TeamInfo | null;
      team2: TeamInfo | null;
      team1Picks: number;
      team2Picks: number;
      total: number;
      round: number;
    } | null;
    totalPoolParticipants: number;
  };
  kenpomInsights: {
    topRemainingByAdjEM: (TeamInfo & { adjEM: number; rank: number })[];
    biggestKenpomUpsets: {
      winner: TeamInfo & { rank: number };
      loser: TeamInfo & { rank: number };
      rankDiff: number;
      round: number;
      score: string;
    }[];
  };
};

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) {
        setError("Failed to load stats.");
        return;
      }
      const data = await res.json();
      setStats(data);
      setError("");
    } catch {
      setError("Failed to load stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F4793B] border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading stats...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || "No data available."}</p>
          <button
            onClick={() => { setLoading(true); fetchStats(); }}
            className="text-sm text-[#F4793B] hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const completionPct = stats.summary.totalGames > 0
    ? Math.round((stats.summary.gamesCompleted / stats.summary.totalGames) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B365D]">Tournament Stats</h1>
          <p className="text-sm text-[#5A7A99] mt-1">
            {stats.summary.gamesCompleted} of {stats.summary.totalGames} games completed
            {stats.summary.gamesInProgress > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                {stats.summary.gamesInProgress} in progress
              </span>
            )}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <span className="text-xs font-medium text-[#5A7A99] uppercase tracking-wider">
            {stats.summary.currentRoundName}
          </span>
          <div className="w-24 h-2 bg-[#D6E6F0] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F4793B] rounded-full transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <span className="text-xs font-bold text-[#1B365D]">{completionPct}%</span>
        </div>
      </div>

      {/* At a Glance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlanceCard label="Games Completed" value={`${stats.summary.gamesCompleted}/${stats.summary.totalGames}`} accent />
        <GlanceCard label="Total Upsets" value={stats.upsets.total} />
        <GlanceCard label="Avg Margin" value={stats.gameExtremes.avgMargin > 0 ? `${stats.gameExtremes.avgMargin} pts` : "—"} />
        <GlanceCard label="Overtime Games" value={stats.gameExtremes.overtimeCount} />
      </div>

      {/* Upset Tracker */}
      <Section title="Upset Tracker">
        {stats.upsets.byRound.length > 0 && (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-5 space-y-4">
                {stats.upsets.byRound.map((r) => {
                  const maxBar = Math.max(r.historical * 2, r.actual, 1);
                  return (
                    <div key={r.round} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-[#1B365D]">{r.roundName}</span>
                        <span className="text-[#5A7A99]">
                          <span className="font-bold text-[#1B365D]">{r.actual}</span>
                          {" "}/ {r.historical} avg
                        </span>
                      </div>
                      <div className="relative h-5 bg-[#EFF5FA] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#F4793B] to-[#F4793B]/70 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((r.actual / maxBar) * 100, 100)}%` }}
                        />
                        <div
                          className="absolute top-0 h-full w-0.5 bg-[#1B365D]/30"
                          style={{ left: `${Math.min((r.historical / maxBar) * 100, 100)}%` }}
                          title={`Historical avg: ${r.historical}`}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-4 pt-2 text-[10px] text-[#5A7A99] uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm bg-gradient-to-r from-[#F4793B] to-[#F4793B]/70" />
                    Actual
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-0.5 h-3 bg-[#1B365D]/30" />
                    Historical Avg
                  </span>
                </div>
              </CardContent>
            </Card>

            {stats.upsets.biggest.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-[#5A7A99] mb-3 uppercase tracking-wider">Biggest Upsets</h3>
                <div className="space-y-2">
                  {stats.upsets.biggest.map((u, i) => (
                    <Card key={i}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <TeamLogo team={u.winner} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="text-xs font-bold text-[#F4793B]">({u.winner.seed})</span>
                              <span className="font-bold text-sm text-[#1B365D]">{schoolName(u.winner.name)}</span>
                            </span>
                            <span className="text-xs text-[#5A7A99]">def.</span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-xs font-bold text-[#5A7A99]">({u.loser.seed})</span>
                              <span className="text-sm text-[#5A7A99]">{schoolName(u.loser.name)}</span>
                            </span>
                          </div>
                          <div className="text-xs text-[#5A7A99] mt-0.5">
                            {u.score} &middot; {ROUND_NAMES[u.round]}
                          </div>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-[#F4793B]/10 px-2 py-0.5 text-xs font-bold text-[#F4793B] flex-shrink-0">
                          +{u.seedDiff} seed
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {stats.upsets.total === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-[#5A7A99]">No upsets yet — chalk is holding!</p>
            </CardContent>
          </Card>
        )}
      </Section>

      {/* Seed Performance */}
      <Section title="Seed Performance">
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Seed</TableHead>
                  <TableHead className="text-center">Record</TableHead>
                  <TableHead className="text-center">Win %</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Historical</TableHead>
                  <TableHead className="text-center w-20">Alive</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.seedPerformance.map((s) => {
                  const diff = s.actualWinRate !== null && s.historicalWinRate !== null
                    ? s.actualWinRate - s.historicalWinRate
                    : null;
                  return (
                    <TableRow key={s.seed}>
                      <TableCell className="font-bold text-[#1B365D]">#{s.seed}</TableCell>
                      <TableCell className="text-center">{s.wins}-{s.losses}</TableCell>
                      <TableCell className="text-center">
                        {s.actualWinRate !== null ? (
                          <span className={
                            diff !== null && diff > 5
                              ? "font-bold text-green-600"
                              : diff !== null && diff < -5
                              ? "font-bold text-red-500"
                              : "text-[#1B365D]"
                          }>
                            {s.actualWinRate.toFixed(0)}%
                          </span>
                        ) : <span className="text-[#BFD4E4]">—</span>}
                      </TableCell>
                      <TableCell className="text-center text-[#5A7A99] hidden sm:table-cell">
                        {s.historicalWinRate !== null ? `${s.historicalWinRate.toFixed(0)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {s.teamsRemaining > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-green-50 text-green-700 font-bold text-xs w-6 h-6">
                            {s.teamsRemaining}
                          </span>
                        ) : (
                          <span className="text-[#BFD4E4]">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </Section>

      {/* Conference Scoreboard */}
      <Section title="Conference Scoreboard">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.conferencePerformance.slice(0, 12).map((c) => (
            <ConferenceCard key={c.conference} conf={c} />
          ))}
        </div>
      </Section>

      {/* Game Extremes */}
      <Section title="Game Extremes">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-[#5A7A99] mb-3 uppercase tracking-wider">Closest Games</h3>
            {stats.gameExtremes.closestGames.length > 0 ? (
              <div className="space-y-2">
                {stats.gameExtremes.closestGames.map((g, i) => (
                  <GameExtremeRow key={i} game={g} type="close" />
                ))}
              </div>
            ) : (
              <Card><CardContent className="p-6 text-center text-[#5A7A99] text-sm">No completed games yet.</CardContent></Card>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-[#5A7A99] mb-3 uppercase tracking-wider">Biggest Blowouts</h3>
            {stats.gameExtremes.biggestBlowouts.length > 0 ? (
              <div className="space-y-2">
                {stats.gameExtremes.biggestBlowouts.map((g, i) => (
                  <GameExtremeRow key={i} game={g} type="blowout" />
                ))}
              </div>
            ) : (
              <Card><CardContent className="p-6 text-center text-[#5A7A99] text-sm">No completed games yet.</CardContent></Card>
            )}
          </div>
        </div>
      </Section>

      {/* Betting Insights */}
      {stats.bettingInsights.totalBettableGames > 0 && (
        <Section title="Betting Insights">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <GlanceCard
              label="Favorites Covering"
              value={stats.bettingInsights.favoritesCoveringPct !== null ? `${stats.bettingInsights.favoritesCoveringPct.toFixed(0)}%` : "—"}
            />
            <GlanceCard
              label="Underdog Outright Wins"
              value={stats.bettingInsights.underdogOutrightWins}
            />
            <GlanceCard
              label="Avg Spread Error"
              value={stats.bettingInsights.avgSpreadError !== null ? `${stats.bettingInsights.avgSpreadError.toFixed(1)} pts` : "—"}
            />
          </div>
        </Section>
      )}

      {/* Pool Pick Insights */}
      <Section title="Pool Pick Insights">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.poolPickInsights.mostPickedChampion ? (
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-2">Most Picked Champion</p>
                <div className="flex items-center gap-3">
                  <TeamLogo team={stats.poolPickInsights.mostPickedChampion} size="lg" />
                  <div>
                    <p className="font-bold text-[#1B365D]">{schoolName(stats.poolPickInsights.mostPickedChampion.name)}</p>
                    <p className="text-xs text-[#5A7A99]">
                      {stats.poolPickInsights.mostPickedChampion.count} of {stats.poolPickInsights.totalPoolParticipants} picks
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <GlanceCard label="Most Picked Champion" value="—" />
          )}
          <Card>
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-1">Chalk Score</p>
              <p className="text-2xl font-bold text-[#1B365D]">
                {stats.poolPickInsights.chalkScore !== null ? `${stats.poolPickInsights.chalkScore.toFixed(0)}%` : "—"}
              </p>
              <p className="text-xs text-[#5A7A99] mt-1">% picking higher seed</p>
            </CardContent>
          </Card>
          {stats.poolPickInsights.hardestGameToPick ? (
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-2">Most Divisive Game</p>
                <div className="flex items-center gap-3">
                  {stats.poolPickInsights.hardestGameToPick.team1 && (
                    <div className="flex items-center gap-1.5">
                      <TeamLogo team={stats.poolPickInsights.hardestGameToPick.team1} />
                      <span className="font-bold text-sm text-[#1B365D]">{stats.poolPickInsights.hardestGameToPick.team1.abbreviation}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs font-mono">
                    <span className="font-bold text-[#1B365D]">{stats.poolPickInsights.hardestGameToPick.team1Picks}</span>
                    <span className="text-[#BFD4E4]">-</span>
                    <span className="font-bold text-[#1B365D]">{stats.poolPickInsights.hardestGameToPick.team2Picks}</span>
                  </div>
                  {stats.poolPickInsights.hardestGameToPick.team2 && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[#1B365D]">{stats.poolPickInsights.hardestGameToPick.team2.abbreviation}</span>
                      <TeamLogo team={stats.poolPickInsights.hardestGameToPick.team2} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-[#5A7A99] mt-1.5">
                  {ROUND_NAMES[stats.poolPickInsights.hardestGameToPick.round]}
                </p>
              </CardContent>
            </Card>
          ) : (
            <GlanceCard label="Most Divisive Game" value="—" />
          )}
        </div>
      </Section>

      {/* KenPom Corner */}
      <Section title="KenPom Corner">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-[#5A7A99] mb-3 uppercase tracking-wider">Top Remaining by AdjEM</h3>
            {stats.kenpomInsights.topRemainingByAdjEM.length > 0 ? (
              <div className="space-y-2">
                {stats.kenpomInsights.topRemainingByAdjEM.map((t, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-[#BFD4E4] w-5 text-center">{i + 1}</span>
                      <TeamLogo team={t} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm text-[#1B365D]">{schoolName(t.name)}</span>
                        <span className="text-xs text-[#5A7A99] ml-1.5">#{t.seed} seed</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-[#F4793B]">{t.adjEM.toFixed(1)}</p>
                        <p className="text-[10px] text-[#5A7A99]">KP #{t.rank}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><CardContent className="p-6 text-center text-[#5A7A99] text-sm">No KenPom data available.</CardContent></Card>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-[#5A7A99] mb-3 uppercase tracking-wider">Biggest KenPom Upsets</h3>
            {stats.kenpomInsights.biggestKenpomUpsets.length > 0 ? (
              <div className="space-y-2">
                {stats.kenpomInsights.biggestKenpomUpsets.map((u, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <TeamLogo team={u.winner} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-[#1B365D]">{schoolName(u.winner.name)}</span>
                          <span className="text-[10px] text-[#5A7A99]">KP #{u.winner.rank}</span>
                          <span className="text-xs text-[#BFD4E4]">def.</span>
                          <span className="text-sm text-[#5A7A99]">{schoolName(u.loser.name)}</span>
                          <span className="text-[10px] text-[#5A7A99]">KP #{u.loser.rank}</span>
                        </div>
                        <div className="text-xs text-[#5A7A99] mt-0.5">
                          {u.score} &middot; {ROUND_NAMES[u.round]}
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-[#EFF5FA] px-2 py-0.5 text-[10px] font-bold text-[#1B365D] flex-shrink-0">
                        {u.rankDiff} ranks
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><CardContent className="p-6 text-center text-[#5A7A99] text-sm">No KenPom upsets yet.</CardContent></Card>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

// --- Sub-components ---

function GlanceCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={accent ? "border-[#F4793B]/30" : ""}>
      <CardContent className="p-4">
        <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-2xl font-bold ${accent ? "text-[#F4793B]" : "text-[#1B365D]"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-[#1B365D] mb-4">{title}</h2>
      {children}
    </section>
  );
}

function TeamLogo({ team, size = "sm" }: { team: { logoUrl: string | null; abbreviation: string }; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "w-10 h-10" : "w-6 h-6";
  return team.logoUrl ? (
    <img src={team.logoUrl} alt={team.abbreviation} className={`${dim} object-contain flex-shrink-0`} />
  ) : (
    <div className={`${dim} rounded-full bg-[#EFF5FA] flex items-center justify-center flex-shrink-0`}>
      <span className={`${size === "lg" ? "text-xs" : "text-[10px]"} font-bold text-[#5A7A99]`}>{team.abbreviation.slice(0, 2)}</span>
    </div>
  );
}

function GameExtremeRow({ game, type }: {
  game: { round: number; roundName: string; margin: number; team1: TeamInfo | null; team2: TeamInfo | null; score: string; isOvertime: boolean };
  type: "close" | "blowout";
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        {game.team1 && <TeamLogo team={game.team1} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-[#1B365D]">{game.team1?.abbreviation ?? "TBD"}</span>
            <span className="text-xs text-[#BFD4E4]">vs</span>
            <span className="text-sm font-bold text-[#1B365D]">{game.team2?.abbreviation ?? "TBD"}</span>
            {game.isOvertime && (
              <span className="inline-flex items-center rounded-full bg-[#F4793B]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#F4793B]">
                OT
              </span>
            )}
          </div>
          <span className="text-xs text-[#5A7A99]">{game.roundName}</span>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-mono font-bold text-[#1B365D]">{game.score}</p>
          <p className={`text-xs font-bold ${type === "close" ? "text-[#F4793B]" : "text-[#1B365D]"}`}>
            +{game.margin}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConferenceCard({ conf }: { conf: StatsData["conferencePerformance"][0] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-bold text-[#1B365D]">{conf.conference}</h4>
            <p className="text-sm text-[#5A7A99]">
              <span className="font-bold text-[#1B365D]">{conf.wins}</span>-{conf.losses}
              {conf.historicalAvgWins !== null && (
                <span className="ml-1.5 text-xs">(avg: {conf.historicalAvgWins} W)</span>
              )}
            </p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            conf.teamsRemaining > 0
              ? "bg-green-50 text-green-700"
              : "bg-[#EFF5FA] text-[#5A7A99]"
          }`}>
            {conf.teamsRemaining} alive
          </span>
        </div>
        {conf.teams.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-medium text-[#F4793B] hover:underline"
            >
              {expanded ? "Hide" : "Show"} teams ({conf.teams.length})
            </button>
            {expanded && (
              <div className="mt-3 pt-3 border-t border-[#BFD4E4]/50 space-y-1.5">
                {conf.teams.map((t, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs ${t.eliminated ? "opacity-40" : ""}`}>
                    <TeamLogo team={t} />
                    <span className={`text-[#1B365D] ${t.eliminated ? "line-through" : ""}`}>
                      ({t.seed}) {schoolName(t.name)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
