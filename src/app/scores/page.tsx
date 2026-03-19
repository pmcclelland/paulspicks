"use client";

import { useEffect, useState, useCallback } from "react";
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
          {rounds.map((round) => {
            const roundGames = gamesByRound.get(round) || [];
            return (
              <section key={round}>
                <h2 className="text-lg font-semibold mb-4 text-[#1B365D]">
                  {ROUND_NAMES[round] || `Round ${round}`}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {roundGames.map((game) => (
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
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
