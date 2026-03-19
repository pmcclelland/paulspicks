"use client";

import BracketGame, { type TeamData, type GameResult, type GameInfo } from "./bracket-game";

export type PlayInTeam = {
  id: number;
  name: string;
  abbreviation: string;
  seed: number;
  logoUrl: string | null;
};

export type GameData = {
  id: number;
  round: number;
  gameIndex: number;
  region: string;
  team1Id: number | null;
  team2Id: number | null;
  winnerTeamId: number | null;
  team1Score: number | null;
  team2Score: number | null;
  status: string;
  startTime?: string | null;
  venue?: string | null;
  broadcast?: string | null;
  playInTeams?: string | null;
  spreadLine?: string | null;
  spreadDetails?: string | null;
  moneylineTeam1?: string | null;
  moneylineTeam2?: string | null;
  overUnder?: string | null;
  oddsProvider?: string | null;
};

const ROUND_HEADERS: Record<number, { name: string; dates: string }> = {
  1: { name: "ROUND 1", dates: "Mar 19 - 20" },
  2: { name: "ROUND 2", dates: "Mar 21 - 22" },
  3: { name: "SWEET 16", dates: "Mar 26 - 27" },
  4: { name: "ELITE 8", dates: "Mar 28 - 29" },
};

type BracketRegionProps = {
  regionName: string;
  games: GameData[];
  teams: Map<number, TeamData>;
  userPicks: Map<number, number>;
  onPick: (gameId: number, teamId: number) => void;
  disabled: boolean;
  direction: "ltr" | "rtl";
};

export default function BracketRegion({
  regionName,
  games,
  teams,
  userPicks,
  onPick,
  disabled,
  direction,
}: BracketRegionProps) {
  const rounds: Map<number, GameData[]> = new Map();
  for (const game of games) {
    const existing = rounds.get(game.round) || [];
    existing.push(game);
    rounds.set(game.round, existing);
  }

  for (const [, roundGames] of rounds) {
    roundGames.sort((a, b) => a.gameIndex - b.gameIndex);
  }

  const roundNumbers = Array.from(rounds.keys()).sort((a, b) => a - b);

  return (
    <div className="flex flex-col">
      <h3 className="text-lg font-extrabold text-[#1B365D] mb-3 uppercase tracking-wider"
        style={{ textAlign: direction === "rtl" ? "right" : "left" }}
      >
        {regionName}
      </h3>

      {/* Games */}
      <div className={`flex ${direction === "rtl" ? "flex-row-reverse" : "flex-row"} gap-3 items-center`}>
        {roundNumbers.map((round) => {
          const roundGames = rounds.get(round) || [];
          const gapClass =
            round === 1
              ? "gap-2"
              : round === 2
                ? "gap-12"
                : round === 3
                  ? "gap-28"
                  : "gap-60";

          return (
            <div
              key={round}
              className={`flex flex-col ${gapClass} justify-center`}
            >
              {roundGames.map((game) => {
                const team1 = game.team1Id ? teams.get(game.team1Id) || null : null;
                const team2 = game.team2Id ? teams.get(game.team2Id) || null : null;

                const result: GameResult | undefined =
                  game.status !== "scheduled"
                    ? {
                        winnerTeamId: game.winnerTeamId,
                        team1Score: game.team1Score,
                        team2Score: game.team2Score,
                        status: game.status,
                      }
                    : undefined;

                let playInTeams = null;
                if (game.playInTeams) {
                  try {
                    playInTeams = JSON.parse(game.playInTeams);
                  } catch {}
                }

                const gameInfo: GameInfo = {
                  startTime: game.startTime,
                  venue: game.venue,
                  broadcast: game.broadcast,
                  round: game.round,
                  region: game.region,
                  gameId: game.id,
                  spreadLine: game.spreadLine,
                  spreadDetails: game.spreadDetails,
                  moneylineTeam1: game.moneylineTeam1,
                  moneylineTeam2: game.moneylineTeam2,
                  overUnder: game.overUnder,
                  oddsProvider: game.oddsProvider,
                };

                return (
                  <BracketGame
                    key={game.id}
                    gameId={game.id}
                    team1={team1}
                    team2={team2}
                    pickedTeamId={userPicks.get(game.id)}
                    onPick={onPick}
                    disabled={disabled}
                    result={result}
                    direction={direction}
                    playInTeams={playInTeams}
                    gameInfo={gameInfo}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
