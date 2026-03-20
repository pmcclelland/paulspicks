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

type FinalFourProps = {
  games: GameData[];
  teams: Map<number, TeamData>;
  userPicks: Map<number, number>;
  onPick: (gameId: number, teamId: number) => void;
  disabled: boolean;
  eliminatedTeamIds?: Set<number>;
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
}: {
  game: GameData;
  teams: Map<number, TeamData>;
  pickedTeamId: number | undefined;
  onPick: (gameId: number, teamId: number) => void;
  disabled: boolean;
  label: string;
  swapTeams?: boolean;
  eliminatedTeamIds?: Set<number>;
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

  function renderTeam(team: TeamData | null, score: number | null, teamId: number | null, slot: "team1" | "team2") {
    const isEliminated = teamId ? eliminatedTeamIds?.has(teamId) : false;
    const isSlotBusted = bustedPickSlot === slot;
    return (
      <button
        className={`flex items-center justify-between w-full px-3 py-2.5 text-sm transition-colors rounded-sm ${
          disabled ? "cursor-default" : "cursor-pointer hover:bg-accent"
        } ${pickedTeamId === teamId ? "font-bold" : "font-medium"} ${
          isEliminated ? "text-[#5A7A99]/50 line-through" : ""
        }`}
        onClick={() => teamId && team && onPick(game.id, teamId)}
        disabled={disabled && pickedTeamId !== teamId}
        type="button"
      >
        <div className="flex items-center gap-2 min-w-0">
          {team?.logoUrl && (
            <img src={team.logoUrl} alt="" className={`w-6 h-6 object-contain ${isEliminated ? "opacity-40" : ""}`} />
          )}
          <span className="text-[#5A7A99] text-xs font-bold">{team?.seed}</span>
          <span className="truncate">{team ? schoolName(team.name) : "TBD"}</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
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
      <div className="w-56 rounded-lg border-2 border-border bg-card shadow-md overflow-hidden">
        <div className={`border-l-3 ${getHighlight(team1?.id, "team1")}`}>
          {renderTeam(team1, topScore, team1Id, "team1")}
        </div>
        <div className="border-t border-border" />
        <div className={`border-l-3 ${getHighlight(team2?.id, "team2")}`}>
          {renderTeam(team2, bottomScore, team2Id, "team2")}
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
                        <span className={`text-lg font-extrabold ${isChampEliminated ? "text-[#5A7A99]/50 line-through" : "text-[#F4793B]"}`}>
                          {schoolName(championTeam.name)}
                        </span>
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
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
