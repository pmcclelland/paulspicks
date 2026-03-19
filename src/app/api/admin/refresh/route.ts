import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { doRefreshScores } from "@/lib/refresh-scores";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { updatedGames, scoredPicks } = await doRefreshScores();

    return NextResponse.json({
      message: `Updated ${updatedGames} games, scored ${scoredPicks} picks`,
      updatedGames,
      scoredPicks,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
