"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUND_NAMES } from "@/lib/bracket-utils";
import type { SimulationResult, MustHaveResult } from "@/lib/simulation";

export default function SimulationView() {
  const { data: session } = useSession();
  const [data, setData] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [fetched, setFetched] = useState(false);

  const currentUserId = session?.user?.id
    ? parseInt(session.user.id, 10)
    : null;

  const fetchSimulation = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/leaderboard/simulation");
      if (!res.ok) {
        setError("Failed to load simulation.");
        return;
      }
      const result = await res.json();
      setData(result);
    } catch {
      setError("Failed to load simulation.");
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  useEffect(() => {
    if (!fetched) {
      fetchSimulation();
    }
  }, [fetched, fetchSimulation]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F4793B] border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Running simulation...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={fetchSimulation}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  if (!data.available) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg">{data.reason}</p>
        <p className="text-sm mt-2">
          Check back once more games have been played.
        </p>
      </div>
    );
  }

  if (data.results.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg">No entries yet.</p>
        <p className="text-sm mt-2">
          The simulation will populate once users submit brackets and games are
          played.
        </p>
      </div>
    );
  }

  const remainingCount = data.remainingGames.length;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary">
            {remainingCount} game{remainingCount !== 1 ? "s" : ""} remaining
          </Badge>
          <Badge variant="outline">
            {data.totalScenarios.toLocaleString()} scenarios
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSimulation}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Desktop view */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="w-[200px]">Win Probability</TableHead>
              <TableHead className="text-right">Best</TableHead>
              <TableHead className="text-right">Worst</TableHead>
              <TableHead className="text-right">Scenarios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.results.map((entry, idx) => {
              const isCurrentUser = currentUserId === entry.userId;
              const isExpanded = expandedUser === entry.userId;

              return (
                <>
                  <TableRow
                    key={entry.userId}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      isCurrentUser
                        ? "bg-[#1B365D]/5 border-l-2 border-l-[#F4793B] font-medium"
                        : ""
                    } ${entry.winProbability === 0 ? "opacity-50" : ""}`}
                    onClick={() =>
                      setExpandedUser(isExpanded ? null : entry.userId)
                    }
                  >
                    <TableCell className="font-mono">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{entry.name}</span>
                        {isCurrentUser && (
                          <span className="text-xs text-[#F4793B]">(you)</span>
                        )}
                        {entry.winProbability > 0 &&
                          entry.mustHaveResults.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {entry.currentPoints}
                    </TableCell>
                    <TableCell>
                      <WinProbabilityBar probability={entry.winProbability} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {entry.bestCase}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {entry.worstCase}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {entry.winScenarios}/{data.totalScenarios}
                    </TableCell>
                  </TableRow>
                  {isExpanded && entry.mustHaveResults.length > 0 && (
                    <TableRow key={`${entry.userId}-expanded`}>
                      <TableCell colSpan={7} className="bg-muted/30 p-4">
                        <MustHaveResultsPanel results={entry.mustHaveResults} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile view */}
      <div className="md:hidden space-y-3">
        {data.results.map((entry, idx) => {
          const isCurrentUser = currentUserId === entry.userId;
          const isExpanded = expandedUser === entry.userId;

          return (
            <div
              key={entry.userId}
              className={`rounded-lg border p-3 ${
                isCurrentUser ? "border-[#F4793B]/50 bg-[#1B365D]/5" : ""
              } ${entry.winProbability === 0 ? "opacity-50" : ""}`}
              onClick={() =>
                setExpandedUser(isExpanded ? null : entry.userId)
              }
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className="font-medium">
                    {entry.name}
                    {isCurrentUser && (
                      <span className="ml-1 text-xs text-[#F4793B]">
                        (you)
                      </span>
                    )}
                  </span>
                </div>
                <span className="font-bold">{entry.currentPoints} pts</span>
              </div>
              <WinProbabilityBar probability={entry.winProbability} />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>Best: {entry.bestCase}</span>
                <span>Worst: {entry.worstCase}</span>
                <span>
                  {entry.winScenarios}/{data.totalScenarios} wins
                </span>
              </div>
              {isExpanded && entry.mustHaveResults.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <MustHaveResultsPanel results={entry.mustHaveResults} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WinProbabilityBar({ probability }: { probability: number }) {
  const pct = (probability * 100).toFixed(1);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-[#F4793B] rounded-full transition-all duration-500"
          style={{ width: `${Math.max(probability * 100, probability > 0 ? 2 : 0)}%` }}
        />
      </div>
      <span className="text-sm font-mono w-14 text-right">{pct}%</span>
    </div>
  );
}

function MustHaveResultsPanel({ results }: { results: MustHaveResult[] }) {
  // Group by round
  const byRound = new Map<number, MustHaveResult[]>();
  for (const r of results) {
    const existing = byRound.get(r.round) || [];
    existing.push(r);
    byRound.set(r.round, existing);
  }

  const sortedRounds = Array.from(byRound.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Must happen to win
      </p>
      {sortedRounds.map((round) => (
        <div key={round} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {ROUND_NAMES[round] || `Round ${round}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {byRound.get(round)!.map((r) => (
              <Badge
                key={r.gameId}
                variant="outline"
                className="text-xs py-1 px-2"
              >
                <span className="font-semibold">
                  ({r.neededWinner.seed}) {r.neededWinner.name}
                </span>
                {r.opponent && (
                  <span className="text-muted-foreground ml-1">
                    over ({r.opponent.seed}) {r.opponent.name}
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
