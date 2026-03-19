import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

export async function GET(request: NextRequest) {
  const teamIds = request.nextUrl.searchParams.getAll("teamIds").map(Number).filter(Boolean);
  if (teamIds.length === 0) {
    return NextResponse.json({});
  }

  const dbTeams = await db
    .select()
    .from(teams)
    .where(inArray(teams.id, teamIds));

  const results: Record<number, string> = {};

  await Promise.all(
    dbTeams.map(async (team) => {
      try {
        const res = await fetch(`${ESPN_BASE}/teams/${team.espnTeamId}`);
        if (!res.ok) return;
        const data = await res.json();
        const total = data.team?.record?.items?.find((r: any) => r.type === "total");
        if (total?.summary) {
          results[team.id] = total.summary;
        }
      } catch {}
    })
  );

  return NextResponse.json(results);
}
