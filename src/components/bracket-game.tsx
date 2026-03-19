"use client";

import { useState, useEffect } from "react";
import type { PlayInTeam } from "./bracket-region";
import { fairProbabilities, formatOdds, detectUpset, type UpsetLevel } from "@/lib/odds";

export type TeamData = {
  id: number;
  name: string;
  abbreviation: string;
  seed: number;
  logoUrl?: string | null;
};

export type GameResult = {
  winnerTeamId: number | null;
  team1Score: number | null;
  team2Score: number | null;
  status: string;
};

export type GameInfo = {
  startTime?: string | null;
  venue?: string | null;
  broadcast?: string | null;
  round: number;
  region: string;
  gameId?: number;
  spreadLine?: string | null;
  spreadDetails?: string | null;
  moneylineTeam1?: string | null;
  moneylineTeam2?: string | null;
  overUnder?: string | null;
  oddsProvider?: string | null;
};

type BracketGameProps = {
  gameId: number;
  team1: TeamData | null;
  team2: TeamData | null;
  pickedTeamId: number | undefined;
  onPick: (gameId: number, teamId: number) => void;
  disabled: boolean;
  result?: GameResult;
  direction?: "ltr" | "rtl";
  playInTeams?: PlayInTeam[] | null;
  gameInfo?: GameInfo;
};

import { schoolName } from "@/lib/school-names";

const ROUND_LABELS: Record<number, string> = {
  1: "Round of 64",
  2: "Round of 32",
  3: "Sweet 16",
  4: "Elite 8",
  5: "Final Four",
  6: "Championship",
};

function PickIcon({
  team,
  pickedTeamId,
  result,
}: {
  team: TeamData | null;
  pickedTeamId: number | undefined;
  result?: GameResult;
}) {
  if (!team) return <div className="w-5 h-5 flex-shrink-0" />;

  const isPicked = pickedTeamId === team.id;
  const isFinal = result?.status === "final";
  const isCorrect = isFinal && result?.winnerTeamId === team.id && isPicked;
  const isWrong = isFinal && result?.winnerTeamId !== null && result?.winnerTeamId !== team.id && isPicked;

  if (isCorrect) {
    return (
      <svg className="w-5 h-5 flex-shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    );
  }

  if (isWrong) {
    return (
      <svg className="w-5 h-5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
      </svg>
    );
  }

  return (
    <svg className={`w-5 h-5 flex-shrink-0 ${isPicked ? "text-[#F4793B]" : "text-[#BFD4E4]"}`} viewBox="0 0 20 20" fill="currentColor">
      {isPicked ? (
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      ) : (
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-1.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13z" clipRule="evenodd" />
      )}
    </svg>
  );
}

function WinProbabilityBar({
  team1,
  team2,
  gameInfo,
}: {
  team1: TeamData | null;
  team2: TeamData | null;
  gameInfo: GameInfo;
}) {
  if (!gameInfo.moneylineTeam1 || !gameInfo.moneylineTeam2) return null;

  const probs = fairProbabilities(gameInfo.moneylineTeam1, gameInfo.moneylineTeam2);
  const pct1 = Math.round(probs.team1 * 100);
  const pct2 = 100 - pct1;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-bold">
        <span className="text-[#1B365D]">{team1 ? schoolName(team1.name) : "Team 1"} {pct1}%</span>
        <span className="text-[#F4793B]">{team2 ? schoolName(team2.name) : "Team 2"} {pct2}%</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        <div className="bg-[#1B365D] transition-all" style={{ width: `${pct1}%` }} />
        <div className="bg-[#F4793B] transition-all" style={{ width: `${pct2}%` }} />
      </div>
    </div>
  );
}

