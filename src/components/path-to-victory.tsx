"use client";

import { useState } from "react";
import { schoolName } from "@/lib/school-names";

type TeamInfo = {
  name: string;
  abbreviation: string;
  seed: number;
  logoUrl: string | null;
};

type NeededOutcome = {
  gameId: number;
  round: number;
  roundName: string;
  pointsAvailable: number;
  pickedTeam: TeamInfo;
  opponent: TeamInfo | null;
  othersAgree: number;
  othersDisagree: number;
  gameStatus: string;
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
  neededOutcomes: NeededOutcome[];
  totalPointsRemaining: number;
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function PathToVictory({
  entries,
}: {
  entries: PathToVictoryEntry[];
}) {
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const COLLAPSED_LIMIT = 5;

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1B365D]">Path to Victory</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {entries.map((entry) => {
          const isExpanded = expandedUserId === entry.userId;
          const hasMore = entry.neededOutcomes.length > COLLAPSED_LIMIT;
          const visibleOutcomes = isExpanded
            ? entry.neededOutcomes
            : entry.neededOutcomes.slice(0, COLLAPSED_LIMIT);

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

              {/* Stats line */}
              <div className="text-xs text-[#5A7A99] mb-2">
                {entry.currentPoints} pts &middot; Best:{" "}
                {ordinal(entry.bestCaseRank)} &middot; Worst:{" "}
                {ordinal(entry.worstCaseRank)}
                {entry.totalPointsRemaining > 0 && (
                  <> &middot; {entry.totalPointsRemaining} pts remaining</>
                )}
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

              {/* Needed outcomes */}
              {visibleOutcomes.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#1B365D] uppercase tracking-wide">
                    Needs to happen
                  </div>
                  {visibleOutcomes.map((outcome) => (
                    <div
                      key={`${outcome.gameId}-${outcome.pickedTeam.abbreviation}`}
                      className={`rounded-lg bg-[#F8FAFC] p-2.5 ${
                        outcome.gameStatus === "in_progress"
                          ? "border-l-2 border-l-[#F4793B]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {outcome.pickedTeam.logoUrl && (
                            <img
                              src={outcome.pickedTeam.logoUrl}
                              alt={outcome.pickedTeam.abbreviation}
                              className="w-5 h-5 flex-shrink-0 object-contain"
                            />
                          )}
                          <span className="text-sm text-[#1B365D] truncate">
                            <span className="font-medium">
                              ({outcome.pickedTeam.seed}){" "}
                              {schoolName(outcome.pickedTeam.name)}
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
                      <div className="text-[11px] text-[#5A7A99] mt-1 ml-7">
                        {outcome.othersDisagree > 0 ? (
                          <>
                            <span className="text-[#F4793B] font-medium">
                              {outcome.othersDisagree}
                            </span>{" "}
                            {outcome.othersDisagree === 1
                              ? "bracket disagrees"
                              : "brackets disagree"}
                          </>
                        ) : (
                          <span>Everyone agrees</span>
                        )}
                        {outcome.othersAgree > 0 && (
                          <>
                            {" "}
                            &middot; {outcome.othersAgree}{" "}
                            {outcome.othersAgree === 1 ? "agrees" : "agree"}
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {hasMore && (
                    <button
                      onClick={() =>
                        setExpandedUserId(isExpanded ? null : entry.userId)
                      }
                      className="text-xs text-[#F4793B] font-medium hover:underline mt-1"
                    >
                      {isExpanded
                        ? "Show less"
                        : `Show ${entry.neededOutcomes.length - COLLAPSED_LIMIT} more`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#5A7A99] italic">
                  No remaining picks
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
