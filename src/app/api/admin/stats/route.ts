import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTodayDate } from "@/lib/lottery";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const today = getTodayDate();

  try {
    const [totalUsers, totalViews, todayPool, allDraws, totalEarningsPaid] = await Promise.all([
      prisma.user.count(),
      prisma.adView.count(),
      prisma.dailyPool.findUnique({ where: { date: today } }),
      prisma.lotteryDraw.findMany({ orderBy: { date: "desc" }, take: 30 }),
      prisma.earning.aggregate({ _sum: { amount: true } }),
    ]);

    return NextResponse.json({
      totalUsers,
      totalViews,
      todayPool: todayPool?.totalPool ?? 0,
      watchersToday: todayPool?.viewCount ?? 0,
      poolDrawn: todayPool?.drawn ?? false,
      allDraws,
      totalEarningsPaid: totalEarningsPaid._sum.amount ?? 0,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json({ error: "Failed to fetch admin stats" }, { status: 500 });
  }
}
