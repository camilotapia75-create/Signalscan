import { prisma } from "@/lib/prisma";

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getOrCreateDailyPool(date: string) {
  return prisma.dailyPool.upsert({
    where: { date },
    update: {},
    create: { date, totalPool: 0, viewCount: 0 },
  });
}

export async function addToPool(date: string, revenue: number) {
  return prisma.dailyPool.upsert({
    where: { date },
    update: {
      totalPool: { increment: revenue },
      viewCount: { increment: 1 },
    },
    create: {
      date,
      totalPool: revenue,
      viewCount: 1,
    },
  });
}

export async function hasWatchedAdToday(userId: string, date: string): Promise<boolean> {
  const view = await prisma.adView.findUnique({
    where: { userId_date: { userId, date } },
  });
  return !!view;
}

// Select random winners from today's entries (top 3 or 10% of entrants, whichever is larger)
export async function drawLottery(date: string) {
  const pool = await prisma.dailyPool.findUnique({ where: { date } });
  if (!pool || pool.drawn) {
    return { success: false, message: pool?.drawn ? "Already drawn" : "No pool found" };
  }

  const entries = await prisma.lotteryEntry.findMany({
    where: { date },
    include: { user: true },
  });

  if (entries.length === 0) {
    return { success: false, message: "No entries for today" };
  }

  // Determine number of winners: min 1, max 10% of participants (at least 1, max 10)
  const winnersCount = Math.min(10, Math.max(1, Math.floor(entries.length * 0.1)));

  // Shuffle and pick winners
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, winnersCount);

  // 70% of pool goes to winners, 30% retained (platform fee simulation)
  const prizePool = pool.totalPool * 0.7;
  const prizePerWinner = prizePool / winnersCount;

  const winnerIds = winners.map((w) => w.userId);

  // Mark winners in lottery entries
  await prisma.lotteryEntry.updateMany({
    where: { date, userId: { in: winnerIds } },
    data: { isWinner: true },
  });

  // Create earnings records
  await Promise.all(
    winners.map((winner) =>
      prisma.earning.create({
        data: {
          userId: winner.userId,
          amount: prizePerWinner,
          date,
        },
      })
    )
  );

  // Record the draw
  const draw = await prisma.lotteryDraw.create({
    data: {
      date,
      totalPool: pool.totalPool,
      totalViews: pool.viewCount,
      winnersCount,
      prizePerWinner,
      winnerIds: JSON.stringify(winnerIds),
    },
  });

  // Mark pool as drawn
  await prisma.dailyPool.update({
    where: { date },
    data: { drawn: true },
  });

  return {
    success: true,
    draw,
    winners: winners.map((w) => ({ name: w.user.name, email: w.user.email })),
    prizePerWinner,
  };
}
