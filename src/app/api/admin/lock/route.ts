import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { locked } = await request.json();

    if (typeof locked !== "boolean") {
      return NextResponse.json(
        { error: "locked must be a boolean" },
        { status: 400 }
      );
    }

    const value = locked ? "true" : "false";

    const existing = await db
      .select()
      .from(appState)
      .where(eq(appState.key, "picks_locked"));

    if (existing.length > 0) {
      await db
        .update(appState)
        .set({ value })
        .where(eq(appState.key, "picks_locked"));
    } else {
      await db.insert(appState).values({ key: "picks_locked", value });
    }

    return NextResponse.json({ locked });
  } catch (error) {
    console.error("Lock error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
