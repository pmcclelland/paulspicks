import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: "If an account with that email exists, a reset link has been sent." },
        { status: 200 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()));

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      await sendPasswordResetEmail(user.email, token);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({
      message: "If an account with that email exists, a reset link has been sent.",
    });
  } catch {
    return NextResponse.json({
      message: "If an account with that email exists, a reset link has been sent.",
    });
  }
}
