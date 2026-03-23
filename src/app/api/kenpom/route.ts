import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kenpomRankings } from "@/lib/db/schema";
import { schoolName } from "@/lib/school-names";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const team1 = request.nextUrl.searchParams.get("team1");
  const team2 = request.nextUrl.searchParams.get("team2");

  if (!team1 && !team2) {
    return NextResponse.json({ error: "team1 or team2 required" }, { status: 400 });
  }

  const all = await db.select().from(kenpomRankings);

  // ESPN names that don't match KenPom names via substring
  const KENPOM_ALIASES: Record<string, string> = {
    "uconn": "connecticut",
    "ucf": "central florida",
    "lsu": "lsu",
    "smu": "smu",
    "vcu": "vcu",
    "fiu": "fiu",
    "liu": "liu",
    "utep": "utep",
    "unlv": "unlv",
    "umbc": "umbc",
    "njit": "njit",
    "utsa": "utsa",
  };

  function find(name: string) {
    const lower = name.toLowerCase();
    const school = schoolName(name).toLowerCase();
    const alias = KENPOM_ALIASES[school] ?? null;
    return all.find(
      (k) => {
        const kLower = k.teamName.toLowerCase();
        return kLower === lower ||
          kLower === school ||
          (alias && kLower === alias) ||
          lower.includes(kLower) ||
          kLower.includes(lower) ||
          school.includes(kLower) ||
          kLower.includes(school) ||
          (alias && (alias.includes(kLower) || kLower.includes(alias)));
      }
    ) ?? null;
  }

  return NextResponse.json({
    team1: team1 ? find(team1) : null,
    team2: team2 ? find(team2) : null,
  });
}
