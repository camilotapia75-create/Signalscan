"use client";

import { useState, useEffect, useRef } from "react";

interface AdWatcherProps {
  watchedToday: boolean;
  poolDrawn: boolean;
  onAdWatched: () => void;
  loading: boolean;
}

type WatchState = "idle" | "watching" | "done" | "error";

export default function AdWatcher({
  watchedToday,
  poolDrawn,
  onAdWatched,
  loading,
}: AdWatcherProps) {
  const [state, setState] = useState<WatchState>("idle");
  const [countdown, setCountdown] = useState(3);
  const [message, setMessage] = useState("");
  const [adContent, setAdContent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulated ad content variants
  const adVariants = [
    {
      brand: "🚀 TechStart Pro",
      tagline: "Launch your startup faster",
      bg: "from-blue-500 to-indigo-600",
    },
    {
      brand: "🌿 GreenEarth Foods",
      tagline: "Healthy choices, happy life",
      bg: "from-green-500 to-emerald-600",
    },
    {
      brand: "🎮 GameZone Elite",
      tagline: "Play more, win more",
      bg: "from-purple-500 to-violet-600",
    },
    {
      brand: "💄 Luxe Beauty",
      tagline: "Look your absolute best",
      bg: "from-pink-500 to-rose-600",
    },
    {
      brand: "🏠 HomeNest Decor",
      tagline: "Transform your living space",
      bg: "from-amber-500 to-orange-600",
    },
  ];

  function startWatching() {
    setAdContent(Math.floor(Math.random() * adVariants.length));
    setState("watching");
    setCountdown(3);

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          submitAdWatch();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function submitAdWatch() {
    try {
      const res = await fetch("/api/ad/watch", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setState("done");
        setMessage(
          `🎉 You're in! Today's pool: $${(data.pool ?? 0).toFixed(4)} | ${data.viewCount} entries`
        );
        onAdWatched();
      } else {
        setState("error");
        setMessage(data.error || "Failed to record ad view");
      }
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const ad = adVariants[adContent];

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 mb-6 text-center">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-64 mx-auto mb-6"></div>
          <div className="h-12 bg-gray-200 rounded-xl w-48 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (state === "watching") {
    return (
      <div className="bg-white rounded-2xl p-8 mb-6 text-center fade-in">
        <h2 className="text-xl font-bold text-gray-800 mb-2">🎬 Watching Ad...</h2>
        <p className="text-gray-500 text-sm mb-6">Please watch the full ad to get your entry</p>

        {/* Simulated Ad */}
        <div
          className={`bg-gradient-to-br ${ad.bg} rounded-xl p-8 mb-6 text-white shadow-lg`}
        >
          <div className="text-3xl font-bold mb-2">{ad.brand}</div>
          <div className="text-lg text-white/90">{ad.tagline}</div>
          <div className="mt-4 text-sm text-white/60">Sponsored Advertisement</div>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white countdown-pulse"
            style={{
              background: "linear-gradient(135deg, #9333ea 0%, #ec4899 100%)",
            }}
          >
            {countdown}
          </div>
          <p className="text-gray-600">seconds remaining</p>
        </div>
      </div>
    );
  }

  if (state === "done" || watchedToday) {
    return (
      <div className="bg-white rounded-2xl p-8 mb-6 text-center fade-in">
        <div className="text-5xl mb-4">🎟️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">You&apos;re Entered!</h2>
        {message && (
          <p className="text-purple-600 font-medium mb-3 text-sm">{message}</p>
        )}
        <p className="text-gray-600 text-sm mb-2">
          {poolDrawn
            ? "Today's lottery has been drawn! Check your earnings above."
            : "You're in today's lottery! Winners are announced at midnight."}
        </p>
        <p className="text-gray-400 text-xs">Come back tomorrow to watch another ad</p>

        <div className="mt-4 p-4 bg-purple-50 rounded-xl">
          <p className="text-purple-700 text-sm">
            💡 <strong>How winners are selected:</strong> At the end of each day, random winners
            from all entrants split 70% of the day&apos;s ad revenue pool.
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-white rounded-2xl p-8 mb-6 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h2>
        <p className="text-red-500 text-sm mb-6">{message}</p>
        <button
          onClick={() => setState("idle")}
          className="px-6 py-3 text-white font-semibold rounded-xl"
          style={{
            background: "linear-gradient(135deg, #9333ea 0%, #ec4899 100%)",
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-8 mb-6 text-center">
      <div className="text-4xl mb-3">🎬</div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Watch an ad</h2>
      <p className="text-gray-500 mb-6">
        Watch one ad per day and get entered into the daily lottery to win real money!
      </p>

      {poolDrawn ? (
        <div className="text-center">
          <div className="text-5xl mb-3">🔒</div>
          <p className="text-gray-600 mb-2">Today&apos;s lottery has already been drawn.</p>
          <p className="text-gray-400 text-sm">Come back tomorrow!</p>
        </div>
      ) : (
        <button
          onClick={startWatching}
          className="px-8 py-4 text-white font-bold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #9333ea 0%, #ec4899 100%)",
          }}
        >
          Watch Ad Now
        </button>
      )}
    </div>
  );
}