function OddsTable({ gameInfo }: { gameInfo: GameInfo }) {
  const hasOdds = gameInfo.spreadDetails || gameInfo.moneylineTeam1 || gameInfo.overUnder;
  if (!hasOdds) {
    return <p className="text-sm text-[#5A7A99] italic">Odds not yet available</p>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-sm">
        {gameInfo.spreadDetails && (
          <>
            <span className="text-[#5A7A99] font-medium">Spread</span>
            <span className="text-[#1B365D] font-semibold text-right">{gameInfo.spreadDetails}</span>
          </>
        )}
        {gameInfo.moneylineTeam1 && gameInfo.moneylineTeam2 && (
          <>
            <span className="text-[#5A7A99] font-medium">Moneyline</span>
            <span className="text-[#1B365D] font-semibold text-right">
              {formatOdds(gameInfo.moneylineTeam1)} / {formatOdds(gameInfo.moneylineTeam2)}
            </span>
          </>
        )}
        {gameInfo.overUnder && (
          <>
            <span className="text-[#5A7A99] font-medium">Over/Under</span>
            <span className="text-[#1B365D] font-semibold text-right">{gameInfo.overUnder}</span>
          </>
        )}
      </div>
      {gameInfo.oddsProvider && (
        <p className="text-[10px] text-[#5A7A99]/60 mt-1">Odds via {gameInfo.oddsProvider}</p>
      )}
    </div>
  );
}

type KenpomTeamData = {
  teamName: string;
  rank: number;
  adjEM: string;
  adjO: string;
  adjORank: number;
  adjD: string;
  adjDRank: number;
  adjT: string;
  adjTRank: number;
  record: string;
  conference: string;
};

function KenpomSection({
  team1,
  team2,
}: {
  team1: TeamData | null;
  team2: TeamData | null;
}) {
  const [data, setData] = useState<{ team1: KenpomTeamData | null; team2: KenpomTeamData | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (fetched || (!team1 && !team2)) return;
    setFetched(true);
    setLoading(true);
    const params = new URLSearchParams();
    if (team1) params.set("team1", team1.name);
    if (team2) params.set("team2", team2.name);
    fetch(`/api/kenpom?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [team1, team2, fetched]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-[#EFF5FA] rounded w-2/3" />
        <div className="h-20 bg-[#EFF5FA] rounded" />
        <div className="h-20 bg-[#EFF5FA] rounded" />
      </div>
    );
  }

  if (!data || (!data.team1 && !data.team2)) {
    return <p className="text-sm text-[#5A7A99] italic">KenPom data not available</p>;
  }

  const k1 = data.team1;
  const k2 = data.team2;

  function RankBadge({ rank, total = 365 }: { rank: number; total?: number }) {
    const pct = rank / total;
    const color =
      pct <= 0.1 ? "bg-green-100 text-green-700" :
      pct <= 0.25 ? "bg-blue-100 text-blue-700" :
      pct <= 0.5 ? "bg-yellow-100 text-yellow-800" :
      "bg-red-100 text-red-700";
    return (
      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${color}`}>
        #{rank}
      </span>
    );
  }

  // Stat comparison row
  function StatRow({
    label,
    val1,
    rank1,
    val2,
    rank2,
    lowerIsBetter = false,
  }: {
    label: string;
    val1?: string;
    rank1?: number;
    val2?: string;
    rank2?: number;
    lowerIsBetter?: boolean;
  }) {
    const r1 = rank1 ?? 999;
    const r2 = rank2 ?? 999;
    const better1 = lowerIsBetter ? r1 < r2 : r1 < r2;
    const better2 = lowerIsBetter ? r2 < r1 : r2 < r1;
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm">
        <div className={`text-right tabular-nums ${better1 ? "font-bold text-[#1B365D]" : "text-[#5A7A99]"}`}>
          {val1 ?? "—"} {rank1 != null && <RankBadge rank={rank1} />}
        </div>
        <div className="text-[10px] font-bold text-[#5A7A99] uppercase text-center w-12">{label}</div>
        <div className={`text-left tabular-nums ${better2 ? "font-bold text-[#1B365D]" : "text-[#5A7A99]"}`}>
          {rank2 != null && <RankBadge rank={rank2} />} {val2 ?? "—"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Team headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
        <div className="text-right">
          <div className="text-xs font-bold text-[#1B365D] truncate">
            {team1 ? schoolName(team1.name) : "—"}
          </div>
          {k1 && (
            <div className="text-[10px] text-[#5A7A99]">
              #{k1.rank} overall &middot; {k1.record}
            </div>
          )}
        </div>
        <div className="text-[10px] font-bold text-[#5A7A99] text-center w-12">vs</div>
        <div className="text-left">
          <div className="text-xs font-bold text-[#F4793B] truncate">
            {team2 ? schoolName(team2.name) : "—"}
          </div>
          {k2 && (
            <div className="text-[10px] text-[#5A7A99]">
              #{k2.rank} overall &middot; {k2.record}
            </div>
          )}
        </div>
      </div>

      {/* Efficiency comparison */}
      <div className="bg-[#EFF5FA] rounded-xl p-3 space-y-2.5">
        <StatRow
          label="AdjEM"
          val1={k1?.adjEM}
          rank1={k1?.rank}
          val2={k2?.adjEM}
          rank2={k2?.rank}
        />
        <div className="border-t border-[#BFD4E4]/50" />
        <StatRow
          label="Off Eff"
          val1={k1?.adjO}
          rank1={k1?.adjORank}
          val2={k2?.adjO}
          rank2={k2?.adjORank}
        />
        <div className="border-t border-[#BFD4E4]/50" />
        <StatRow
          label="Def Eff"
          val1={k1?.adjD}
          rank1={k1?.adjDRank}
          val2={k2?.adjD}
          rank2={k2?.adjDRank}
          lowerIsBetter
        />
        <div className="border-t border-[#BFD4E4]/50" />
        <StatRow
          label="Tempo"
          val1={k1?.adjT}
          rank1={k1?.adjTRank}
          val2={k2?.adjT}
          rank2={k2?.adjTRank}
        />
      </div>

      <p className="text-[10px] text-[#5A7A99]/60">
        Adjusted efficiency ratings via KenPom. Lower Def Eff = better defense.
      </p>
    </div>
  );
}

