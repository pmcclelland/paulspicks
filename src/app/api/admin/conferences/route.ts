import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allTeams = await db.select().from(teams);
    const teamsToUpdate = allTeams.filter((t) => !t.conference && !t.espnTeamId.startsWith("sample-"));

    let updated = 0;
    let failed = 0;

    for (const team of teamsToUpdate) {
      try {
        const res = await fetch(`${ESPN_BASE}/teams/${team.espnTeamId}`);
        if (!res.ok) {
          failed++;
          continue;
        }
        const data = await res.json();
        const summary: string = data?.team?.standingSummary || "";
        // Format: "1st in ACC", "3rd in SEC", etc.
        const match = summary.match(/in\s+(.+)$/i);
        const conference = match?.[1]?.trim() || null;

        if (conference) {
          await db.update(teams)
            .set({ conference })
            .where(eq(teams.id, team.id));
          updated++;
        } else {
          failed++;
        }

        // Small delay to avoid hammering ESPN
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        failed++;
      }
    }

    return NextResponse.json({
      message: `Updated ${updated} teams with conference data (${failed} failed, ${allTeams.length - teamsToUpdate.length} already had conference)`,
      updated,
      failed,
    });
  } catch (error) {
    console.error("Conference backfill error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
