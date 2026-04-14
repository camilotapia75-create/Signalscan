const PAYPAL_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export function isPayPalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal auth failed: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

export interface PayoutItem {
  userId: string;
  earningId: string;
  paypalEmail: string;
  amount: number;
  note?: string;
}

export interface PayoutResult {
  batchId: string;
  status: string;
  items: {
    userId: string;
    earningId: string;
    senderItemId: string;
    status: string;
  }[];
}

export async function sendPayouts(
  items: PayoutItem[],
  batchNote = "Ad Lottery winnings"
): Promise<PayoutResult> {
  const token = await getAccessToken();
  const batchId = `adlottery_${Date.now()}`;

  const body = {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: "🎉 You won the Ad Lottery!",
      email_message:
        "Congratulations! Your winnings from today's Ad Lottery draw have been sent to your PayPal account.",
      note: batchNote,
    },
    items: items.map((item) => ({
      recipient_type: "EMAIL",
      amount: {
        value: item.amount.toFixed(2),
        currency: "USD",
      },
      note: item.note ?? "Ad Lottery daily draw winnings",
      receiver: item.paypalEmail,
      sender_item_id: item.earningId, // unique per item
    })),
  };

  const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `PayPal payout failed: ${data.message ?? JSON.stringify(data)}`
    );
  }

  return {
    batchId,
    status: data.batch_header?.batch_status ?? "PENDING",
    items: items.map((item) => ({
      userId: item.userId,
      earningId: item.earningId,
      senderItemId: item.earningId,
      status: "PENDING",
    })),
  };
}

export async function getPayoutBatchStatus(batchId: string) {
  const token = await getAccessToken();

  const res = await fetch(
    `${PAYPAL_BASE}/v1/payments/payouts/${batchId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) throw new Error("Failed to fetch payout status");
  return res.json();
}
