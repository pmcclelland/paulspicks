import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeWhatIf } from "@/lib/what-if";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get("userId");
    const userId = userIdParam ? parseInt(userIdParam) : parseInt(session.user.id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

    const result = await computeWhatIf(userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("What-if error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
