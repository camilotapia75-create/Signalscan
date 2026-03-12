import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTodayDate, hasWatchedAdToday } from "@/lib/lottery";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const today = getTodayDate();

  try {
    // Today's pool
    const pool = await prisma.dailyPool.findUnique({ where: { date: today } });

    // Has user watched today?
    const watchedToday = await hasWatchedAdToday(userId, today);

    // User's total earnings
    const earningsResult = await prisma.earning.aggregate({
      where: { userId },
      _sum: { amount: true },
    });

    // User's win history (last 10)
    const recentWins = await prisma.earning.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Recent lottery draws (last 7)
    const recentDraws = await prisma.lotteryDraw.findMany({
      orderBy: { date: "desc" },
      take: 7,
    });

    // User's entry count
    const totalEntries = await prisma.lotteryEntry.count({ where: { userId } });
    const totalWins = await prisma.lotteryEntry.count({
      where: { userId, isWinner: true },
    });

    return NextResponse.json({
      todayPool: pool?.totalPool ?? 0,
      watchersToday: pool?.viewCount ?? 0,
      watchedToday,
      poolDrawn: pool?.drawn ?? false,
      userEarnings: earningsResult._sum.amount ?? 0,
      totalEntries,
      totalWins,
      recentWins,
      recentDraws,
    });
  } catch (error) {
    console.error("Error fetching lottery stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
