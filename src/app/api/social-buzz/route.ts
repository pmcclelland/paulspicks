import { NextResponse } from "next/server";
import { getSocialBuzz } from "@/lib/social-buzz";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameIdParam = searchParams.get("gameId");
    const teamIdParam = searchParams.get("teamId");

    const gameId = gameIdParam ? parseInt(gameIdParam) : undefined;
    const teamId = teamIdParam ? parseInt(teamIdParam) : undefined;

    const result = await getSocialBuzz(gameId, teamId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Social buzz error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