type TeamDetailsData = {
  record: string;
  homeRecord: string | null;
  awayRecord: string | null;
  streak: string | null;
  ppg: string | null;
  oppg: string | null;
  last10: Array<{
    date: string;
    opponent: string;
    opponentLogo: string | null;
    score: string;
    win: boolean;
    home: boolean;
  }>;
  keyPlayers: Array<{
    name: string;
    jersey: string;
    position: string;
    year: string;
  }>;
  kenpomRank: number | null;
  kenpomAdjO: string | null;
  kenpomAdjORank: number | null;
  kenpomAdjD: string | null;
  kenpomAdjDRank: number | null;
  quadRecord: { q1: string; q2: string; q3: string; q4: string } | null;
  notableWins: Array<{
    opponent: string;
    opponentLogo: string | null;
    opponentRank: number;
    score: string;
    win: boolean;
    date: string;
  }>;
  notableLosses: Array<{
    opponent: string;
    opponentLogo: string | null;
    opponentRank: number;
    score: string;
    win: boolean;
    date: string;
  }>;
};

function TeamDetailsSection({ team }: { team: TeamData }) {
  const [data, setData] = useState<TeamDetailsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded || fetched) return;
    setFetched(true);
    setLoading(true);
    fetch(`/api/team-details?teamId=${team.id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [team.id, expanded, fetched]);

  return (
    <div className="border-t border-[#BFD4E4]/50 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
        type="button"
      >
        {team.logoUrl && (
          <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain" />
        )}
        <span className="text-xs font-bold text-[#1B365D] uppercase tracking-wider flex-1">
          {schoolName(team.name)}
        </span>
        <svg
          className={`w-4 h-4 text-[#5A7A99] transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {loading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-[#EFF5FA] rounded w-3/4" />
              <div className="h-3 bg-[#EFF5FA] rounded w-1/2" />
              <div className="h-16 bg-[#EFF5FA] rounded" />
            </div>
          )}

          {data && (
            <>
              {/* Record & Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#EFF5FA] rounded-lg px-2 py-1.5">
                  <div className="text-xs font-bold text-[#1B365D]">{data.record}</div>
                  <div className="text-[9px] text-[#5A7A99]">Record</div>
                </div>
                {data.streak && (
                  <div className="bg-[#EFF5FA] rounded-lg px-2 py-1.5">
                    <div className={`text-xs font-bold ${data.streak.endsWith("W") ? "text-green-600" : "text-red-600"}`}>
                      {data.streak}
                    </div>
                    <div className="text-[9px] text-[#5A7A99]">Streak</div>
                  </div>
                )}
                {data.ppg && data.oppg && (
                  <div className="bg-[#EFF5FA] rounded-lg px-2 py-1.5">
                    <div className="text-xs font-bold text-[#1B365D]">{data.ppg}/{data.oppg}</div>
                    <div className="text-[9px] text-[#5A7A99]">PPG/Opp</div>
                  </div>
                )}
              </div>

              {/* Home/Away */}
              {(data.homeRecord || data.awayRecord) && (
                <div className="flex gap-3 text-[10px] text-[#5A7A99]">
                  {data.homeRecord && <span>Home: <span className="font-semibold text-[#1B365D]">{data.homeRecord}</span></span>}
                  {data.awayRecord && <span>Away: <span className="font-semibold text-[#1B365D]">{data.awayRecord}</span></span>}
                </div>
              )}

              {/* KenPom badges */}
              {data.kenpomRank && (
                <div className="flex gap-2 text-[10px]">
                  <span className="bg-[#1B365D] text-white rounded-full px-2 py-0.5 font-bold">
                    KenPom #{data.kenpomRank}
                  </span>
                  {data.kenpomAdjO && (
                    <span className="bg-[#EFF5FA] text-[#1B365D] rounded-full px-2 py-0.5 font-semibold">
                      Off #{data.kenpomAdjORank}
                    </span>
                  )}
                  {data.kenpomAdjD && (
                    <span className="bg-[#EFF5FA] text-[#1B365D] rounded-full px-2 py-0.5 font-semibold">
                      Def #{data.kenpomAdjDRank}
                    </span>
                  )}
                </div>
              )}

              {/* Last 10 Games */}
              {data.last10.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-[#5A7A99] uppercase tracking-wider mb-1">
                    Last {data.last10.length} Games
                  </div>
                  <div className="flex gap-0.5">
                    {data.last10.map((g, i) => (
                      <div
                        key={i}
                        className={`w-full h-5 rounded-sm flex items-center justify-center text-[9px] font-bold ${
                          g.win
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-600"
                        }`}
                        title={`${g.win ? "W" : "L"} ${g.score} vs ${g.opponent}`}
                      >
                        {g.win ? "W" : "L"}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quad Record */}
              {data.quadRecord && (
                <div>
                  <div className="text-[10px] font-bold text-[#5A7A99] uppercase tracking-wider mb-1">
                    Quad Record
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {(["q1", "q2", "q3", "q4"] as const).map((q, i) => {
                      const val = data.quadRecord![q];
                      const [w] = val.split("-").map(Number);
                      return (
                        <div key={q} className="bg-[#EFF5FA] rounded px-1.5 py-1">
                          <div className={`text-xs font-bold ${w > 0 && i === 0 ? "text-green-600" : "text-[#1B365D]"}`}>
                            {val}
                          </div>
                          <div className="text-[8px] text-[#5A7A99] font-semibold">Q{i + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notable Wins */}
              {data.notableWins.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">
                    Notable Wins
                  </div>
                  <div className="space-y-0.5">
                    {data.notableWins.map((g, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-green-600 font-bold w-4">W</span>
                        {g.opponentLogo && (
                          <img src={g.opponentLogo} alt="" className="w-3.5 h-3.5 object-contain" />
                        )}
                        <span className="text-[#1B365D] font-medium truncate flex-1">
                          #{g.opponentRank} {g.opponent}
                        </span>
                        <span className="text-[#5A7A99] font-mono text-[10px] flex-shrink-0">{g.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notable Losses */}
              {data.notableLosses.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1">
                    Notable Losses
                  </div>
                  <div className="space-y-0.5">
                    {data.notableLosses.map((g, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-red-500 font-bold w-4">L</span>
                        {g.opponentLogo && (
                          <img src={g.opponentLogo} alt="" className="w-3.5 h-3.5 object-contain" />
                        )}
                        <span className="text-[#1B365D] font-medium truncate flex-1">
                          #{g.opponentRank} {g.opponent}
                        </span>
                        <span className="text-[#5A7A99] font-mono text-[10px] flex-shrink-0">{g.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Players */}
              {data.keyPlayers.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-[#5A7A99] uppercase tracking-wider mb-1">
                    Key Players
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {data.keyPlayers.slice(0, 6).map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-[#5A7A99] font-mono w-4 text-right">#{p.jersey}</span>
                        <span className="text-[#1B365D] font-medium truncate">{p.name}</span>
                        <span className="text-[#5A7A99] text-[9px] ml-auto flex-shrink-0">{p.position}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && !data && (
            <p className="text-xs text-[#5A7A99] italic">Team details unavailable</p>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisSection({ gameId }: { gameId?: number }) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!gameId || fetched) return;
    setFetched(true);
    setLoading(true);
    fetch(`/api/analysis?gameId=${gameId}`)
      .then((r) => r.json())
      .then((data) => setAnalysis(data.analysis || null))
      .catch(() => setAnalysis(null))
      .finally(() => setLoading(false));
  }, [gameId, fetched]);

  if (!gameId) return null;

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-[#EFF5FA] rounded w-full" />
        <div className="h-3 bg-[#EFF5FA] rounded w-5/6" />
        <div className="h-3 bg-[#EFF5FA] rounded w-4/6" />
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="mt-3 pt-3 border-t border-[#BFD4E4]/50">
      <p className="text-xs font-bold text-[#5A7A99] uppercase tracking-wider mb-1.5">AI Analysis</p>
      <p className="text-sm text-[#1B365D] leading-relaxed">{analysis}</p>
    </div>
  );
}

function InfoModal({
  open,
  onClose,
  team1,
  team2,
  result,
  gameInfo,
  upsetInfo,
}: {
  open: boolean;
  onClose: () => void;
  team1: TeamData | null;
  team2: TeamData | null;
  result?: GameResult;
  gameInfo?: GameInfo;
  upsetInfo?: { level: UpsetLevel; underdogSlot: "team1" | "team2" | null; probability: number };
}) {
  const [activeTab, setActiveTab] = useState<"matchup" | "odds" | "kenpom">("matchup");
  const [records, setRecords] = useState<{ team1?: string; team2?: string }>({});

  useEffect(() => {
    if (!open) return;
    // Fetch records from ESPN via our lightweight proxy
    async function fetchRecords() {
      const ids = [team1?.id, team2?.id].filter(Boolean);
      if (ids.length === 0) return;
      const params = new URLSearchParams();
      ids.forEach((id) => params.append("teamIds", String(id)));
      try {
        const res = await fetch(`/api/team-records?${params}`);
        if (res.ok) {
          const data = await res.json();
          setRecords({
            team1: team1 ? data[team1.id] : undefined,
            team2: team2 ? data[team2.id] : undefined,
          });
        }
      } catch {}
    }
    fetchRecords();
  }, [open, team1, team2]);

  if (!open) return null;

  const startDate = gameInfo?.startTime ? new Date(gameInfo.startTime) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#1B365D] px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#F4793B] uppercase tracking-wider">
              {gameInfo ? ROUND_LABELS[gameInfo.round] || `Round ${gameInfo.round}` : "Matchup"}
            </div>
            <div className="text-sm text-white/60 mt-0.5">
              {gameInfo?.region}
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Upset Banner */}
        {upsetInfo && (
          <div className={`px-5 py-2 flex items-center gap-2 ${
            upsetInfo.level === "alert"
              ? "bg-amber-500 text-white"
              : "bg-amber-100 text-amber-800"
          }`}>
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-bold">
              {upsetInfo.level === "alert" ? "Upset Alert" : "Potential Upset"}
            </span>
            <span className={`text-sm ${upsetInfo.level === "alert" ? "opacity-80" : "opacity-70"}`}>
              — Underdog has {Math.round(upsetInfo.probability * 100)}% win probability
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[#BFD4E4]/50">
          {([
            { key: "matchup" as const, label: "Matchup" },
            { key: "kenpom" as const, label: "KenPom" },
            { key: "odds" as const, label: "Odds & AI" },
          ]).map((tab) => (
            <button
              key={tab.key}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "text-[#1B365D] border-b-2 border-[#F4793B]"
                  : "text-[#5A7A99] hover:text-[#1B365D]"
              }`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto">
          {activeTab === "matchup" ? (
            <>
              <div className="flex flex-col gap-3">
                {[team1, team2].map((team, i) => {
                  const score = i === 0 ? result?.team1Score : result?.team2Score;
                  const isWinner = result?.winnerTeamId === team?.id;
                  const record = i === 0 ? records.team1 : records.team2;
                  return (
                    <div
                      key={team?.id ?? i}
                      className={`flex items-center gap-3 p-3 rounded-xl ${
                        isWinner ? "bg-green-50 ring-1 ring-green-200" : "bg-[#EFF5FA]"
                      }`}
                    >
                      {team?.logoUrl && (
                        <img src={team.logoUrl} alt="" className="w-10 h-10 object-contain" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#5A7A99]">{team?.seed}</span>
                          <span className={`text-base font-semibold truncate ${isWinner ? "text-green-700" : "text-[#1B365D]"}`}>
                            {team ? schoolName(team.name) : "TBD"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        {score !== null && score !== undefined && (
                          <span className={`text-2xl font-bold font-mono tabular-nums ${isWinner ? "text-green-700" : "text-[#1B365D]"}`}>
                            {score}
                          </span>
                        )}
                        {record && (
                          <span className="text-[11px] text-[#5A7A99]">{record}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {result?.status === "in_progress" && (
                <div className="mt-4 flex items-center gap-2 justify-center">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="text-sm font-bold text-green-600 uppercase">Live</span>
                </div>
              )}
              {result?.status === "final" && (
                <div className="mt-4 text-center text-sm font-bold text-[#5A7A99] uppercase">Final</div>
              )}

              {(gameInfo?.startTime || gameInfo?.venue || gameInfo?.broadcast) && (
                <div className="mt-4 pt-4 border-t border-[#BFD4E4]/50 space-y-2.5">
                  {startDate && (
                    <div className="flex items-center gap-2.5 text-sm text-[#5A7A99]">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      {startDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {" at "}
                      {startDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </div>
                  )}
                  {gameInfo?.venue && (
                    <div className="flex items-center gap-2.5 text-sm text-[#5A7A99]">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      {gameInfo.venue}
                    </div>
                  )}
                  {gameInfo?.broadcast && (
                    <div className="flex items-center gap-2.5 text-sm text-[#5A7A99]">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z" />
                      </svg>
                      {gameInfo.broadcast}
                    </div>
                  )}
                </div>
              )}

              {/* Team Details (expandable) */}
              <div className="mt-4 space-y-1">
                {team1 && <TeamDetailsSection team={team1} />}
                {team2 && <TeamDetailsSection team={team2} />}
              </div>
            </>
          ) : activeTab === "kenpom" ? (
            /* KenPom Tab */
            <KenpomSection team1={team1} team2={team2} />
          ) : (
            /* Odds & Analysis Tab */
            <div className="space-y-4">
              {gameInfo && (
                <WinProbabilityBar team1={team1} team2={team2} gameInfo={gameInfo} />
              )}
              {gameInfo && <OddsTable gameInfo={gameInfo} />}
              {gameInfo?.gameId && <AnalysisSection gameId={gameInfo.gameId} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayInRow({ teams }: { teams: PlayInTeam[] }) {
  return (
    <div className="flex items-center px-3 py-2.5 text-sm text-[#5A7A99]">
      <span className="font-bold text-[#5A7A99]/60 w-5 text-center flex-shrink-0">{teams[0]?.seed}</span>
      <span className="ml-2 truncate font-medium">
        {teams.map((t) => t.abbreviation).join(" / ")}
      </span>
    </div>
  );
}

function TeamRow({
  team,
  score,
  isPicked,
  isWinner,
  isEliminated,
  onClick,
  disabled,
  pickedTeamId,
  result,
}: {
  team: TeamData | null;
  score: number | null;
  isPicked: boolean;
  isWinner: boolean;
  isEliminated: boolean;
  onClick: () => void;
  disabled: boolean;
  pickedTeamId: number | undefined;
  result?: GameResult;
}) {
  if (!team) {
    return (
      <div className="flex items-center px-3 py-2.5 h-10 text-sm text-[#BFD4E4] italic">
        <div className="w-5 h-5 rounded-full bg-[#EFF5FA] flex-shrink-0 mr-2" />
        <span>TBD</span>
      </div>
    );
  }

  return (
    <button
      className={`flex items-center w-full px-3 py-2.5 h-10 text-sm transition-colors ${
        disabled ? "cursor-default" : "cursor-pointer hover:bg-[#EFF5FA]"
      } ${isPicked ? "font-bold" : "font-medium"} ${
        isEliminated ? "text-[#5A7A99]/50 line-through" : "text-[#1B365D]"
      } ${isWinner ? "text-green-700" : ""}`}
      onClick={onClick}
      disabled={disabled && !isPicked}
      type="button"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {team.logoUrl ? (
          <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
        ) : (
          <span className="w-5 h-5 rounded bg-[#EFF5FA] flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-[#5A7A99]">
            {team.abbreviation.slice(0, 2)}
          </span>
        )}
        <span className="text-[#5A7A99] font-bold w-5 text-center flex-shrink-0 text-xs">{team.seed}</span>
        <span className="truncate">{schoolName(team.name)}</span>
      </div>
      {score !== null && (
        <span className="font-mono font-bold ml-1.5 flex-shrink-0 tabular-nums">{score}</span>
      )}
      <div className="ml-1.5 flex-shrink-0">
        <PickIcon team={team} pickedTeamId={pickedTeamId} result={result} />
      </div>
    </button>
  );
}

export default function BracketGame({
  gameId,
  team1,
  team2,
  pickedTeamId,
  onPick,
  disabled,
  result,
  playInTeams,
  gameInfo,
}: BracketGameProps) {
  const [showInfo, setShowInfo] = useState(false);

  const playInSlot: "team1" | "team2" | null =
    playInTeams && playInTeams.length === 2
      ? !team1 ? "team1" : !team2 ? "team2" : null
      : null;

  const isLive = result?.status === "in_progress";

  const upsetInfo = team1 && team2 && gameInfo
    ? detectUpset(
        team1.seed,
        team2.seed,
        gameInfo.moneylineTeam1,
        gameInfo.moneylineTeam2,
        result?.status ?? "scheduled"
      )
    : { level: null as UpsetLevel, underdogSlot: null, probability: 0 };

  return (
    <>
      <div className={`w-56 rounded-lg bg-white shadow-sm overflow-hidden border ${
        isLive ? "border-green-400 ring-1 ring-green-400/20"
          : upsetInfo.level === "alert" ? "border-amber-500 ring-1 ring-amber-500/30"
          : upsetInfo.level === "potential" ? "border-amber-300 ring-1 ring-amber-300/30"
          : "border-[#BFD4E4]/80"
      }`}>
        {upsetInfo.level && !isLive && (
          <div className={`text-[9px] font-extrabold text-center py-0.5 uppercase tracking-widest ${
            upsetInfo.level === "alert"
              ? "bg-amber-500 text-white"
              : "bg-amber-100 text-amber-700"
          }`}>
            {upsetInfo.level === "alert" ? "Upset Alert" : "Upset Potential"}
          </div>
        )}
        {isLive && (
          <div className="bg-green-500 text-white text-[9px] font-extrabold text-center py-0.5 uppercase tracking-widest flex items-center justify-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            Live
          </div>
        )}
        <div className="flex">
          {/* Teams column */}
          <div className="flex-1 min-w-0">
            <div>
              {playInSlot === "team1" ? (
                <PlayInRow teams={playInTeams!} />
              ) : (
                <TeamRow
                  team={team1}
                  score={result?.team1Score ?? null}
                  isPicked={pickedTeamId === team1?.id}
                  isWinner={result?.winnerTeamId === team1?.id}
                  isEliminated={!!result?.winnerTeamId && result.winnerTeamId !== team1?.id}
                  onClick={() => team1 && onPick(gameId, team1.id)}
                  disabled={disabled}
                  pickedTeamId={pickedTeamId}
                  result={result}
                />
              )}
            </div>
            <div className="border-t border-[#EFF5FA]" />
            <div>
              {playInSlot === "team2" ? (
                <PlayInRow teams={playInTeams!} />
              ) : (
                <TeamRow
                  team={team2}
                  score={result?.team2Score ?? null}
                  isPicked={pickedTeamId === team2?.id}
                  isWinner={result?.winnerTeamId === team2?.id}
                  isEliminated={!!result?.winnerTeamId && result.winnerTeamId !== team2?.id}
                  onClick={() => team2 && onPick(gameId, team2.id)}
                  disabled={disabled}
                  pickedTeamId={pickedTeamId}
                  result={result}
                />
              )}
            </div>
          </div>
          {/* Info button column */}
          <div className="flex items-center border-l border-[#EFF5FA] px-2">
            <button
              onClick={() => setShowInfo(true)}
              className="w-6 h-6 rounded-full border border-[#BFD4E4] text-[#5A7A99] hover:bg-[#EFF5FA] hover:text-[#1B365D] transition-colors flex items-center justify-center"
              type="button"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <InfoModal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        team1={team1}
        team2={team2}
        result={result}
        gameInfo={gameInfo}
        upsetInfo={upsetInfo.level ? upsetInfo : undefined}
      />
    </>
  );
}
