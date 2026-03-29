"use client";

import { useState } from "react";
import { schoolName } from "@/lib/school-names";

type TeamInfo = {
  name: string;
  abbreviation: string;
  seed: number;
  logoUrl: string | null;
};

type UserImpact = {
  name: string;
  points: number;
};

type Outcome = {
  gameId: number;
  round: number;
  roundName: string;
  pointsAvailable: number;
  neededWinner: TeamInfo;
  opponent: TeamInfo | null;
  type: "win" | "lose";
  gameStatus: string;
  usersGaining: UserImpact[];
  usersLosing: UserImpact[];
};

type PathToVictoryEntry = {
  userId: number;
  name: string;
  currentPoints: number;
  currentRank: number;
  bestCasePoints: number;
  bestCaseRank: number;
  worstCaseRank: number;
  canStillWin: boolean;
  championPick: TeamInfo | null;
  outcomes: Outcome[];
  totalPointsRemaining: number;
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatNames(users: UserImpact[], limit = 3): string {
  if (users.length === 0) return "";
  const names = users.map((u) => u.name);
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} +${names.length - limit} more`;
}

export default function PathToVictory({
  entries,
}: {
  entries: PathToVictoryEntry[];
}) {
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const COLLAPSED_LIMIT = 6;

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1B365D]">Path to Victory</h2>
      <p className="text-sm text-[#5A7A99] -mt-2">
        What needs to happen for each bracket to win. Shows which game outcomes
        each bracket needs and how they impact other brackets.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {entries.map((entry) => {
          const isExpanded = expandedUserId === entry.userId;
          const winOutcomes = entry.outcomes.filter((o) => o.type === "win");
          const loseOutcomes = entry.outcomes.filter((o) => o.type === "lose");
          const allOutcomes = [...winOutcomes, ...loseOutcomes];
          const hasMore = allOutcomes.length > COLLAPSED_LIMIT;
          const visibleOutcomes = isExpanded
            ? allOutcomes
            : allOutcomes.slice(0, COLLAPSED_LIMIT);

          const visibleWins = visibleOutcomes.filter((o) => o.type === "win");
          const visibleLoses = visibleOutcomes.filter((o) => o.type === "lose");

          return (
            <div
              key={entry.userId}
              className={`bg-white rounded-xl border border-[#BFD4E4]/50 p-5 ${
                !entry.canStillWin ? "opacity-60" : ""
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-[#5A7A99]">
                    #{entry.currentRank}
                  </span>
                  <span className="text-sm font-bold text-[#1B365D] truncate">
                    {entry.name}
                  </span>
                </div>
                <span
                  className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    entry.canStillWin
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {entry.canStillWin ? "Can win" : "Eliminated"}
                </span>
              </div>

              {/* Stats */}
              <div className="text-xs text-[#5A7A99] mb-1">
                {entry.currentPoints} pts &middot; Best:{" "}
                {ordinal(entry.bestCaseRank)} ({entry.bestCasePoints} pts)
                &middot; Worst: {ordinal(entry.worstCaseRank)}
              </div>

              {/* Champion pick */}
              {entry.championPick && (
                <div className="flex items-center gap-1.5 mb-3">
                  {entry.championPick.logoUrl && (
                    <img
                      src={entry.championPick.logoUrl}
                      alt={entry.championPick.abbreviation}
                      className="w-4 h-4 object-contain"
                    />
                  )}
                  <span className="text-xs text-[#5A7A99]">
                    Champion: ({entry.championPick.seed}){" "}
                    {schoolName(entry.championPick.name)}
                  </span>
                </div>
              )}

              {allOutcomes.length > 0 ? (
                <div className="space-y-3">
                  {/* Needs to win — games where this bracket has a pick */}
                  {visibleWins.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                        Needs to win
                      </div>
                      {visibleWins.map((outcome) => (
                        <OutcomeRow
                          key={outcome.gameId}
                          outcome={outcome}
                          userName={entry.name}
                        />
                      ))}
                    </div>
                  )}

                  {/* Needs to lose — games where competitors have picks that must fail */}
                  {visibleLoses.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                        Needs others to lose
                      </div>
                      {visibleLoses.map((outcome) => (
                        <OutcomeRow
                          key={outcome.gameId}
                          outcome={outcome}
                          userName={entry.name}
                        />
                      ))}
                    </div>
                  )}

                  {hasMore && (
                    <button
                      onClick={() =>
                        setExpandedUserId(isExpanded ? null : entry.userId)
                      }
                      className="text-xs text-[#F4793B] font-medium hover:underline"
                    >
                      {isExpanded
                        ? "Show less"
                        : `Show ${allOutcomes.length - COLLAPSED_LIMIT} more`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#5A7A99] italic">
                  No remaining games to track
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OutcomeRow({
  outcome,
  userName,
}: {
  outcome: Outcome;
  userName: string;
}) {
  return (
    <div
      className={`rounded-lg bg-[#F8FAFC] p-2.5 ${
        outcome.gameStatus === "in_progress"
          ? "border-l-2 border-l-[#F4793B]"
          : ""
      }`}
    >
      {/* Matchup line */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {outcome.neededWinner.logoUrl && (
            <img
              src={outcome.neededWinner.logoUrl}
              alt={outcome.neededWinner.abbreviation}
              className="w-5 h-5 flex-shrink-0 object-contain"
            />
          )}
          <span className="text-sm text-[#1B365D] truncate">
            <span className="font-medium">
              ({outcome.neededWinner.seed}){" "}
              {schoolName(outcome.neededWinner.name)}
            </span>
            {outcome.opponent ? (
              <span className="text-[#5A7A99]">
                {" "}
                over ({outcome.opponent.seed}){" "}
                {schoolName(outcome.opponent.name)}
              </span>
            ) : (
              <span className="text-[#5A7A99]"> vs TBD</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {outcome.gameStatus === "in_progress" && (
            <span className="inline-flex items-center rounded-full bg-[#F4793B]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#F4793B] uppercase">
              Live
            </span>
          )}
          <span className="text-xs text-[#5A7A99] whitespace-nowrap">
            {outcome.roundName}
          </span>
          <span className="text-xs font-medium text-[#1B365D] whitespace-nowrap">
            +{outcome.pointsAvailable}
          </span>
        </div>
      </div>

      {/* Cross-bracket impact */}
      <div className="text-[11px] mt-1.5 ml-7 space-y-0.5">
        {outcome.type === "win" ? (
          <>
            {/* This user gains points */}
            <div className="text-green-600">
              +{outcome.pointsAvailable} for {userName}
              {outcome.usersGaining.length > 0 && (
                <>, {formatNames(outcome.usersGaining)}</>
              )}
            </div>
            {/* Competitors lose out */}
            {outcome.usersLosing.length > 0 && (
              <div className="text-red-500">
                Denies {outcome.pointsAvailable} pts from{" "}
                {formatNames(outcome.usersLosing)}
              </div>
            )}
          </>
        ) : (
          <>
            {/* No gain for this user — it's about hurting competitors */}
            {outcome.usersLosing.length > 0 && (
              <div className="text-red-500">
                Denies {outcome.pointsAvailable} pts from{" "}
                {formatNames(outcome.usersLosing)}
              </div>
            )}
            {outcome.usersGaining.length > 0 && (
              <div className="text-[#5A7A99]">
                Would give {outcome.pointsAvailable} pts to{" "}
                {formatNames(outcome.usersGaining)} instead
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
