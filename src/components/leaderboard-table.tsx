"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BadgeIcons } from "@/components/badges";
import { schoolName } from "@/lib/school-names";

type ChampionPick = {
  teamName: string;
  abbreviation: string;
  seed: number;
  logoUrl: string | null;
  isEliminated?: boolean;
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

type SortField = "rank" | "totalPoints" | "r1" | "r2" | "r3" | "r4" | "r5" | "r6" | "pointsRemaining";

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
  badges?: Badge[];
  simBracketUserId?: number | null;
};

/** Cracked glass SVG overlay for eliminated champion picks */
function CrackedGlassOverlay({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      viewBox="0 0 120 32"
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Impact point slightly left-of-center, radiating fracture lines */}
      {/* Primary fractures — bold, sharp */}
      <line x1="38" y1="16" x2="8" y2="3" stroke="rgba(220,38,38,0.35)" strokeWidth="0.8" />
      <line x1="38" y1="16" x2="2" y2="20" stroke="rgba(220,38,38,0.3)" strokeWidth="0.6" />
      <line x1="38" y1="16" x2="22" y2="30" stroke="rgba(220,38,38,0.35)" strokeWidth="0.7" />
      <line x1="38" y1="16" x2="70" y2="4" stroke="rgba(220,38,38,0.4)" strokeWidth="0.8" />
      <line x1="38" y1="16" x2="95" y2="12" stroke="rgba(220,38,38,0.3)" strokeWidth="0.7" />
      <line x1="38" y1="16" x2="80" y2="28" stroke="rgba(220,38,38,0.35)" strokeWidth="0.6" />
      <line x1="38" y1="16" x2="110" y2="25" stroke="rgba(220,38,38,0.25)" strokeWidth="0.5" />

      {/* Secondary fractures — thinner branches off primary lines */}
      <line x1="20" y1="8" x2="12" y2="14" stroke="rgba(220,38,38,0.2)" strokeWidth="0.5" />
      <line x1="55" y1="10" x2="62" y2="2" stroke="rgba(220,38,38,0.2)" strokeWidth="0.4" />
      <line x1="55" y1="10" x2="48" y2="1" stroke="rgba(220,38,38,0.18)" strokeWidth="0.4" />
      <line x1="60" y1="22" x2="68" y2="31" stroke="rgba(220,38,38,0.2)" strokeWidth="0.4" />
      <line x1="60" y1="22" x2="52" y2="30" stroke="rgba(220,38,38,0.18)" strokeWidth="0.4" />
      <line x1="75" y1="8" x2="85" y2="2" stroke="rgba(220,38,38,0.15)" strokeWidth="0.4" />
      <line x1="28" y1="24" x2="15" y2="28" stroke="rgba(220,38,38,0.18)" strokeWidth="0.4" />

      {/* Concentric stress rings around impact — the "spider web" effect */}
      <path d="M30 10 Q35 8 42 10" stroke="rgba(220,38,38,0.2)" strokeWidth="0.4" />
      <path d="M30 22 Q36 25 44 22" stroke="rgba(220,38,38,0.2)" strokeWidth="0.4" />
      <path d="M22 6 Q38 2 56 8" stroke="rgba(220,38,38,0.12)" strokeWidth="0.3" />
      <path d="M20 26 Q38 32 58 24" stroke="rgba(220,38,38,0.12)" strokeWidth="0.3" />

      {/* Impact point — small shatter */}
      <circle cx="38" cy="16" r="2.5" stroke="rgba(220,38,38,0.3)" strokeWidth="0.5" fill="rgba(220,38,38,0.06)" />
      <circle cx="38" cy="16" r="0.8" fill="rgba(220,38,38,0.25)" />
    </svg>
  );
}

function RobotIcon() {
  return (
    <svg className="w-4 h-4 text-[#5A7A99]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <circle cx="9" cy="14" r="1.5" fill="currentColor" />
      <circle cx="15" cy="14" r="1.5" fill="currentColor" />
      <path d="M9 18h6" />
      <path d="M2 12v4" />
      <path d="M22 12v4" />
    </svg>
  );
}

