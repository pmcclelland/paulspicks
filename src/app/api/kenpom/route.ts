import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kenpomRankings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const team1 = request.nextUrl.searchParams.get("team1");
  const team2 = request.nextUrl.searchParams.get("team2");

  if (!team1 && !team2) {
    return NextResponse.json({ error: "team1 or team2 required" }, { status: 400 });
  }

  const all = await db.select().from(kenpomRankings);

  function find(name: string) {
    const lower = name.toLowerCase();
    return all.find(
      (k) =>
        k.teamName.toLowerCase() === lower ||
        lower.includes(k.teamName.toLowerCase()) ||
        k.teamName.toLowerCase().includes(lower)
    ) ?? null;
  }

  return NextResponse.json({
    team1: team1 ? find(team1) : null,
    team2: team2 ? find(team2) : null,
  });
}
