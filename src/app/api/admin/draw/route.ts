import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { drawLottery, getTodayDate } from "@/lib/lottery";

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const date = body.date || getTodayDate();

    const result = await drawLottery(date);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error drawing lottery:", error);
    return NextResponse.json({ error: "Failed to draw lottery" }, { status: 500 });
  }
}
