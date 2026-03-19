"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BracketView from "@/components/bracket-view";

export default function UserBracketPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
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
    viewingUser: { id: number; name: string } | null;
  } | null>(null);

  const fetchBracket = useCallback(async (isRefresh = false) => {
    try {
      const res = await fetch(`/api/bracket?userId=${userId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load bracket.");
        return;
      }
      const data = await res.json();

      if (isRefresh) {
        setBracketData((prev) =>
          prev
            ? { ...prev, games: data.games, teams: data.teams, locked: data.locked, hasLiveGames: data.hasLiveGames }
            : data
        );
      } else {
        setBracketData(data);
      }
    } catch {
      if (!isRefresh) {
        setError("Failed to load bracket. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      // If viewing own bracket, redirect to /bracket
      if (session?.user?.id === userId) {
        router.replace("/bracket");
        return;
      }
      fetchBracket(false);
    }
  }, [status, router, fetchBracket, session, userId]);

  // Poll for live score updates
  useEffect(() => {
    if (!bracketData) return;

    const hasActiveGames = bracketData.games.some(
      (g: any) => g.status === "in_progress" || g.status === "final"
    );

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
          <Link
            href="/leaderboard"
            className="text-sm text-[#F4793B] hover:underline"
          >
            Back to Leaderboard
          </Link>
        </div>
      </div>
    );
  }

  if (!bracketData) return null;

  const userName = bracketData.viewingUser?.name || "User";

  return (
    <div className="py-6">
      <div className="px-4 mb-4">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1 text-sm text-[#5A7A99] hover:text-[#F4793B] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Leaderboard
        </Link>
      </div>
      <BracketView
        games={bracketData.games}
        teams={bracketData.teams}
        initialPicks={bracketData.picks}
        locked={true}
        readOnly={true}
        title={`${userName}'s Bracket`}
      />
    </div>
  );
}
