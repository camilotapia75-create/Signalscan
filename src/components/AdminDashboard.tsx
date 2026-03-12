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
  allDraws: Array<{
    id: string;
    date: string;
    totalPool: number;
    totalViews: number;
    winnersCount: number;
    prizePerWinner: number;
    drawnAt: string;
  }>;
}

export default function AdminDashboard({ session }: { session: Session }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<string>("");
  const [drawDate, setDrawDate] = useState(new Date().toISOString().split("T")[0]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch admin stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handleDraw() {
    setDrawing(true);
    setDrawResult("");
    try {
      const res = await fetch("/api/admin/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: drawDate }),
      });
      const data = await res.json();

      if (res.ok) {
        const winnerNames = data.winners
          ?.map((w: { name: string; email: string }) => w.name || w.email)
          .join(", ");
        setDrawResult(
          `✅ Draw complete! ${data.draw.winnersCount} winner(s): ${winnerNames}. Prize: $${data.prizePerWinner?.toFixed(4)} each.`
        );
        fetchStats();
      } else {
        setDrawResult(`❌ Error: ${data.error}`);
      }
    } catch {
      setDrawResult("❌ Network error");
    } finally {
      setDrawing(false);
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)",
      }}
    >
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">⚙️ Admin Panel</h1>
            <p className="text-white/60 text-sm">Ad Lottery Management</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="px-4 py-2 bg-white/20 text-white rounded-xl text-sm hover:bg-white/30 transition-colors"
            >
              ← Back to App
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-4 py-2 bg-red-500/20 text-red-300 rounded-xl text-sm hover:bg-red-500/30 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Platform Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Users", value: stats?.totalUsers ?? 0, icon: "👥" },
            { label: "Total Ad Views", value: stats?.totalViews ?? 0, icon: "👁️" },
            { label: "Today's Watchers", value: stats?.watchersToday ?? 0, icon: "📅" },
            {
              label: "Total Paid Out",
              value: `$${(stats?.totalEarningsPaid ?? 0).toFixed(4)}`,
              icon: "💸",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-white"
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold">{loading ? "..." : stat.value}</div>
              <div className="text-sm text-white/60">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Today's Pool */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-2">💰 Today&apos;s Pool</h2>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-green-400">
              ${(stats?.todayPool ?? 0).toFixed(4)}
            </div>
            <div className="text-white/60">
              {stats?.poolDrawn ? (
                <span className="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm">
                  ✅ Already drawn
                </span>
              ) : (
                <span className="bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full text-sm">
                  ⏳ Pending draw
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Draw Lottery */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">🎲 Run Lottery Draw</h2>
          <p className="text-white/60 text-sm mb-4">
            Select a date and run the lottery draw. Winners will receive 70% of the pool,
            split equally. The draw is irreversible.
          </p>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm text-white/70 mb-1 block">Draw Date</label>
              <input
                type="date"
                value={drawDate}
                onChange={(e) => setDrawDate(e.target.value)}
                className="w-full px-4 py-3 bg-white/20 text-white rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <button
              onClick={handleDraw}
              disabled={drawing}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {drawing ? "Drawing..." : "🎲 Draw Now"}
            </button>
          </div>

          {drawResult && (
            <div
              className={`mt-4 p-4 rounded-xl text-sm ${
                drawResult.startsWith("✅")
                  ? "bg-green-500/20 text-green-300"
                  : "bg-red-500/20 text-red-300"
              }`}
            >
              {drawResult}
            </div>
          )}
        </div>

        {/* Draw History */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">📜 Draw History</h2>
          {loading ? (
            <div className="text-white/40">Loading...</div>
          ) : stats?.allDraws.length === 0 ? (
            <div className="text-white/40 text-center py-8">No draws yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-white">
                <thead>
                  <tr className="text-white/50 border-b border-white/10">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-right py-2 px-3">Pool</th>
                    <th className="text-right py-2 px-3">Entries</th>
                    <th className="text-right py-2 px-3">Winners</th>
                    <th className="text-right py-2 px-3">Per Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.allDraws.map((draw) => (
                    <tr
                      key={draw.id}
                      className="border-b border-white/5 hover:bg-white/5"
                    >
                      <td className="py-2 px-3">{draw.date}</td>
                      <td className="text-right py-2 px-3 text-green-400">
                        ${draw.totalPool.toFixed(4)}
                      </td>
                      <td className="text-right py-2 px-3">{draw.totalViews}</td>
                      <td className="text-right py-2 px-3">{draw.winnersCount}</td>
                      <td className="text-right py-2 px-3 text-yellow-400">
                        ${draw.prizePerWinner.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-500/10 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-3">📋 Setup Notes</h3>
          <ul className="text-white/60 text-sm space-y-2">
            <li>• <strong className="text-white">Lottery draws</strong> must be triggered manually here. For production, set up a daily cron job hitting <code className="bg-white/10 px-1 rounded">/api/admin/draw</code> with your admin credentials.</li>
            <li>• <strong className="text-white">Ad revenue</strong> is currently simulated at $0.001/view. Replace with real ad network SDK for production.</li>
            <li>• <strong className="text-white">Payouts</strong> are tracked in the database. Integrate Stripe Connect or PayPal Payouts API to send real money.</li>
            <li>• <strong className="text-white">Admin password</strong>: Change via database or add a settings page.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
