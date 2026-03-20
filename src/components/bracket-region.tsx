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
  /** When user's pick for this game is an eliminated team not in either slot */
  bustedPickSlot?: "team1" | "team2" | null;
  /** When effectiveGames swapped team1/team2 relative to DB */
  isSwapped?: boolean;
};

type BracketRegionProps = {
  regionName: string;
  games: GameData[];
  teams: Map<number, TeamData>;
  userPicks: Map<number, number>;
  onPick: (gameId: number, teamId: number) => void;
  disabled: boolean;
  direction: "ltr" | "rtl";
  eliminatedTeamIds?: Set<number>;
  gameOdds?: Record<number, { team1Prob: number; team2Prob: number }>;
};

function renderGameCard(
  game: GameData,
  teams: Map<number, TeamData>,
  userPicks: Map<number, number>,
  onPick: (gameId: number, teamId: number) => void,
  disabled: boolean,
  direction: "ltr" | "rtl",
  eliminatedTeamIds?: Set<number>,
  gameOdds?: Record<number, { team1Prob: number; team2Prob: number }>
) {
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
      team1Eliminated={!!team1 && !!eliminatedTeamIds?.has(team1.id)}
      team2Eliminated={!!team2 && !!eliminatedTeamIds?.has(team2.id)}
      bustedPickSlot={game.bustedPickSlot}
      simProb={gameOdds?.[game.id] && game.isSwapped
        ? { team1Prob: gameOdds[game.id].team2Prob, team2Prob: gameOdds[game.id].team1Prob }
        : gameOdds?.[game.id]}
    />
  );
}

/** Connector drawn between two feeder games and the next round game */
function PairConnector({ direction }: { direction: "ltr" | "rtl" }) {
  const isLtr = direction === "ltr";
  const bc = "#BFD4E4";
  const borderSide = isLtr ? "borderRight" : "borderLeft";
  const b = `2px solid ${bc}`;

  return (
    <div
      className={`flex ${isLtr ? "flex-row" : "flex-row-reverse"} flex-shrink-0 w-8`}
      style={{ height: "100%" }}
    >
      {/* Merge bracket: 1:2:1 ratio for top-pad : vertical : bottom-pad */}
      <div className="flex-1 flex flex-col" style={{ height: "100%" }}>
        {/* Top pad — aligns with top half of game 1 */}
        <div style={{ flex: 1 }} />
        {/* Horizontal stub at game 1 center */}
        <div style={{ height: 0, borderBottom: b }} />
        {/* Vertical line from game 1 center to game 2 center */}
        <div style={{ flex: 2, [borderSide]: b }} />
        {/* Horizontal stub at game 2 center */}
        <div style={{ height: 0, borderBottom: b }} />
        {/* Bottom pad — aligns with bottom half of game 2 */}
        <div style={{ flex: 1 }} />
      </div>
      {/* Output horizontal line at midpoint */}
      <div className="flex-1 flex items-center">
        <div className="w-full h-0" style={{ borderTop: b }} />
      </div>
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
  eliminatedTeamIds,
  gameOdds,
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

  // Group games into pairs for each round
  function pairUp(gameList: GameData[]): [GameData, GameData][] {
    const pairs: [GameData, GameData][] = [];
    for (let i = 0; i < gameList.length; i += 2) {
      pairs.push([gameList[i], gameList[i + 1]]);
    }
    return pairs;
  }

  // Recursively build the bracket tree from right-to-left (later rounds to earlier)
  // For each game in a later round, render its two feeder games + connector + itself
  function renderRoundColumn(roundIdx: number): React.ReactNode {
    const round = roundNumbers[roundIdx];
    const roundGames = rounds.get(round) || [];

    if (roundIdx === 0) {
      // Base case: R1 games, render pairs with gap
      const pairs = pairUp(roundGames);
      return (
        <div className="flex flex-col gap-4 justify-center">
          {pairs.map((pair, pi) => (
            <div key={pi} className="flex flex-col gap-2">
              {pair.map((game) => (
                <div key={game.id}>
                  {renderGameCard(game, teams, userPicks, onPick, disabled, direction, eliminatedTeamIds, gameOdds)}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    // For later rounds, render each game with its connector and feeder column
    return (
      <div className="flex flex-col justify-center">
        {roundGames.map((game, gi) => (
          <div
            key={game.id}
            className={`flex-1 flex ${direction === "rtl" ? "flex-row-reverse" : "flex-row"} items-stretch`}
          >
            {/* Connector from feeder pair */}
            <PairConnector direction={direction} />
            {/* This game */}
            <div className="flex items-center">
              {renderGameCard(game, teams, userPicks, onPick, disabled, direction, eliminatedTeamIds, gameOdds)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Build columns: R1 | conn | R2 | conn | R3 | conn | R4
  // But instead of separate columns, we nest: each later round wraps around the previous
  // Actually, let's keep the flat column approach but fix the connectors

  const columns: React.ReactNode[] = [];

  for (let ri = 0; ri < roundNumbers.length; ri++) {
    const round = roundNumbers[ri];
    const roundGames = rounds.get(round) || [];

    // Round column
    if (round === 1) {
      // R1: render games in pairs with gap-4 between pairs, gap-2 within pairs
      // Include the R1→R2 connector INSIDE each pair wrapper so heights match
      const pairs = pairUp(roundGames);
      const hasNextRound = ri < roundNumbers.length - 1;
      columns.push(
        <div key={`round-${round}`} className="flex flex-col gap-4 justify-center flex-shrink-0">
          {pairs.map((pair, pi) => (
            <div key={pi} className={`flex ${direction === "rtl" ? "flex-row-reverse" : "flex-row"}`}>
              <div className="flex flex-col gap-2">
                {pair.map((game) => (
                  <div key={game.id}>
                    {renderGameCard(game, teams, userPicks, onPick, disabled, direction, eliminatedTeamIds, gameOdds)}
                  </div>
                ))}
              </div>
              {hasNextRound && <PairConnector direction={direction} />}
            </div>
          ))}
        </div>
      );
      // Skip the separate connector column for R1 since it's now inline
      if (hasNextRound) ri; // connector already rendered above
    } else {
      // Later rounds: games flex-1 centered
      columns.push(
        <div key={`round-${round}`} className="flex flex-col justify-center flex-shrink-0">
          {roundGames.map((game) => (
            <div key={game.id} className="flex-1 flex items-center">
              {renderGameCard(game, teams, userPicks, onPick, disabled, direction, eliminatedTeamIds, gameOdds)}
            </div>
          ))}
        </div>
      );
    }

    // Connector column between this round and the next
    if (ri < roundNumbers.length - 1) {
      const pairCount = roundGames.length / 2;

      if (round === 1) {
        // R1→R2 connector is rendered inline with game pairs above — skip
      } else {
        // Later rounds: flex-1 per connector, stretch to fill
        columns.push(
          <div key={`conn-${round}`} className="flex flex-col justify-center flex-shrink-0">
            {Array.from({ length: pairCount }).map((_, pi) => (
              <div key={pi} className="flex-1 flex">
                <PairConnector direction={direction} />
              </div>
            ))}
          </div>
        );
      }
    }
  }

  return (
    <div className="flex flex-col">
      <h3
        className="text-lg font-extrabold text-[#1B365D] mb-3 uppercase tracking-wider"
        style={{ textAlign: direction === "rtl" ? "right" : "left" }}
      >
        {regionName}
      </h3>

      <div
        className={`flex ${direction === "rtl" ? "flex-row-reverse" : "flex-row"} items-stretch`}
      >
        {columns}
      </div>
    </div>
  );
}
