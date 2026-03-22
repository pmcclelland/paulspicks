"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { schoolName } from "@/lib/school-names";
import { InfoModal } from "@/components/bracket-game";
import type { TeamData, GameResult, GameInfo } from "@/components/bracket-game";

type ScoreCardProps = {
  team1Name: string;
  team1Abbreviation: string;
  team1Seed: number;
  team1Score: number | null;
  team1LogoUrl?: string | null;
  team2Name: string;
  team2Abbreviation: string;
  team2Seed: number;
  team2Score: number | null;
  team2LogoUrl?: string | null;
  status: string;
  startTime?: string | null;
  venue?: string | null;
  broadcast?: string | null;
  winnerTeamId?: number | null;
  team1Id?: number;
  team2Id?: number;
  spreadDetails?: string | null;
  overUnder?: string | null;
  statusDetail?: string | null;
  gameId?: number;
  round?: number;
  region?: string;
  spreadLine?: string | null;
  moneylineTeam1?: string | null;
  moneylineTeam2?: string | null;
  oddsProvider?: string | null;
  espnEventId?: string | null;
};

function getStatusBadge(status: string, statusDetail?: string | null) {
  switch (status) {
    case "final":
      return <Badge variant="secondary">Final</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-700">
          {statusDetail || "Live"}
        </Badge>
      );
    case "scheduled":
    default:
      return <Badge variant="outline">Scheduled</Badge>;
  }
}

export default function ScoreCard({
  team1Name,
  team1Abbreviation,
  team1Seed,
  team1Score,
  team1LogoUrl,
  team2Name,
  team2Abbreviation,
  team2Seed,
  team2Score,
  team2LogoUrl,
  status,
  startTime,
  venue,
  broadcast,
  winnerTeamId,
  team1Id,
  team2Id,
  spreadDetails,
  overUnder,
  statusDetail,
  gameId,
  round,
  region,
  spreadLine,
  moneylineTeam1,
  moneylineTeam2,
  oddsProvider,
  espnEventId,
}: ScoreCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  const isTeam1Winner = winnerTeamId !== null && winnerTeamId === team1Id;
  const isTeam2Winner = winnerTeamId !== null && winnerTeamId === team2Id;

  const team1: TeamData | null = team1Id
    ? { id: team1Id, name: team1Name, abbreviation: team1Abbreviation, seed: team1Seed, logoUrl: team1LogoUrl }
    : null;
  const team2: TeamData | null = team2Id
    ? { id: team2Id, name: team2Name, abbreviation: team2Abbreviation, seed: team2Seed, logoUrl: team2LogoUrl }
    : null;

  const result: GameResult | undefined =
    status !== "scheduled"
      ? { winnerTeamId: winnerTeamId ?? null, team1Score, team2Score, status }
      : undefined;

  const gameInfo: GameInfo = {
    startTime,
    venue,
    broadcast,
    round: round ?? 0,
    region: region ?? "",
    gameId,
    spreadLine,
    spreadDetails,
    moneylineTeam1,
    moneylineTeam2,
    overUnder,
    oddsProvider,
    espnEventId: espnEventId ?? undefined,
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            {getStatusBadge(status, statusDetail)}
            <div className="flex items-center gap-2">
              {startTime && status === "scheduled" && (
                <span className="text-xs text-muted-foreground">
                  {new Date(startTime).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <button
                onClick={() => setShowInfo(true)}
                className="w-6 h-6 rounded-full border border-[#BFD4E4] text-[#5A7A99] hover:bg-[#EFF5FA] hover:text-[#1B365D] transition-colors flex items-center justify-center flex-shrink-0"
                type="button"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          {/* Team 1 */}
          <div
            className={`flex items-center justify-between py-2 ${
              isTeam1Winner ? "font-bold" : ""
            } ${status === "final" && !isTeam1Winner ? "text-muted-foreground" : ""}`}
          >
            <div className="flex items-center gap-2">
              {team1LogoUrl && (
                <img src={team1LogoUrl} alt="" className="w-6 h-6 object-contain" />
              )}
              <span className="text-xs text-muted-foreground">{team1Seed}</span>
              <span className="text-sm">{schoolName(team1Name)}</span>
            </div>
            {team1Score !== null && (
              <span className="font-mono text-lg">{team1Score}</span>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Team 2 */}
          <div
            className={`flex items-center justify-between py-2 ${
              isTeam2Winner ? "font-bold" : ""
            } ${status === "final" && !isTeam2Winner ? "text-muted-foreground" : ""}`}
          >
            <div className="flex items-center gap-2">
              {team2LogoUrl && (
                <img src={team2LogoUrl} alt="" className="w-6 h-6 object-contain" />
              )}
              <span className="text-xs text-muted-foreground">{team2Seed}</span>
              <span className="text-sm">{schoolName(team2Name)}</span>
            </div>
            {team2Score !== null && (
              <span className="font-mono text-lg">{team2Score}</span>
            )}
          </div>

          {/* Odds line for scheduled/in-progress */}
          {(spreadDetails || overUnder) && status !== "final" && (
            <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground flex gap-3">
              {spreadDetails && <span>Spread: {spreadDetails}</span>}
              {overUnder && <span>O/U {overUnder}</span>}
            </div>
          )}

          {/* Meta info */}
          {(venue || broadcast) && (
            <div className="mt-2 pt-2 border-t border-border flex flex-wrap gap-2 text-xs text-muted-foreground">
              {venue && <span>{venue}</span>}
              {venue && broadcast && <span>&middot;</span>}
              {broadcast && <span>{broadcast}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <InfoModal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        team1={team1}
        team2={team2}
        result={result}
        gameInfo={gameInfo}
      />
    </>
  );
}
