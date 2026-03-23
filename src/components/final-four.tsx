"use client";

import { type TeamData, type GameResult } from "./bracket-game";
import { type GameData } from "./bracket-region";

import { schoolName } from "@/lib/school-names";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Swap simProb if effectiveGames swapped team1/team2 relative to DB */
function getAdjustedSimProb(
  game: GameData,
  gameOdds?: Record<number, { team1Prob: number; team2Prob: number }>
): { team1Prob: number; team2Prob: number } | undefined {
  const odds = gameOdds?.[game.id];
  if (!odds) return undefined;
  if (game.isSwapped) return { team1Prob: odds.team2Prob, team2Prob: odds.team1Prob };
  return odds;
}

type FinalFourProps = {
  games: GameData[];
  teams: Map<number, TeamData>;
  userPicks: Map<number, number>;
  onPick: (gameId: number, teamId: number) => void;
  disabled: boolean;
  eliminatedTeamIds?: Set<number>;
  gameOdds?: Record<number, { team1Prob: number; team2Prob: number }>;
};

function FinalFourGame({
  game,
  teams,
  pickedTeamId,
  onPick,
  disabled,
  label,
  swapTeams = false,
  eliminatedTeamIds,
  simProb,
}: {
  game: GameData;
  teams: Map<number, TeamData>;
  pickedTeamId: number | undefined;
  onPick: (gameId: number, teamId: number) => void;
  disabled: boolean;
  label: string;
  swapTeams?: boolean;
  eliminatedTeamIds?: Set<number>;
  simProb?: { team1Prob: number; team2Prob: number };
}) {
  // Remap bustedPickSlot when teams are swapped
  const bustedPickSlot = swapTeams
    ? (game.bustedPickSlot === "team1" ? "team2" : game.bustedPickSlot === "team2" ? "team1" : null)
    : (game.bustedPickSlot ?? null);
  const rawTeam1 = game.team1Id ? teams.get(game.team1Id) || null : null;
  const rawTeam2 = game.team2Id ? teams.get(game.team2Id) || null : null;
  const team1 = swapTeams ? rawTeam2 : rawTeam1;
  const team2 = swapTeams ? rawTeam1 : rawTeam2;
  const team1Id = swapTeams ? game.team2Id : game.team1Id;
  const team2Id = swapTeams ? game.team1Id : game.team2Id;
  const topScore = swapTeams ? game.team2Score : game.team1Score;
  const bottomScore = swapTeams ? game.team1Score : game.team2Score;
  const result: GameResult | undefined =
    game.status !== "scheduled"
      ? {
          winnerTeamId: game.winnerTeamId,
          team1Score: game.team1Score,
          team2Score: game.team2Score,
          status: game.status,
        }
      : undefined;

  function getHighlight(teamId: number | undefined, slot: "team1" | "team2") {
    // Orphaned busted pick: user picked an eliminated team that's not in this slot
    if (bustedPickSlot === slot) return "border-red-500/50 bg-red-500/5";
    if (!teamId) return "";
    if (pickedTeamId !== teamId) return "";
    const isTeamEliminated = eliminatedTeamIds?.has(teamId);
    if (!result || result.status === "scheduled") {
      if (isTeamEliminated) return "border-red-500/50 bg-red-500/5";
      return "border-[#F4793B] bg-[#F4793B]/5";
    }
    if (result.winnerTeamId === teamId) return "border-green-500 bg-green-500/5";
    if (result.winnerTeamId !== null) return "border-red-500 bg-red-500/5";
    return "border-[#F4793B] bg-[#F4793B]/5";
  }

  // Compute sim percentages for display
  const showSim = simProb && team1 && team2 && result?.status !== "final";
  const displayProb1 = showSim ? (swapTeams ? simProb.team2Prob : simProb.team1Prob) : 0;
  const displayProb2 = showSim ? (swapTeams ? simProb.team1Prob : simProb.team2Prob) : 0;
  const simPctTop = showSim ? Math.round(displayProb1 * 100) : undefined;
  const simPctBottom = showSim ? (simPctTop !== undefined ? 100 - simPctTop : undefined) : undefined;

  function renderTeam(team: TeamData | null, score: number | null, teamId: number | null, slot: "team1" | "team2", slotSimPct?: number) {
    // Only show eliminated (line-through) if this specific game is final and team lost
    const isEliminated = result?.status === "final" && result?.winnerTeamId !== null && teamId !== null && result.winnerTeamId !== teamId;
    // Show X if: orphaned busted pick OR team is in the slot but already eliminated from an earlier round
    const isPickEliminated = !!teamId && pickedTeamId === teamId && !!eliminatedTeamIds?.has(teamId);
    const isSlotBusted = bustedPickSlot === slot || isPickEliminated;
    return (
      <button
        className={`relative flex items-center justify-between w-full px-3 py-2.5 text-sm transition-colors rounded-sm ${
          disabled ? "cursor-default" : "cursor-pointer hover:bg-accent"
        } ${pickedTeamId === teamId ? "font-bold" : "font-medium"} ${
          isEliminated ? "text-[#5A7A99]/50 line-through" : ""
        }`}
        onClick={() => teamId && team && onPick(game.id, teamId)}
        disabled={disabled && pickedTeamId !== teamId}
        type="button"
      >
        {/* Sim probability fill — visible on group hover */}
        {slotSimPct !== undefined && (
          <div
            className="absolute inset-0 opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{
              background: `linear-gradient(90deg, ${slotSimPct >= 50 ? "rgba(27,54,93,0.08)" : "rgba(244,121,59,0.08)"} ${slotSimPct}%, transparent ${slotSimPct}%)`,
            }}
          />
        )}
        <div className="flex items-center gap-2 min-w-0 relative">
          {team?.logoUrl && (
            <img src={team.logoUrl} alt="" className={`w-6 h-6 object-contain ${isEliminated ? "opacity-40" : ""}`} />
          )}
          <span className="text-[#5A7A99] text-xs font-bold">{team?.seed}</span>
          <span className="truncate">{team ? schoolName(team.name) : "TBD"}</span>
        </div>
        <div className="flex items-center gap-1 ml-2 relative">
          {/* Sim percentage — fades in on hover */}
          {slotSimPct !== undefined && (
            <span className={`text-[10px] font-bold tabular-nums opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 ${
              slotSimPct >= 50 ? "text-[#1B365D]/50" : "text-[#F4793B]/60"
            }`}>
              {slotSimPct}%
            </span>
          )}
          {score !== null && (
            <span className="font-mono font-semibold">{score}</span>
          )}
          {isSlotBusted && (
            <svg className="w-5 h-5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
        {label}
      </span>
      <div className="w-56 rounded-lg border-2 border-border bg-card shadow-md overflow-hidden group">
        <div className={`border-l-3 ${getHighlight(team1?.id, "team1")}`}>
          {renderTeam(team1, topScore, team1Id, "team1", simPctTop)}
        </div>
        <div className="border-t border-border" />
        <div className={`border-l-3 ${getHighlight(team2?.id, "team2")}`}>
          {renderTeam(team2, bottomScore, team2Id, "team2", simPctBottom)}
        </div>
      </div>
    </div>
  );
}

export default function FinalFour({
  games,
  teams,
  userPicks,
  onPick,
  disabled,
  eliminatedTeamIds,
  gameOdds,
}: FinalFourProps) {
  const semis = games.filter((g) => g.round === 5).sort((a, b) => a.gameIndex - b.gameIndex);
  const championship = games.find((g) => g.round === 6);

  const championGamePick = championship ? userPicks.get(championship.id) : undefined;
  const championTeam = championGamePick ? teams.get(championGamePick) : null;

  return (
    <Card className="border-2 border-[#1B365D]/20 bg-gradient-to-b from-card to-[#EFF5FA] shadow-lg">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-center text-base font-extrabold text-[#1B365D] uppercase tracking-wider">
          Final Four
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-col lg:flex-row items-center gap-5">
            {/* Semi 1: East (top) vs South (bottom) — swap so East's team is on top */}
            {semis[0] && (
              <FinalFourGame
                game={semis[0]}
                teams={teams}
                pickedTeamId={userPicks.get(semis[0].id)}
                onPick={onPick}
                disabled={disabled}
                label="Semifinal 1"
                swapTeams
                eliminatedTeamIds={eliminatedTeamIds}
                simProb={getAdjustedSimProb(semis[0], gameOdds)}
              />
            )}

            {/* Championship */}
            {championship && (
              <div className="flex flex-col items-center gap-2">
                <FinalFourGame
                  game={championship}
                  teams={teams}
                  pickedTeamId={userPicks.get(championship.id)}
                  onPick={onPick}
                  disabled={disabled}
                  label="Championship"
                  eliminatedTeamIds={eliminatedTeamIds}
                  simProb={getAdjustedSimProb(championship, gameOdds)}
                />
                {championTeam && (() => {
                  const isChampEliminated = eliminatedTeamIds?.has(championTeam.id);
                  return (
                    <div className="mt-2 text-center">
                      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        National Champion
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 justify-center">
                        {championTeam.logoUrl && (
                          <img
                            src={championTeam.logoUrl}
                            alt=""
                            className={`w-7 h-7 object-contain ${isChampEliminated ? "opacity-40" : ""}`}
                          />
                        )}
                        <span className={`text-lg font-extrabold ${isChampEliminated ? "text-[#5A7A99]/50" : "text-[#F4793B]"}`}>
                          {schoolName(championTeam.name)}
                        </span>
                        {isChampEliminated && (
                          <svg className="w-5 h-5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Semi 2: West (top) vs Midwest (bottom) — swap so West's team is on top */}
            {semis[1] && (
              <FinalFourGame
                game={semis[1]}
                teams={teams}
                pickedTeamId={userPicks.get(semis[1].id)}
                onPick={onPick}
                disabled={disabled}
                label="Semifinal 2"
                swapTeams
                eliminatedTeamIds={eliminatedTeamIds}
                simProb={getAdjustedSimProb(semis[1], gameOdds)}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
