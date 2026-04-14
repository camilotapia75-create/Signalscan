"use client";

import { useState, useEffect } from "react";
import type { Session } from "next-auth";
import Link from "next/link";

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  paypalEmail: string | null;
}

interface Earning {
  id: string;
  amount: number;
  date: string;
  paymentStatus: string;
  paymentTxId: string | null;
}

export default function ProfileClient({ session }: { session: Session }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [name, setName] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setName(data.name ?? "");
        setPaypalEmail(data.paypalEmail ?? "");
      });

    fetch("/api/lottery/stats")
      .then((r) => r.json())
      .then((data) => setEarnings(data.recentWins ?? []));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, paypalEmail }),
    });

    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setProfile(data.user);
      setMessage({ type: "success", text: "Profile saved! You'll receive PayPal payouts automatically when you win." });
    } else {
      setMessage({ type: "error", text: data.error || "Failed to save" });
    }
  }

  const statusColor: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    processing: "bg-blue-100 text-blue-700",
    pending: "bg-yellow-100 text-yellow-700",
    failed: "bg-red-100 text-red-700",
    no_paypal: "bg-gray-100 text-gray-600",
  };

  const statusLabel: Record<string, string> = {
    paid: "✅ Paid",
    processing: "⏳ Processing",
    pending: "🕐 Pending",
    failed: "❌ Failed",
    no_paypal: "⚠️ No PayPal set",
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(135deg,#9333ea 0%,#ec4899 50%,#f97316 100%)" }}
    >
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-white/70 hover:text-white text-sm">← Back</Link>
          <h1 className="text-2xl font-bold text-white">My Profile</h1>
        </div>

        {/* Profile form */}
        <div className="bg-white rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Account & Payment Settings</h2>
          <p className="text-gray-500 text-sm mb-5">
            Add your PayPal email so winnings are sent automatically the moment you win.
          </p>

          {message && (
            <div
              className={`p-4 rounded-xl mb-4 text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={profile?.email ?? session.user?.email ?? ""}
                disabled
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PayPal Email <span className="text-purple-600 font-semibold">← Required to receive winnings</span>
              </label>
              <input
                type="email"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="your-paypal@email.com"
              />
              <p className="text-xs text-gray-400 mt-1">
                This is the email address on your PayPal account. Winnings are sent here automatically.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 text-white font-semibold rounded-xl disabled:opacity-50 transition-opacity"
              style={{ background: "linear-gradient(135deg,#9333ea,#ec4899)" }}
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </form>
        </div>

        {/* Earnings history */}
        <div className="bg-white rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Earnings & Payout History</h2>

          {earnings.length === 0 ? (
            <p className="text-gray-400 text-center py-6 text-sm">
              No winnings yet. Watch an ad daily to enter the lottery!
            </p>
          ) : (
            <div className="space-y-3">
              {earnings.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{e.date}</div>
                    {e.paymentTxId && (
                      <div className="text-xs text-gray-400 mt-0.5">TX: {e.paymentTxId}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        statusColor[e.paymentStatus] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {statusLabel[e.paymentStatus] ?? e.paymentStatus}
                    </span>
                    <span className="font-bold text-green-600">${e.amount.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!profile?.paypalEmail && earnings.some((e) => e.paymentStatus === "no_paypal") && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-yellow-800 text-sm">
                <strong>You have unclaimed winnings!</strong> Add your PayPal email above to receive them.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
