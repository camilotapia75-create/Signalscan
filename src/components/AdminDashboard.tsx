"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";

interface AdminStats {
  totalUsers: number;
  totalViews: number;
  todayPool: number;
  watchersToday: number;
  poolDrawn: boolean;
  totalEarningsPaid: number;
  pendingPayouts: number;
  paypalConfigured: boolean;
  allDraws: Array<{
    id: string;
    date: string;
    totalPool: number;
    totalViews: number;
    winnersCount: number;
    prizePerWinner: number;
    payoutStatus: string;
    paypalBatchId: string | null;
  }>;
}

export default function AdminDashboard({ session }: { session: Session }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState("");
  const [drawDate, setDrawDate] = useState(new Date().toISOString().split("T")[0]);
  const [payingOut, setPayingOut] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  async function handleDraw() {
    setDrawing(true);
    setDrawResult("");
    const res = await fetch("/api/admin/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: drawDate }),
    });
    const data = await res.json();
    setDrawing(false);

    if (res.ok) {
      const names = data.winners?.map((w: { name: string; email: string }) => w.name || w.email).join(", ");
      const payout = data.payoutResult;
      let payoutMsg = "";
      if (payout?.success) payoutMsg = ` · PayPal batch ${payout.batchId} sent`;
      else if (payout?.skipped) payoutMsg = " · Winners need to add PayPal email";
      else if (!data.paypalConfigured) payoutMsg = " · PayPal not configured";
      setDrawResult(`✅ ${data.draw.winnersCount} winner(s): ${names}. $${data.prizePerWinner?.toFixed(4)} each.${payoutMsg}`);
      fetchStats();
    } else {
      setDrawResult(`❌ ${data.error}`);
    }
  }

  async function handlePayout(drawId: string) {
    setPayingOut(drawId);
    const res = await fetch("/api/admin/payout-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drawId }),
    });
    const data = await res.json();
    setPayingOut(null);
    if (res.ok) {
      alert(`✅ Payout sent: batch ${data.batchId}, ${data.count} recipients`);
      fetchStats();
    } else {
      alert(`❌ ${data.error || data.message}`);
    }
  }

  async function syncBatch(batchId: string) {
    const res = await fetch(`/api/admin/payout-status?batchId=${batchId}`);
    if (res.ok) { alert("Status synced from PayPal"); fetchStats(); }
  }

  const payoutStatusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    processing: "bg-blue-100 text-blue-700",
    complete: "bg-green-100 text-green-700",
    partial: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95)" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">⚙️ Admin Panel</h1>
            <p className="text-white/50 text-sm">Ad Lottery Management</p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="px-4 py-2 bg-white/20 text-white rounded-xl text-sm hover:bg-white/30">
              ← Back to App
            </Link>
            <button onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-4 py-2 bg-red-500/20 text-red-300 rounded-xl text-sm hover:bg-red-500/30">
              Sign Out
            </button>
          </div>
        </div>

        {/* PayPal status banner */}
        {stats && !stats.paypalConfigured && (
          <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-2xl p-4 mb-6 text-yellow-200 text-sm">
            ⚠️ <strong>PayPal not configured.</strong> Add <code className="bg-black/20 px-1 rounded">PAYPAL_CLIENT_ID</code>,{" "}
            <code className="bg-black/20 px-1 rounded">PAYPAL_CLIENT_SECRET</code>, and{" "}
            <code className="bg-black/20 px-1 rounded">PAYPAL_MODE=live</code> to your Vercel environment variables to enable automatic payouts.
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Users", value: stats?.totalUsers ?? 0, icon: "👥" },
            { label: "Total Ad Views", value: stats?.totalViews ?? 0, icon: "👁️" },
            { label: "Today's Watchers", value: stats?.watchersToday ?? 0, icon: "📅" },
            { label: "Paid Out", value: `$${(stats?.totalEarningsPaid ?? 0).toFixed(2)}`, icon: "💸" },
          ].map((s) => (
            <div key={s.label} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-white">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold">{loading ? "…" : s.value}</div>
              <div className="text-sm text-white/60">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Today's pool + pending */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5">
            <div className="text-white/60 text-sm mb-1">Today&apos;s Pool</div>
            <div className="text-3xl font-bold text-green-400">${(stats?.todayPool ?? 0).toFixed(4)}</div>
            <div className="mt-2">
              {stats?.poolDrawn ? (
                <span className="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-xs">✅ Drawn</span>
              ) : (
                <span className="bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full text-xs">⏳ Pending</span>
              )}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5">
            <div className="text-white/60 text-sm mb-1">Pending Payouts</div>
            <div className="text-3xl font-bold text-yellow-400">${(stats?.pendingPayouts ?? 0).toFixed(4)}</div>
            <div className="text-white/40 text-xs mt-2">Awaiting PayPal send</div>
          </div>
        </div>

        {/* Draw lottery */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-2">🎲 Run Lottery Draw</h2>
          <p className="text-white/50 text-sm mb-4">
            Select a date, run the draw, and PayPal payouts fire automatically for all winners who have their PayPal email set.
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm text-white/60 mb-1 block">Date</label>
              <input type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)}
                className="w-full px-4 py-3 bg-white/20 text-white rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <button onClick={handleDraw} disabled={drawing}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl disabled:opacity-50">
              {drawing ? "Drawing…" : "🎲 Draw & Pay"}
            </button>
          </div>
          {drawResult && (
            <div className={`mt-4 p-4 rounded-xl text-sm ${drawResult.startsWith("✅") ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
              {drawResult}
            </div>
          )}
        </div>

        {/* Draw history */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">📜 Draw History</h2>
          {loading ? <div className="text-white/40">Loading…</div> :
           stats?.allDraws.length === 0 ? <div className="text-white/40 text-center py-8">No draws yet</div> : (
            <div className="space-y-3">
              {stats?.allDraws.map((draw) => (
                <div key={draw.id} className="bg-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-white font-semibold">{draw.date}</div>
                    <div className="text-white/40 text-xs">{draw.totalViews} entries · {draw.winnersCount} winner{draw.winnersCount !== 1 ? "s" : ""}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-green-400 font-bold">${draw.totalPool.toFixed(4)}</div>
                    <div className="text-white/40 text-xs">${draw.prizePerWinner.toFixed(4)}/winner</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${payoutStatusColor[draw.payoutStatus] ?? "bg-gray-500/20 text-gray-300"}`}>
                      {draw.payoutStatus}
                    </span>
                    {draw.payoutStatus === "pending" && stats.paypalConfigured && (
                      <button onClick={() => handlePayout(draw.id)} disabled={payingOut === draw.id}
                        className="text-xs px-3 py-1 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg disabled:opacity-50">
                        {payingOut === draw.id ? "…" : "Pay"}
                      </button>
                    )}
                    {draw.paypalBatchId && (
                      <button onClick={() => syncBatch(draw.paypalBatchId!)}
                        className="text-xs px-3 py-1 bg-blue-500/30 hover:bg-blue-500/50 text-blue-200 rounded-lg">
                        Sync
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Setup notes */}
        <div className="mt-6 bg-blue-500/10 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-3">🔧 To enable real payouts</h3>
          <p className="text-white/60 text-sm mb-3">Add these to your Vercel environment variables:</p>
          <div className="space-y-1 font-mono text-sm">
            {[
              ["PAYPAL_CLIENT_ID", "from developer.paypal.com → My Apps"],
              ["PAYPAL_CLIENT_SECRET", "from developer.paypal.com → My Apps"],
              ["PAYPAL_MODE", "sandbox (testing) or live (real money)"],
              ["NEXT_PUBLIC_ADSENSE_CLIENT", "ca-pub-XXXXXXXX from adsense.google.com"],
              ["NEXT_PUBLIC_ADSENSE_SLOT", "ad unit ID from your AdSense account"],
              ["MIN_PAYOUT_USD", "0.01 (minimum prize to trigger payout)"],
            ].map(([key, desc]) => (
              <div key={key} className="flex gap-3">
                <code className="text-yellow-300 min-w-[280px]">{key}</code>
                <span className="text-white/40 text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
