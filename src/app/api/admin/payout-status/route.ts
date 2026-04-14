import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPayoutBatchStatus, isPayPalConfigured } from "@/lib/paypal";

// Manually trigger payouts for a completed draw
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { drawId } = await req.json();

  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: "PayPal not configured" }, { status: 400 });
  }

  const draw = await prisma.lotteryDraw.findUnique({ where: { id: drawId } });
  if (!draw) return NextResponse.json({ error: "Draw not found" }, { status: 404 });

  // Get pending earnings for this draw
  const earnings = await prisma.earning.findMany({
    where: { date: draw.date, paymentStatus: { in: ["pending", "no_paypal", "failed"] } },
    include: { user: true },
  });

  const payable = earnings.filter((e) => e.user.paypalEmail && e.amount >= 0.01);

  if (payable.length === 0) {
    return NextResponse.json({
      success: false,
      message: "No payable earnings found. Winners may need to add their PayPal email.",
    });
  }

  const { sendPayouts } = await import("@/lib/paypal");
  const result = await sendPayouts(
    payable.map((e) => ({
      userId: e.userId,
      earningId: e.id,
      paypalEmail: e.user.paypalEmail!,
      amount: e.amount,
    }))
  );

  // Record payouts
  await Promise.all(
    payable.map((e) =>
      prisma.payout.upsert({
        where: { earningId: e.id },
        update: { batchId: result.batchId, status: "processing" },
        create: {
          userId: e.userId,
          earningId: e.id,
          amount: e.amount,
          paypalEmail: e.user.paypalEmail!,
          batchId: result.batchId,
          status: "processing",
        },
      })
    )
  );

  await prisma.earning.updateMany({
    where: { id: { in: payable.map((e) => e.id) } },
    data: { paymentStatus: "processing", paymentTxId: result.batchId },
  });

  await prisma.lotteryDraw.update({
    where: { id: drawId },
    data: { payoutStatus: "processing", paypalBatchId: result.batchId },
  });

  return NextResponse.json({ success: true, batchId: result.batchId, count: payable.length });
}

// Sync payout statuses from PayPal
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "batchId required" }, { status: 400 });

  const batchData = await getPayoutBatchStatus(batchId);

  // Sync item statuses back to our DB
  interface PayPalItem {
    sender_item_id: string;
    transaction_status: string;
    payout_item_id: string;
  }
  const items: PayPalItem[] = batchData.items ?? [];

  await Promise.all(
    items.map((item: PayPalItem) =>
      prisma.payout
        .updateMany({
          where: { earningId: item.sender_item_id },
          data: {
            status: item.transaction_status?.toLowerCase() ?? "processing",
            paypalTxId: item.payout_item_id,
          },
        })
        .then(() =>
          prisma.earning.updateMany({
            where: { id: item.sender_item_id },
            data: {
              paymentStatus:
                item.transaction_status === "SUCCESS"
                  ? "paid"
                  : item.transaction_status === "FAILED"
                  ? "failed"
                  : "processing",
              paymentTxId: item.payout_item_id,
            },
          })
        )
    )
  );

  return NextResponse.json(batchData);
}
