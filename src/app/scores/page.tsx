"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import ScoreCard from "@/components/score-card";
import { ROUND_NAMES } from "@/lib/bracket-utils";

type GameWithTeams = {
  id: number | string;
  round: number;
  region: string;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: number | null;
  team2Score: number | null;
  status: string;
  startTime: string | null;
  venue: string | null;
  broadcast: string | null;
  winnerTeamId: number | null;
  statusDetail: string | null;
  spreadDetails: string | null;
  overUnder: string | null;
  team1: {
    id: number;
    name: string;
    abbreviation: string;
    seed: number;
    logoUrl: string | null;
  } | null;
  team2: {
    id: number;
    name: string;
    abbreviation: string;
    seed: number;
    logoUrl: string | null;
  } | null;
};

export default function ScoresPage() {
  const [games, setGames] = useState<GameWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch("/api/scores");
      if (!res.ok) {
        setError("Failed to load scores.");
        return;
      }
      const data = await res.json();
      setGames(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("Failed to load scores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 30000);
    return () => clearInterval(interval);
  }, [fetchScores]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F4793B] border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading scores...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchScores();
            }}
            className="text-sm text-[#F4793B] hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Group games by round
  const gamesByRound = new Map<number, GameWithTeams[]>();
  for (const game of games) {
    const existing = gamesByRound.get(game.round) || [];
    existing.push(game);
    gamesByRound.set(game.round, existing);
  }

  const rounds = Array.from(gamesByRound.keys()).sort((a, b) => a - b);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Tournament Scores</h1>
        <span className="text-xs text-muted-foreground">
          Auto-refreshes every 30s
        </span>
      </div>

      {games.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No games available yet.</p>
          <p className="text-sm mt-2">
            Games will appear here once the tournament is seeded.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Active rounds (have at least one non-final game) */}
          {rounds
            .filter((round) => {
              const rg = gamesByRound.get(round) || [];
              return rg.some((g) => g.status !== "final");
            })
            .map((round) => (
              <RoundSection key={round} round={round} games={gamesByRound.get(round) || []} />
            ))}

          {/* Completed rounds */}
          {(() => {
            const completedRounds = rounds.filter((round) => {
              const rg = gamesByRound.get(round) || [];
              return rg.length > 0 && rg.every((g) => g.status === "final");
            });
            if (completedRounds.length === 0) return null;
            return (
              <CompletedRounds
                rounds={completedRounds}
                gamesByRound={gamesByRound}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}

function GameGrid({ games }: { games: GameWithTeams[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {games.map((game) => (
        <ScoreCard
          key={game.id}
          team1Name={game.team1?.name ?? "TBD"}
          team1Abbreviation={game.team1?.abbreviation ?? "TBD"}
          team1Seed={game.team1?.seed ?? 0}
          team1Score={game.team1Score}
          team1LogoUrl={game.team1?.logoUrl}
          team2Name={game.team2?.name ?? "TBD"}
          team2Abbreviation={game.team2?.abbreviation ?? "TBD"}
          team2Seed={game.team2?.seed ?? 0}
          team2Score={game.team2Score}
          team2LogoUrl={game.team2?.logoUrl}
          status={game.status}
          startTime={game.startTime}
          venue={game.venue}
          broadcast={game.broadcast}
          winnerTeamId={game.winnerTeamId}
          team1Id={game.team1Id ?? undefined}
          team2Id={game.team2Id ?? undefined}
          spreadDetails={game.spreadDetails}
          overUnder={game.overUnder}
          statusDetail={game.statusDetail}
        />
      ))}
    </div>
  );
}

function RoundSection({ round, games }: { round: number; games: GameWithTeams[] }) {
  const liveGames = games.filter((g) => g.status === "in_progress");
  const scheduledGames = games.filter((g) => g.status === "scheduled");
  const finalGames = games.filter((g) => g.status === "final");
  const activeGames = [...liveGames, ...scheduledGames];

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 text-[#1B365D]">
        {ROUND_NAMES[round] || `Round ${round}`}
      </h2>

      {activeGames.length > 0 && <GameGrid games={activeGames} />}

      {finalGames.length > 0 && (
        <div className={activeGames.length > 0 ? "mt-6" : ""}>
          {activeGames.length > 0 && (
            <h3 className="text-sm font-medium text-[#5A7A99] mb-3 uppercase tracking-wider">
              Final
            </h3>
          )}
          <GameGrid games={finalGames} />
        </div>
      )}
    </section>
  );
}

function CompletedRounds({
  rounds,
  gamesByRound,
}: {
  rounds: number[];
  gamesByRound: Map<number, GameWithTeams[]>;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalGames = rounds.reduce(
    (sum, r) => sum + (gamesByRound.get(r)?.length || 0),
    0
  );

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-lg font-semibold text-[#5A7A99] hover:text-[#1B365D] transition-colors"
      >
        <svg
          className={`w-5 h-5 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Completed Rounds
        <span className="text-sm font-normal text-[#5A7A99]">
          ({totalGames} game{totalGames !== 1 ? "s" : ""})
        </span>
      </button>

      {expanded && (
        <div className="mt-6 space-y-10">
          {rounds.map((round) => (
            <section key={round}>
              <h3 className="text-base font-semibold mb-4 text-[#5A7A99]">
                {ROUND_NAMES[round] || `Round ${round}`}
              </h3>
              <GameGrid games={gamesByRound.get(round) || []} />
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
