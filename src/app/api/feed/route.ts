import { NextResponse } from "next/server";
import { computeFeedEvents } from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await computeFeedEvents();
    return NextResponse.json(events);
  } catch (error) {
    console.error("Feed error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