export default function LeaderboardTable({ entries, badges = [], simBracketUserId }: LeaderboardTableProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const currentUserId = session?.user?.id
    ? parseInt(session.user.id, 10)
    : null;

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "rank");
    }
  }

  function handleRowClick(userId: number) {
    if (currentUserId === userId) {
      router.push("/bracket");
    } else {
      router.push(`/bracket/${userId}`);
    }
  }

  const sorted = [...entries].sort((a, b) => {
    let aVal: number, bVal: number;
    switch (sortField) {
      case "rank":
        aVal = a.rank;
        bVal = b.rank;
        break;
      case "totalPoints":
        aVal = a.totalPoints;
        bVal = b.totalPoints;
        break;
      case "r1":
        aVal = a.roundPoints[0];
        bVal = b.roundPoints[0];
        break;
      case "r2":
        aVal = a.roundPoints[1];
        bVal = b.roundPoints[1];
        break;
      case "r3":
        aVal = a.roundPoints[2];
        bVal = b.roundPoints[2];
        break;
      case "r4":
        aVal = a.roundPoints[3];
        bVal = b.roundPoints[3];
        break;
      case "r5":
        aVal = a.roundPoints[4];
        bVal = b.roundPoints[4];
        break;
      case "r6":
        aVal = a.roundPoints[5];
        bVal = b.roundPoints[5];
        break;
      case "pointsRemaining":
        aVal = a.pointsRemaining ?? 0;
        bVal = b.pointsRemaining ?? 0;
        break;
      default:
        aVal = a.rank;
        bVal = b.rank;
    }
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortAsc ? " \u2191" : " \u2193";
  };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none w-16"
                onClick={() => handleSort("rank")}
              >
                Rank{sortIcon("rank")}
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-36">Champion</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("totalPoints")}
              >
                Total{sortIcon("totalPoints")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("r1")}
              >
                R1{sortIcon("r1")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("r2")}
              >
                R2{sortIcon("r2")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("r3")}
              >
                S16{sortIcon("r3")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("r4")}
              >
                E8{sortIcon("r4")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("r5")}
              >
                F4{sortIcon("r5")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("r6")}
              >
                Champ{sortIcon("r6")}
              </TableHead>
              {entries.some((e) => e.pointsRemaining !== undefined) && (
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => handleSort("pointsRemaining")}
                >
                  Rem{sortIcon("pointsRemaining")}
                </TableHead>
              )}
              {entries.some((e) => e.maxPossible !== undefined) && (
                <TableHead className="text-right">Max</TableHead>
              )}
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => {
              const isCurrentUser = currentUserId === entry.userId;
              const isSimBracket = simBracketUserId != null && entry.userId === simBracketUserId;
              return (
                <TableRow
                  key={entry.userId}
                  className={`group cursor-pointer transition-colors hover:bg-[#EFF5FA] ${
                    isCurrentUser
                      ? "bg-[#1B365D]/5 border-l-2 border-l-[#F4793B] font-medium"
                      : isSimBracket
                        ? "bg-[#1B365D]/[0.03]"
                        : ""
                  }`}
                  onClick={() => isSimBracket ? router.push("/sim-bracket") : handleRowClick(entry.userId)}
                >
                  <TableCell className="font-mono">{entry.rank}</TableCell>
                  <TableCell>
                    <span className="flex items-center">
                      {isSimBracket && (
                        <span className="mr-1.5 flex-shrink-0"><RobotIcon /></span>
                      )}
                      <span className="text-[#1B365D] group-hover:text-[#F4793B] group-hover:underline transition-colors">
                        {entry.name}
                      </span>
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-[#F4793B]">(you)</span>
                      )}
                      {badges.length > 0 && (
                        <BadgeIcons badges={badges} userId={entry.userId} />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {entry.championPick ? (
                      <div className="relative flex items-center gap-1.5">
                        {entry.championPick.logoUrl && (
                          <img
                            src={entry.championPick.logoUrl}
                            alt={entry.championPick.abbreviation}
                            className={`w-5 h-5 object-contain ${entry.championPick.isEliminated ? "grayscale opacity-60" : ""}`}
                          />
                        )}
                        <span className={`text-xs ${entry.championPick.isEliminated ? "text-[#5A7A99]/60" : "text-[#5A7A99]"}`}>
                          {entry.championPick.abbreviation}
                        </span>
                        {entry.championPick.isEliminated && <CrackedGlassOverlay />}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {entry.totalPoints}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.roundPoints[0]}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.roundPoints[1]}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.roundPoints[2]}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.roundPoints[3]}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.roundPoints[4]}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.roundPoints[5]}
                  </TableCell>
                  {entries.some((e) => e.pointsRemaining !== undefined) && (
                    <TableCell className="text-right text-muted-foreground">
                      {entry.pointsRemaining ?? "-"}
                    </TableCell>
                  )}
                  {entries.some((e) => e.maxPossible !== undefined) && (
                    <TableCell className="text-right text-muted-foreground">
                      {entry.maxPossible ?? "-"}
                    </TableCell>
                  )}
                  <TableCell>
                    <svg
                      className="w-4 h-4 text-[#BFD4E4] group-hover:text-[#F4793B] transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile table */}
      <div className="md:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rank</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="w-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => {
              const isCurrentUser = currentUserId === entry.userId;
              const isSimBracket = simBracketUserId != null && entry.userId === simBracketUserId;
              return (
                <TableRow
                  key={entry.userId}
                  className={`group cursor-pointer transition-colors hover:bg-[#EFF5FA] ${
                    isCurrentUser
                      ? "bg-[#1B365D]/5 border-l-2 border-l-[#F4793B] font-medium"
                      : isSimBracket
                        ? "bg-[#1B365D]/[0.03]"
                        : ""
                  }`}
                  onClick={() => isSimBracket ? router.push("/sim-bracket") : handleRowClick(entry.userId)}
                >
                  <TableCell className="font-mono">{entry.rank}</TableCell>
                  <TableCell>
                    <div>
                      <span className="flex items-center">
                        {isSimBracket && (
                          <span className="mr-1 flex-shrink-0"><RobotIcon /></span>
                        )}
                        <span className="text-[#1B365D] group-hover:text-[#F4793B] group-hover:underline transition-colors">
                          {entry.name}
                        </span>
                        {isCurrentUser && (
                          <span className="ml-1 text-xs text-[#F4793B]">(you)</span>
                        )}
                        {badges.length > 0 && (
                          <BadgeIcons badges={badges} userId={entry.userId} />
                        )}
                      </span>
                      {entry.championPick && (
                        <div className="relative flex items-center gap-1 mt-0.5">
                          {entry.championPick.logoUrl && (
                            <img
                              src={entry.championPick.logoUrl}
                              alt={entry.championPick.abbreviation}
                              className={`w-4 h-4 object-contain ${entry.championPick.isEliminated ? "grayscale opacity-60" : ""}`}
                            />
                          )}
                          <span className={`text-[10px] ${entry.championPick.isEliminated ? "text-[#5A7A99]/60" : "text-[#5A7A99]"}`}>
                            {entry.championPick.abbreviation}
                          </span>
                          {entry.championPick.isEliminated && <CrackedGlassOverlay />}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {entry.totalPoints}
                  </TableCell>
                  <TableCell>
                    <svg
                      className="w-4 h-4 text-[#BFD4E4] group-hover:text-[#F4793B] transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
