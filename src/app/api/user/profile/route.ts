import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, paypalEmail: true },
  });

  return NextResponse.json(user);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, paypalEmail } = await req.json();

  // Basic PayPal email validation
  if (paypalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
    return NextResponse.json({ error: "Invalid PayPal email address" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined && { name }),
      ...(paypalEmail !== undefined && { paypalEmail: paypalEmail || null }),
    },
    select: { id: true, name: true, email: true, paypalEmail: true },
  });

  // If user just added PayPal and has pending earnings, mark them for retry
  if (paypalEmail) {
    await prisma.earning.updateMany({
      where: { userId: session.user.id, paymentStatus: "no_paypal" },
      data: { paymentStatus: "pending" },
    });
  }

  return NextResponse.json({ success: true, user });
}
