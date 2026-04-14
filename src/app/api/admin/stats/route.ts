import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTodayDate } from "@/lib/lottery";
import { isPayPalConfigured } from "@/lib/paypal";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const today = getTodayDate();

  const [totalUsers, totalViews, todayPool, allDraws, totalEarningsPaid, pendingPayouts] =
    await Promise.all([
      prisma.user.count(),
      prisma.adView.count(),
      prisma.dailyPool.findUnique({ where: { date: today } }),
      prisma.lotteryDraw.findMany({ orderBy: { date: "desc" }, take: 30 }),
      prisma.earning.aggregate({
        where: { paymentStatus: "paid" },
        _sum: { amount: true },
      }),
      prisma.earning.aggregate({
        where: { paymentStatus: { in: ["pending", "no_paypal", "processing"] } },
        _sum: { amount: true },
      }),
    ]);

  return NextResponse.json({
    totalUsers,
    totalViews,
    todayPool: todayPool?.totalPool ?? 0,
    watchersToday: todayPool?.viewCount ?? 0,
    poolDrawn: todayPool?.drawn ?? false,
    allDraws,
    totalEarningsPaid: totalEarningsPaid._sum.amount ?? 0,
    pendingPayouts: pendingPayouts._sum.amount ?? 0,
    paypalConfigured: isPayPalConfigured(),
  });
}
