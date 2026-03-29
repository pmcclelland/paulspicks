"use client";

import { useEffect, useState } from "react";
import LeaderboardTable from "@/components/leaderboard-table";
import PathToVictory from "@/components/path-to-victory";
import UniquePicks from "@/components/unique-picks";
import Badges from "@/components/badges";
import { SocialBuzz } from "@/components/social-buzz";

type ChampionPick = {
  teamName: string;
  abbreviation: string;
  seed: number;
  logoUrl: string | null;
};

type LeaderboardEntry = {
  rank: number;
  userId: number;
  name: string;
  totalPoints: number;
  roundPoints: [number, number, number, number, number, number];
  maxPossible?: number;
  pointsRemaining?: number;
  championPick?: ChampionPick | null;
};

type UniquePick = {
  userName: string;
  userId: number;
  teamName: string;
  teamAbbreviation: string;
  teamSeed: number;
  teamLogoUrl: string | null;
  round: number;
  roundName: string;
  pickCount: number;
  totalUsers: number;
  isCorrect: number | null;
  gameStatus: string;
};

type Badge = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  userId: number | null;
  userName: string | null;
  stat: string;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [uniquePicks, setUniquePicks] = useState<UniquePick[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [pathToVictory, setPathToVictory] = useState<any[]>([]);
  const [simBracketUserId, setSimBracketUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchAll() {
      try {
        const [leaderboardRes, uniqueRes, badgesRes, pathRes] = await Promise.all([
          fetch("/api/leaderboard"),
          fetch("/api/leaderboard/unique-picks"),
          fetch("/api/leaderboard/badges"),
          fetch("/api/leaderboard/path-to-victory"),
        ]);

        if (!leaderboardRes.ok) {
          setError("Failed to load leaderboard.");
          return;
        }

        const leaderboardData = await leaderboardRes.json();
        // Support both old (array) and new (object with leaderboard + simBracketUserId) formats
        const leaderboardArray = Array.isArray(leaderboardData)
          ? leaderboardData
          : leaderboardData.leaderboard ?? [];
        if (leaderboardData.simBracketUserId) {
          setSimBracketUserId(leaderboardData.simBracketUserId);
        }
        const mapped = leaderboardArray.map(
          (entry: any) => ({
            ...entry,
            roundPoints: entry.roundBreakdown || [0, 0, 0, 0, 0, 0],
          })
        );
        setEntries(mapped);

        if (uniqueRes.ok) {
          const uniqueData = await uniqueRes.json();
          setUniquePicks(Array.isArray(uniqueData) ? uniqueData : []);
        }

        if (badgesRes.ok) {
          const badgesData = await badgesRes.json();
          setBadges(Array.isArray(badgesData) ? badgesData : []);
        }

        if (pathRes.ok) {
          const pathData = await pathRes.json();
          setPathToVictory(pathData.entries ?? []);
        }
      } catch {
        setError("Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
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
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-10">
      <h1 className="text-2xl font-bold">Leaderboard</h1>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No entries yet.</p>
          <p className="text-sm mt-2">
            The leaderboard will populate once users submit brackets and games
            are played.
          </p>
        </div>
      ) : (
        <LeaderboardTable entries={entries} badges={badges} simBracketUserId={simBracketUserId} />
      )}

      {pathToVictory.length > 0 && <PathToVictory entries={pathToVictory} />}

      {uniquePicks.length > 0 && <UniquePicks picks={uniquePicks} />}

      {badges.length > 0 && <Badges badges={badges} />}

      <section>
        <h2 className="text-lg font-semibold mb-4 text-[#1B365D]">
          Tournament Buzz
        </h2>
        <SocialBuzz />
      </section>
    </div>
  );
}
