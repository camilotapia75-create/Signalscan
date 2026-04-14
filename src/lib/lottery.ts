import { prisma } from "@/lib/prisma";
import { sendPayouts, isPayPalConfigured } from "@/lib/paypal";

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
    create: { date, totalPool: revenue, viewCount: 1 },
  });
}

export async function hasWatchedAdToday(
  userId: string,
  date: string
): Promise<boolean> {
  const view = await prisma.adView.findUnique({
    where: { userId_date: { userId, date } },
  });
  return !!view;
}

export async function drawLottery(date: string) {
  const pool = await prisma.dailyPool.findUnique({ where: { date } });
  if (!pool || pool.drawn) {
    return {
      success: false,
      message: pool?.drawn ? "Already drawn for this date" : "No pool found",
    };
  }

  const entries = await prisma.lotteryEntry.findMany({
    where: { date },
    include: { user: true },
  });

  if (entries.length === 0) {
    return { success: false, message: "No entries for this date" };
  }

  // 10% winners, min 1, max 10
  const winnersCount = Math.min(10, Math.max(1, Math.floor(entries.length * 0.1)));

  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, winnersCount);

  // 70% of pool paid to winners
  const prizePool = pool.totalPool * 0.7;
  const prizePerWinner = prizePool / winnersCount;

  const winnerIds = winners.map((w) => w.userId);

  // Mark winning entries
  await prisma.lotteryEntry.updateMany({
    where: { date, userId: { in: winnerIds } },
    data: { isWinner: true },
  });

  // Create earning records
  const earnings = await Promise.all(
    winners.map((winner) =>
      prisma.earning.create({
        data: {
          userId: winner.userId,
          amount: prizePerWinner,
          date,
          paymentStatus: "pending",
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
      payoutStatus: "pending",
    },
  });

  // Mark pool as drawn
  await prisma.dailyPool.update({
    where: { date },
    data: { drawn: true },
  });

  // Attempt PayPal payouts immediately if configured
  let payoutResult = null;
  if (isPayPalConfigured()) {
    payoutResult = await processPayouts(earnings, winners, draw.id);
  }

  return {
    success: true,
    draw,
    winners: winners.map((w) => ({
      name: w.user.name,
      email: w.user.email,
      paypalEmail: w.user.paypalEmail,
    })),
    prizePerWinner,
    payoutResult,
    paypalConfigured: isPayPalConfigured(),
  };
}

async function processPayouts(
  earnings: Array<{ id: string; userId: string; amount: number }>,
  winners: Array<{ userId: string; user: { paypalEmail: string | null; email: string } }>,
  drawId: string
) {
  const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_USD ?? "0.01");

  // Build payout items for winners who have PayPal and meet minimum
  const payoutItems = earnings
    .map((earning) => {
      const winner = winners.find((w) => w.userId === earning.userId);
      const paypalEmail = winner?.user.paypalEmail;
      return { earning, winner, paypalEmail };
    })
    .filter(({ earning, paypalEmail }) => paypalEmail && earning.amount >= MIN_PAYOUT)
    .map(({ earning, paypalEmail, winner }) => ({
      userId: earning.userId,
      earningId: earning.id,
      paypalEmail: paypalEmail!,
      amount: earning.amount,
      note: `Ad Lottery winnings for ${winner!.user.email}`,
    }));

  // Update earnings with no PayPal email
  const noPaypalIds = earnings
    .filter((e) => !winners.find((w) => w.userId === e.userId)?.user.paypalEmail)
    .map((e) => e.id);

  if (noPaypalIds.length > 0) {
    await prisma.earning.updateMany({
      where: { id: { in: noPaypalIds } },
      data: { paymentStatus: "no_paypal" },
    });
  }

  if (payoutItems.length === 0) {
    return { skipped: true, reason: "No winners with PayPal email" };
  }

  try {
    // Mark as processing
    await prisma.earning.updateMany({
      where: { id: { in: payoutItems.map((p) => p.earningId) } },
      data: { paymentStatus: "processing" },
    });

    const result = await sendPayouts(payoutItems);

    // Create Payout records
    await Promise.all(
      payoutItems.map((item) =>
        prisma.payout.create({
          data: {
            userId: item.userId,
            earningId: item.earningId,
            amount: item.amount,
            paypalEmail: item.paypalEmail,
            batchId: result.batchId,
            status: "processing",
          },
        })
      )
    );

    // Update earnings with batch ID
    await prisma.earning.updateMany({
      where: { id: { in: payoutItems.map((p) => p.earningId) } },
      data: { paymentStatus: "processing", paymentTxId: result.batchId },
    });

    // Update draw status
    await prisma.lotteryDraw.update({
      where: { id: drawId },
      data: { payoutStatus: "processing", paypalBatchId: result.batchId },
    });

    return { success: true, batchId: result.batchId, count: payoutItems.length };
  } catch (err) {
    console.error("PayPal payout error:", err);

    await prisma.earning.updateMany({
      where: { id: { in: payoutItems.map((p) => p.earningId) } },
      data: { paymentStatus: "failed" },
    });

    return { success: false, error: String(err) };
  }
}
