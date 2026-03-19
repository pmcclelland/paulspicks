"use client";

import { schoolName } from "@/lib/school-names";

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

export default function UniquePicks({ picks }: { picks: UniquePick[] }) {
  if (picks.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1B365D]">Most Unique Picks</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {picks.map((pick, i) => (
          <div
            key={`${pick.userId}-${pick.teamAbbreviation}-${pick.round}`}
            className="bg-white rounded-xl border border-[#BFD4E4]/50 p-4 flex items-start gap-3"
          >
            {pick.teamLogoUrl && (
              <img
                src={pick.teamLogoUrl}
                alt={pick.teamAbbreviation}
                className="w-10 h-10 flex-shrink-0 object-contain"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#1B365D] truncate">
                  ({pick.teamSeed}) {schoolName(pick.teamName)}
                </span>
                {pick.gameStatus === "final" && (
                  <span className="flex-shrink-0">
                    {pick.isCorrect === 1 ? (
                      <span className="text-green-600 text-sm">&#10003;</span>
                    ) : (
                      <span className="text-red-500 text-sm">&#10007;</span>
                    )}
                  </span>
                )}
              </div>
              <div className="text-xs text-[#5A7A99] mt-0.5">
                {pick.roundName} &middot; picked by {pick.userName}
              </div>
              <div className="mt-1.5">
                <span className="inline-flex items-center rounded-full bg-[#EFF5FA] px-2 py-0.5 text-xs font-medium text-[#1B365D]">
                  {pick.pickCount === 1
                    ? "Only pick"
                    : `${pick.pickCount} of ${pick.totalUsers} users`}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
