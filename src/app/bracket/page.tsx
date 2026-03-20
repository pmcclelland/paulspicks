"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import BracketView from "@/components/bracket-view";

export default function BracketPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bracketData, setBracketData] = useState<{
    games: any[];
    teams: any[];
    picks: any[];
    locked: boolean;
    hasLiveGames: boolean;
    readOnly?: boolean;
    isSpectator?: boolean;
  } | null>(null);
  const [gameOdds, setGameOdds] = useState<Record<number, { team1Prob: number; team2Prob: number }> | undefined>();
  const initialPicksLoaded = useRef(false);

  const fetchBracket = useCallback(async (isRefresh = false) => {
    try {
      const res = await fetch("/api/bracket");
      if (!res.ok) {
        if (!isRefresh) {
          const data = await res.json();
          setError(data.error || "Failed to load bracket.");
        }
        return;
      }
      const data = await res.json();

      if (isRefresh && initialPicksLoaded.current) {
        // On refresh, only update games (scores/status) and teams — preserve picks
        setBracketData((prev) =>
          prev
            ? { ...prev, games: data.games, teams: data.teams, locked: data.locked, hasLiveGames: data.hasLiveGames }
            : data
        );
      } else {
        setBracketData(data);
        initialPicksLoaded.current = true;
      }
    } catch {
      if (!isRefresh) {
        setError("Failed to load bracket. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetchBracket(false);
      // Fetch simulation odds in parallel (non-blocking)
      fetch("/api/simulate")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.gameOdds) setGameOdds(data.gameOdds); })
        .catch(() => {});
    }
  }, [status, router, fetchBracket]);

  // Poll for live score updates every 30 seconds
  useEffect(() => {
    if (!bracketData) return;

    const hasActiveGames = bracketData.games.some(
      (g: any) => g.status === "in_progress" || g.status === "final"
    );

    // Poll more frequently during live games, less often otherwise
    const interval = hasActiveGames ? 30_000 : 120_000;

    const timer = setInterval(() => {
      fetchBracket(true);
    }, interval);

    return () => clearInterval(timer);
  }, [bracketData, fetchBracket]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F4793B] border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading bracket...</p>
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
              setError("");
              setLoading(true);
              fetchBracket(false);
            }}
            className="text-sm text-[#F4793B] hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!bracketData) return null;

  const isSpectator = bracketData.isSpectator || bracketData.readOnly && bracketData.picks.length === 0;

  return (
    <div className="py-6">
      {isSpectator && (
        <div className="mx-4 mb-4 rounded-lg bg-[#EFF5FA] border border-[#BFD4E4]/50 px-4 py-3 text-sm text-[#5A7A99]">
          You are in spectator mode. View other users&apos; brackets from the{" "}
          <a href="/leaderboard" className="font-medium text-[#F4793B] hover:underline">leaderboard</a>.
        </div>
      )}
      <BracketView
        games={bracketData.games}
        teams={bracketData.teams}
        initialPicks={bracketData.picks}
        locked={bracketData.locked}
        readOnly={bracketData.readOnly}
        title={isSpectator ? "Tournament Bracket" : undefined}
        gameOdds={gameOdds}
      />
    </div>
  );
}
