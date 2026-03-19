import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, appState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { email, name, password } = await request.json();

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Email, name, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Auto-spectator: if picks are locked (tournament started), new users are spectators
    const lockedState = await db
      .select()
      .from(appState)
      .where(eq(appState.key, "picks_locked"));
    const picksLocked = lockedState.length > 0 && lockedState[0].value === "true";

    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      email,
      name,
      passwordHash,
      isSpectator: picksLocked ? 1 : 0,
    });

    return NextResponse.json(
      { message: "User created", isSpectator: picksLocked },
      { status: 201 }
    );
  } catch (error: any) {
    if (
      error?.message?.includes("UNIQUE constraint failed") ||
      error?.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
