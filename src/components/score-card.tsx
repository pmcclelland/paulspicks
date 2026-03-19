"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { schoolName } from "@/lib/school-names";

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
};

function getStatusBadge(status: string) {
  switch (status) {
    case "final":
      return <Badge variant="secondary">Final</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-700">
          Live
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
}: ScoreCardProps) {
  const isTeam1Winner = winnerTeamId !== null && winnerTeamId === team1Id;
  const isTeam2Winner = winnerTeamId !== null && winnerTeamId === team2Id;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          {getStatusBadge(status)}
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
  );
}
