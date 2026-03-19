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

function BracketConnectors({
  pairCount,
  direction,
}: {
  pairCount: number;
  direction: "ltr" | "rtl";
}) {
  const isLtr = direction === "ltr";

  return (
    <div className="flex flex-col justify-center w-6 flex-shrink-0">
      {Array.from({ length: pairCount }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col">
          {/* Top half — horizontal stub + vertical down */}
          <div
            className={`flex-1 ${
              isLtr
                ? "border-r-2 border-b-2 rounded-br"
                : "border-l-2 border-b-2 rounded-bl"
            } border-[#BFD4E4]`}
          />
          {/* Bottom half — horizontal stub + vertical up */}
          <div
            className={`flex-1 ${
              isLtr
                ? "border-r-2 border-t-2 rounded-tr"
                : "border-l-2 border-t-2 rounded-tl"
            } border-[#BFD4E4]`}
          />
        </div>
      ))}
    </div>
  );
}

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

  function renderGameCard(game: GameData) {
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
  }

  // Build the columns: round, connector, round, connector, ...
  const columns: React.ReactNode[] = [];

  for (let ri = 0; ri < roundNumbers.length; ri++) {
    const round = roundNumbers[ri];
    const roundGames = rounds.get(round) || [];

    // Round column
    columns.push(
      <div
        key={`round-${round}`}
        className={`flex flex-col ${round === 1 ? "gap-2" : ""} justify-center`}
      >
        {roundGames.map((game) => {
          if (round > 1) {
            return (
              <div key={game.id} className="flex-1 flex items-center">
                {renderGameCard(game)}
              </div>
            );
          }
          return (
            <div key={game.id}>
              {renderGameCard(game)}
            </div>
          );
        })}
      </div>
    );

    // Connector column (between this round and the next)
    if (ri < roundNumbers.length - 1) {
      const pairCount = roundGames.length / 2;
      columns.push(
        <BracketConnectors
          key={`conn-${round}`}
          pairCount={pairCount}
          direction={direction}
        />
      );
    }
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-lg font-extrabold text-[#1B365D] mb-3 uppercase tracking-wider"
        style={{ textAlign: direction === "rtl" ? "right" : "left" }}
      >
        {regionName}
      </h3>

      {/* Games */}
      <div className={`flex ${direction === "rtl" ? "flex-row-reverse" : "flex-row"} gap-0 items-stretch`}>
        {columns}
      </div>
    </div>
  );
}
