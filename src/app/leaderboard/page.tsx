"use client";

import { useEffect, useState } from "react";
import LeaderboardTable from "@/components/leaderboard-table";

type LeaderboardEntry = {
  rank: number;
  userId: number;
  name: string;
  totalPoints: number;
  roundPoints: [number, number, number, number, number, number];
  maxPossible?: number;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/leaderboard");
        if (!res.ok) {
          setError("Failed to load leaderboard.");
          return;
        }
        const data = await res.json();
        // API returns array with roundBreakdown field
        const mapped = (Array.isArray(data) ? data : []).map((entry: any) => ({
          ...entry,
          roundPoints: entry.roundBreakdown || [0, 0, 0, 0, 0, 0],
        }));
        setEntries(mapped);
      } catch {
        setError("Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F4793B] border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading leaderboard...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Leaderboard</h1>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No entries yet.</p>
          <p className="text-sm mt-2">
            The leaderboard will populate once users submit brackets and games
            are played.
          </p>
        </div>
      ) : (
        <LeaderboardTable entries={entries} />
      )}
    </div>
  );
}
