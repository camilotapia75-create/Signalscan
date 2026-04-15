"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import AdWatcher from "@/components/AdWatcher";
import StatsCard from "@/components/StatsCard";
import WinHistory from "@/components/WinHistory";
import LotteryDraws from "@/components/LotteryDraws";
import Confetti from "@/components/Confetti";
import Link from "next/link";

interface Stats {
  todayPool: number;
  watchersToday: number;
  watchedToday: boolean;
  poolDrawn: boolean;
  userEarnings: number;
  totalEntries: number;
  totalWins: number;
  recentWins: Array<{ id: string; amount: number; date: string; createdAt: string }>;
  recentDraws: Array<{
    id: string;
    date: string;
    totalPool: number;
    winnersCount: number;
    prizePerWinner: number;
  }>;
}

export default function Dashboard({ session }: { session: Session }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/lottery/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Poll every 30 seconds so pool + watcher count stay current
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  function handleAdWatched() {
    // Refresh immediately, then again after 2s to catch any DB lag
    fetchStats();
    setTimeout(fetchStats, 2000);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }

  const isAdmin = (session.user as { isAdmin?: boolean })?.isAdmin;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(135deg, #9333ea 0%, #ec4899 50%, #f97316 100%)",
      }}
    >
      {showConfetti && <Confetti />}

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">💰 Ad Lottery</h1>
          <p className="text-white/80">Watch ads, win real money</p>
          {session.user?.name && (
            <p className="text-white/60 text-sm mt-1">
              Welcome back, {session.user.name}!
            </p>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatsCard
            icon="$"
            label="Today's Pool"
            value={loading ? "..." : (() => { const v = stats?.todayPool ?? 0; return `$${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`; })()}
          />
          <StatsCard
            icon="👥"
            label="Watchers Today"
            value={loading ? "..." : String(stats?.watchersToday ?? 0)}
          />
          <StatsCard
            icon="🏆"
            label="Your Earnings"
            value={loading ? "..." : `$${(stats?.userEarnings ?? 0).toFixed(2)}`}
          />
        </div>

        {/* Additional Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-white text-center">
              <div className="text-2xl font-bold">{stats.totalEntries}</div>
              <div className="text-sm text-white/70">Total Entries</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-white text-center">
              <div className="text-2xl font-bold">{stats.totalWins}</div>
              <div className="text-sm text-white/70">Total Wins</div>
            </div>
          </div>
        )}

        {/* Watch Ad Section */}
        <AdWatcher
          watchedToday={stats?.watchedToday ?? false}
          poolDrawn={stats?.poolDrawn ?? false}
          onAdWatched={handleAdWatched}
          loading={loading}
        />

        {/* How It Works */}
        <div className="bg-white rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 text-center mb-6">How It Works</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-4xl mb-3">👀</div>
              <div className="font-semibold text-gray-800 mb-1">1. Watch Ad</div>
              <div className="text-sm text-gray-500">Watch one ad per day (takes 3 seconds)</div>
            </div>
            <div>
              <div className="text-4xl mb-3">🎟️</div>
              <div className="font-semibold text-gray-800 mb-1">2. Get Entry</div>
              <div className="text-sm text-gray-500">You&apos;re entered into today&apos;s lottery</div>
            </div>
            <div>
              <div className="text-4xl mb-3">💸</div>
              <div className="font-semibold text-gray-800 mb-1">3. Win Money</div>
              <div className="text-sm text-gray-500">Random winners split the ad revenue</div>
            </div>
          </div>
        </div>

        {/* Win History */}
        {stats && stats.recentWins.length > 0 && (
          <WinHistory wins={stats.recentWins} />
        )}

        {/* Recent Draws */}
        {stats && stats.recentDraws.length > 0 && (
          <LotteryDraws draws={stats.recentDraws} />
        )}

        {/* Footer links */}
        <div className="flex justify-center gap-6 text-sm">
          <Link href="/profile" className="text-white/70 underline hover:text-white">
            My Profile &amp; Payouts
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-white/70 underline hover:text-white">
              Admin Panel
            </Link>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-white/70 underline hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
