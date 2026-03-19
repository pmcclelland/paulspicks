"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LeaderboardEntry = {
  rank: number;
  userId: number;
  name: string;
  totalPoints: number;
  roundPoints: [number, number, number, number, number, number];
  maxPossible?: number;
};

type SortField = "rank" | "totalPoints" | "r1" | "r2" | "r3" | "r4" | "r5" | "r6";

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
};

export default function LeaderboardTable({ entries }: LeaderboardTableProps) {
  const { data: session } = useSession();
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
              {entries.some((e) => e.maxPossible !== undefined) && (
                <TableHead className="text-right">Max</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => {
              const isCurrentUser = currentUserId === entry.userId;
              return (
                <TableRow
                  key={entry.userId}
                  className={
                    isCurrentUser
                      ? "bg-[#1B365D]/5 border-l-2 border-l-[#F4793B] font-medium"
                      : ""
                  }
                >
                  <TableCell className="font-mono">{entry.rank}</TableCell>
                  <TableCell>
                    {entry.name}
                    {isCurrentUser && (
                      <span className="ml-2 text-xs text-[#F4793B]">(you)</span>
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
                  {entries.some((e) => e.maxPossible !== undefined) && (
                    <TableCell className="text-right text-muted-foreground">
                      {entry.maxPossible ?? "-"}
                    </TableCell>
                  )}
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => {
              const isCurrentUser = currentUserId === entry.userId;
              return (
                <TableRow
                  key={entry.userId}
                  className={
                    isCurrentUser
                      ? "bg-[#1B365D]/5 border-l-2 border-l-[#F4793B] font-medium"
                      : ""
                  }
                >
                  <TableCell className="font-mono">{entry.rank}</TableCell>
                  <TableCell>
                    {entry.name}
                    {isCurrentUser && (
                      <span className="ml-1 text-xs text-[#F4793B]">(you)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {entry.totalPoints}
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
