import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTodayDate, hasWatchedAdToday, addToPool } from "@/lib/lottery";

const AD_REVENUE_PER_VIEW = 0.001; // $0.001 per ad view (realistic CPM estimate)

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const today = getTodayDate();

  try {
    const alreadyWatched = await hasWatchedAdToday(userId, today);
    if (alreadyWatched) {
      return NextResponse.json(
        { error: "You have already watched an ad today. Come back tomorrow!" },
        { status: 400 }
      );
    }

    // Record the ad view
    const adView = await prisma.adView.create({
      data: {
        userId,
        date: today,
        adRevenue: AD_REVENUE_PER_VIEW,
      },
    });

    // Create lottery entry
    await prisma.lotteryEntry.create({
      data: {
        userId,
        adViewId: adView.id,
        date: today,
      },
    });

    // Add to daily pool
    await addToPool(today, AD_REVENUE_PER_VIEW);

    // Get updated pool info
    const pool = await prisma.dailyPool.findUnique({ where: { date: today } });

    return NextResponse.json({
      success: true,
      message: "Ad watched! You're entered in today's lottery.",
      pool: pool?.totalPool ?? 0,
      viewCount: pool?.viewCount ?? 0,
    });
  } catch (error) {
    console.error("Error recording ad view:", error);
    return NextResponse.json({ error: "Failed to record ad view" }, { status: 500 });
  }
}
