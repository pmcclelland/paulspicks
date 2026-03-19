import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { kenpomRankings } from "@/lib/db/schema";
import { KENPOM_DATA } from "@/lib/kenpom-data";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(kenpomRankings);

    const now = new Date().toISOString();

    for (const row of KENPOM_DATA) {
      const [rank, teamName, seed, conf, record, adjEM, adjO, adjORank, adjD, adjDRank, adjT, adjTRank, luck, luckRank, sosEM, sosEMRank, sosO, sosORank, sosD, sosDRank, ncsos, ncsosRank] = row;
      await db.insert(kenpomRankings).values({
        teamName,
        rank,
        seed,
        conference: conf,
        record,
        adjEM: String(adjEM),
        adjO: String(adjO),
        adjORank,
        adjD: String(adjD),
        adjDRank,
        adjT: String(adjT),
        adjTRank,
        luck: String(luck),
        luckRank,
        sosEM: String(sosEM),
        sosEMRank,
        sosO: String(sosO),
        sosORank,
        sosD: String(sosD),
        sosDRank,
        ncsos: String(ncsos),
        ncsosRank,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      message: `Imported ${KENPOM_DATA.length} KenPom rankings from bundled data`,
      count: KENPOM_DATA.length,
    });
  } catch (error) {
    console.error("KenPom seed error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
