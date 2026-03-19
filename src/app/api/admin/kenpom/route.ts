import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { kenpomRankings } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const teams: Array<{
      rank: number;
      teamName: string;
      seed: number | null;
      conf: string;
      record: string;
      adjEM: number;
      adjO: number;
      adjORank: number;
      adjD: number;
      adjDRank: number;
      adjT: number;
      adjTRank: number;
      luck: number;
      luckRank: number;
      sosEM: number;
      sosEMRank: number;
      sosO: number;
      sosORank: number;
      sosD: number;
      sosDRank: number;
      ncsos: number;
      ncsosRank: number;
    }> = body.teams;

    if (!Array.isArray(teams) || teams.length === 0) {
      return NextResponse.json({ error: "No team data provided" }, { status: 400 });
    }

    // Clear existing data and insert fresh
    await db.delete(kenpomRankings);

    const now = new Date().toISOString();

    for (const t of teams) {
      await db.insert(kenpomRankings).values({
        teamName: t.teamName,
        rank: t.rank,
        seed: t.seed,
        conference: t.conf,
        record: t.record,
        adjEM: String(t.adjEM),
        adjO: String(t.adjO),
        adjORank: t.adjORank,
        adjD: String(t.adjD),
        adjDRank: t.adjDRank,
        adjT: String(t.adjT),
        adjTRank: t.adjTRank,
        luck: String(t.luck),
        luckRank: t.luckRank,
        sosEM: String(t.sosEM),
        sosEMRank: t.sosEMRank,
        sosO: String(t.sosO),
        sosORank: t.sosORank,
        sosD: String(t.sosD),
        sosDRank: t.sosDRank,
        ncsos: String(t.ncsos),
        ncsosRank: t.ncsosRank,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      message: `Imported ${teams.length} KenPom rankings`,
      count: teams.length,
    });
  } catch (error) {
    console.error("KenPom import error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const all = await db.select().from(kenpomRankings);
    return NextResponse.json(all);
  } catch (error) {
    console.error("KenPom fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
