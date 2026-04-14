import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTodayDate, hasWatchedAdToday } from "@/lib/lottery";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const today = getTodayDate();

  const [pool, watchedToday, earningsResult, recentWins, recentDraws, totalEntries, totalWins, userProfile] =
    await Promise.all([
      prisma.dailyPool.findUnique({ where: { date: today } }),
      hasWatchedAdToday(userId, today),
      prisma.earning.aggregate({ where: { userId }, _sum: { amount: true } }),
      prisma.earning.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.lotteryDraw.findMany({ orderBy: { date: "desc" }, take: 7 }),
      prisma.lotteryEntry.count({ where: { userId } }),
      prisma.lotteryEntry.count({ where: { userId, isWinner: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { paypalEmail: true } }),
    ]);

  return NextResponse.json({
    todayPool: pool?.totalPool ?? 0,
    watchersToday: pool?.viewCount ?? 0,
    watchedToday,
    poolDrawn: pool?.drawn ?? false,
    userEarnings: earningsResult._sum.amount ?? 0,
    totalEntries,
    totalWins,
    hasPaypal: !!userProfile?.paypalEmail,
    recentWins,
    recentDraws,
  });
}
