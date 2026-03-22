"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { GameBoxScore, GameBoxScoreTeam, GameLeader } from "@/types";

type GameStatsPanelProps = {
  espnEventId: string;
  status: string;
};

type Tab = "leaders" | "team" | "players";

export default function GameStatsPanel({ espnEventId, status }: GameStatsPanelProps) {
  const [data, setData] = useState<GameBoxScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("leaders");
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/game-stats/${espnEventId}`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [espnEventId]);

  useEffect(() => {
    fetchStats();
    if (status === "in_progress") {
      intervalRef.current = setInterval(fetchStats, 30000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats, status]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#F4793B] border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Box score unavailable
      </p>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "leaders", label: "Leaders" },
    { key: "team", label: "Team Stats" },
    { key: "players", label: "Players" },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex border-b border-[#BFD4E4]/50 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 pb-2.5 text-xs font-semibold transition-colors ${
              tab === t.key
                ? "text-[#1B365D] border-b-2 border-[#F4793B]"
                : "text-[#5A7A99] hover:text-[#1B365D]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "leaders" ? (
        <GameLeadersView team1={data.team1} team2={data.team2} />
      ) : tab === "team" ? (
        <TeamStatsView team1={data.team1} team2={data.team2} />
      ) : (
        <PlayersView
          team1={data.team1}
          team2={data.team2}
          showAll={showAllPlayers}
          onToggleShowAll={() => setShowAllPlayers(!showAllPlayers)}
        />
      )}
    </div>
  );
}

type TeamRef = GameBoxScoreTeam;

/* ─── Game Leaders ─── */

const LEADER_CATEGORIES: { key: "points" | "rebounds" | "assists"; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "rebounds", label: "Rebounds" },
  { key: "assists", label: "Assists" },
];

function GameLeadersView({ team1, team2 }: { team1: TeamRef; team2: TeamRef }) {
  return (
    <div className="space-y-4">
      {LEADER_CATEGORIES.map(({ key, label }) => {
        const l1 = team1.leaders[key];
        const l2 = team2.leaders[key];
        if (!l1 && !l2) return null;
        return (
          <div key={key}>
            <div className="text-xs font-bold text-[#5A7A99] uppercase tracking-wider mb-2">
              {label}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <LeaderCard leader={l1} team={team1} />
              <LeaderCard leader={l2} team={team2} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderCard({ leader, team }: { leader: GameLeader | null; team: TeamRef }) {
  if (!leader) {
    return <div className="rounded-lg bg-[#EFF5FA] p-3 text-center text-xs text-[#5A7A99]">—</div>;
  }

  return (
    <div className="rounded-lg bg-[#EFF5FA] p-3 flex items-center gap-2.5">
      {leader.headshot ? (
        <img
          src={leader.headshot}
          alt=""
          className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-white"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#BFD4E4] flex items-center justify-center flex-shrink-0">
          {team.logoUrl ? (
            <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain" />
          ) : (
            <span className="text-[10px] font-bold text-[#5A7A99]">{team.abbreviation.slice(0, 2)}</span>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#1B365D] truncate">{leader.name}</div>
        <div className="text-xs text-[#5A7A99]">{team.abbreviation}</div>
      </div>
      <div className="text-xl font-bold font-mono text-[#1B365D] tabular-nums flex-shrink-0">
        {leader.value}
      </div>
    </div>
  );
}

/* ─── Team Stats Comparison ─── */

type StatRowDef = {
  label: string;
  key: string;
  format?: "pct";
  madeAttempted?: string;
};

const STAT_ROWS: StatRowDef[] = [
  { label: "Field Goals", key: "fgPct", format: "pct", madeAttempted: "fgMadeAttempted" },
  { label: "3-Pointers", key: "threePtPct", format: "pct", madeAttempted: "threePtMadeAttempted" },
  { label: "Free Throws", key: "ftPct", format: "pct", madeAttempted: "ftMadeAttempted" },
  { label: "Rebounds", key: "totalRebounds" },
  { label: "Off Rebounds", key: "offRebounds" },
  { label: "Def Rebounds", key: "defRebounds" },
  { label: "Assists", key: "assists" },
  { label: "Turnovers", key: "turnovers" },
  { label: "Steals", key: "steals" },
  { label: "Blocks", key: "blocks" },
  { label: "Fouls", key: "fouls" },
];

function TeamStatsView({ team1, team2 }: { team1: TeamRef; team2: TeamRef }) {
  return (
    <div>
      {/* Team header with logos */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {team1.logoUrl && <img src={team1.logoUrl} alt="" className="w-6 h-6 object-contain" />}
          <span className="text-sm font-bold text-[#1B365D]">{team1.abbreviation}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#1B365D]">{team2.abbreviation}</span>
          {team2.logoUrl && <img src={team2.logoUrl} alt="" className="w-6 h-6 object-contain" />}
        </div>
      </div>

      <div className="space-y-2.5">
        {STAT_ROWS.map(({ label, key, format, madeAttempted }) => {
          const v1 = (team1.stats as any)[key];
          const v2 = (team2.stats as any)[key];
          const n1 = parseFloat(v1);
          const n2 = parseFloat(v2);

          const lowerIsBetter = key === "turnovers" || key === "fouls";
          const t1Better = n1 !== n2 && (lowerIsBetter ? n1 < n2 : n1 > n2);
          const t2Better = n1 !== n2 && (lowerIsBetter ? n2 < n1 : n2 > n1);

          // For percentage bars, compute ratio for visual bar
          const total = n1 + n2;
          const pct1 = total > 0 ? (n1 / total) * 100 : 50;

          const ma1 = madeAttempted ? (team1.stats as any)[madeAttempted] : null;
          const ma2 = madeAttempted ? (team2.stats as any)[madeAttempted] : null;

          const formatVal = (v: any) =>
            format === "pct" ? `${parseFloat(v).toFixed(1)}%` : String(Math.round(v));

          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs text-[#5A7A99] mb-0.5">
                <span
                  className={`font-mono tabular-nums ${t1Better ? "text-[#F4793B] font-bold" : "text-[#1B365D] font-semibold"}`}
                >
                  {formatVal(v1)}
                  {ma1 && <span className="text-[#5A7A99] font-normal ml-1">({ma1})</span>}
                </span>
                <span className="font-medium">{label}</span>
                <span
                  className={`font-mono tabular-nums ${t2Better ? "text-[#F4793B] font-bold" : "text-[#1B365D] font-semibold"}`}
                >
                  {ma2 && <span className="text-[#5A7A99] font-normal mr-1">({ma2})</span>}
                  {formatVal(v2)}
                </span>
              </div>
              {/* Comparison bar */}
              <div className="flex h-2 rounded-full overflow-hidden bg-[#EFF5FA]">
                <div
                  className={`transition-all duration-300 rounded-l-full ${t1Better ? "bg-[#F4793B]" : "bg-[#1B365D]/30"}`}
                  style={{ width: `${pct1}%` }}
                />
                <div
                  className={`transition-all duration-300 rounded-r-full ${t2Better ? "bg-[#F4793B]" : "bg-[#1B365D]/30"}`}
                  style={{ width: `${100 - pct1}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Player Stats ─── */

function PlayersView({
  team1,
  team2,
  showAll,
  onToggleShowAll,
}: {
  team1: TeamRef;
  team2: TeamRef;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const limit = showAll ? Infinity : 5;

  return (
    <div className="space-y-5">
      <PlayerTable team={team1} limit={limit} />
      <PlayerTable team={team2} limit={limit} />
      {(team1.players.length > 5 || team2.players.length > 5) && (
        <button
          onClick={onToggleShowAll}
          className="text-xs text-[#F4793B] hover:underline w-full text-center font-semibold"
        >
          {showAll ? "Show top players" : "Show all players"}
        </button>
      )}
    </div>
  );
}

function PlayerTable({ team, limit }: { team: TeamRef; limit: number }) {
  const players = team.players.slice(0, limit);
  if (players.length === 0) return null;

  return (
    <div>
      {/* Team header */}
      <div className="flex items-center gap-2 mb-2">
        {team.logoUrl && <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain" />}
        <span className="text-sm font-bold text-[#1B365D]">{team.abbreviation}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#BFD4E4]/50">
              <th className="text-left font-semibold text-[#5A7A99] pr-2 py-1.5">Player</th>
              <th className="text-right font-semibold text-[#5A7A99] px-1.5 py-1.5 w-8">MIN</th>
              <th className="text-right font-semibold text-[#5A7A99] px-1.5 py-1.5 w-8">PTS</th>
              <th className="text-right font-semibold text-[#5A7A99] px-1.5 py-1.5 w-12">FG</th>
              <th className="text-right font-semibold text-[#5A7A99] px-1.5 py-1.5 w-8">REB</th>
              <th className="text-right font-semibold text-[#5A7A99] px-1.5 py-1.5 w-8">AST</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr
                key={i}
                className={`border-b border-[#EFF5FA] ${i === 0 ? "bg-[#EFF5FA]/50" : ""}`}
              >
                <td className="text-left pr-2 py-2 max-w-[110px]">
                  <div className="truncate text-[#1B365D] font-medium">{p.name}</div>
                  <div className="text-[10px] text-[#5A7A99]">{p.position}</div>
                </td>
                <td className="text-right font-mono text-[#5A7A99] px-1.5 py-2 tabular-nums">
                  {p.minutes}
                </td>
                <td className="text-right font-mono text-[#1B365D] font-bold px-1.5 py-2 tabular-nums">
                  {p.points}
                </td>
                <td className="text-right font-mono text-[#5A7A99] px-1.5 py-2 tabular-nums">
                  {p.fgMade}-{p.fgAttempted}
                </td>
                <td className="text-right font-mono text-[#1B365D] px-1.5 py-2 tabular-nums">
                  {p.rebounds}
                </td>
                <td className="text-right font-mono text-[#1B365D] px-1.5 py-2 tabular-nums">
                  {p.assists}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
