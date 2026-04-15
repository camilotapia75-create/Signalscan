"use client";

import { useState, useEffect, useRef } from "react";

interface AdWatcherProps {
  watchedToday: boolean;
  poolDrawn: boolean;
  onAdWatched: () => void;
  loading: boolean;
}

type WatchState = "idle" | "watching" | "done" | "error";

// Simulated ad fallback variants (shown when AdSense is not configured)
const FALLBACK_ADS = [
  { brand: "🚀 TechStart Pro", tagline: "Launch your startup faster", bg: "from-blue-500 to-indigo-600" },
  { brand: "🌿 GreenEarth Foods", tagline: "Healthy choices, happy life", bg: "from-green-500 to-emerald-600" },
  { brand: "🎮 GameZone Elite", tagline: "Play more, win more", bg: "from-purple-500 to-violet-600" },
  { brand: "💄 Luxe Beauty", tagline: "Look your absolute best", bg: "from-pink-500 to-rose-600" },
  { brand: "🏠 HomeNest Decor", tagline: "Transform your living space", bg: "from-amber-500 to-orange-600" },
];

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

function RealAd() {
  const adRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!pushed.current && adRef.current) {
      pushed.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.warn("AdSense push error:", e);
      }
    }
  }, []);

  return (
    <div ref={adRef} className="w-full min-h-[200px] flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%", minHeight: "200px" }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT}
        data-ad-slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT}
        data-ad-format="rectangle"
        data-full-width-responsive="true"
      />
    </div>
  );
}

// Generic script-based ad (PropellerAds, Adsterra, etc.)
// Set NEXT_PUBLIC_AD_SCRIPT_SRC to the script URL from your ad provider
// Set NEXT_PUBLIC_AD_CONTAINER_ID to the div id they specify (if any)
function ScriptAd() {
  const scriptSrc = process.env.NEXT_PUBLIC_AD_SCRIPT_SRC!;
  const containerId = process.env.NEXT_PUBLIC_AD_CONTAINER_ID;
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = scriptSrc;
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, [scriptSrc]);

  return (
    <div
      className="w-full min-h-[200px] flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200 overflow-hidden"
    >
      <div id={containerId ?? "ad-container"} style={{ width: "100%", minHeight: "200px" }} />
    </div>
  );
}

function FallbackAd({ index }: { index: number }) {
  const ad = FALLBACK_ADS[index % FALLBACK_ADS.length];
  return (
    <div className={`bg-gradient-to-br ${ad.bg} rounded-xl p-10 text-white text-center shadow-lg`}>
      <div className="text-3xl font-bold mb-2">{ad.brand}</div>
      <div className="text-lg text-white/90">{ad.tagline}</div>
      <div className="mt-4 text-xs text-white/50 uppercase tracking-widest">Advertisement</div>
    </div>
  );
}

export default function AdWatcher({ watchedToday, poolDrawn, onAdWatched, loading }: AdWatcherProps) {
  const [state, setState] = useState<WatchState>("idle");
  const [countdown, setCountdown] = useState(5);
  const [message, setMessage] = useState("");
  const [adIndex] = useState(() => Math.floor(Math.random() * FALLBACK_ADS.length));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAdSense = !!(
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT &&
    process.env.NEXT_PUBLIC_ADSENSE_SLOT
  );
  const hasScriptAd = !!process.env.NEXT_PUBLIC_AD_SCRIPT_SRC;
  const hasRealAds = hasAdSense || hasScriptAd;

  // Slightly longer watch time for real ads
  const watchSeconds = hasRealAds ? 8 : 5;

  function startWatching() {
    setState("watching");
    setCountdown(watchSeconds);

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
          `🎉 You're entered! Pool: $${(data.pool ?? 0).toFixed(4)} · ${data.viewCount} entries today`
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 mb-6 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48 mx-auto" />
          <div className="h-4 bg-gray-200 rounded w-64 mx-auto" />
          <div className="h-12 bg-gray-200 rounded-xl w-48 mx-auto" />
        </div>
      </div>
    );
  }

  if (state === "watching") {
    return (
      <div className="bg-white rounded-2xl p-6 mb-6 fade-in">
        <h2 className="text-xl font-bold text-gray-800 text-center mb-1">🎬 Watching Ad…</h2>
        <p className="text-gray-400 text-sm text-center mb-4">Keep this window open to earn your entry</p>

        {hasAdSense ? (
          <RealAd />
        ) : hasScriptAd ? (
          <iframe
            src="/ad-frame"
            title="Advertisement"
            style={{ width: "100%", height: "250px", border: "none", borderRadius: "12px", display: "block" }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <FallbackAd index={adIndex} />
        )}

        <div className="flex items-center justify-center gap-3 mt-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white countdown-pulse"
            style={{ background: "linear-gradient(135deg,#9333ea,#ec4899)" }}
          >
            {countdown}
          </div>
          <span className="text-gray-500 text-sm">seconds left — don&apos;t close this tab</span>
        </div>
      </div>
    );
  }

  if (state === "done" || watchedToday) {
    return (
      <div className="bg-white rounded-2xl p-8 mb-6 text-center fade-in">
        <div className="text-5xl mb-4">🎟️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">You&apos;re Entered!</h2>
        {message && <p className="text-purple-600 font-medium text-sm mb-3">{message}</p>}
        <p className="text-gray-500 text-sm mb-2">
          {poolDrawn
            ? "Today's lottery has been drawn — check your earnings above."
            : "Winners are picked at midnight. Good luck! 🤞"}
        </p>
        <p className="text-gray-400 text-xs mb-4">Come back tomorrow to watch another ad</p>

        <div className="bg-purple-50 rounded-xl p-4 text-left">
          <p className="text-purple-700 text-sm">
            <strong>How winners are paid:</strong> At midnight, random winners share 70% of the
            day&apos;s ad revenue via PayPal. Make sure your{" "}
            <a href="/profile" className="underline font-semibold">PayPal email is set</a> so we
            can send your prize automatically.
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    const isUnauth = message.toLowerCase().includes("unauthorized");
    return (
      <div className="bg-white rounded-2xl p-8 mb-6 text-center">
        <div className="text-5xl mb-4">{isUnauth ? "🔐" : "⚠️"}</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {isUnauth ? "Session expired" : "Something went wrong"}
        </h2>
        <p className="text-red-500 text-sm mb-6">
          {isUnauth ? "Please refresh the page and try again." : message}
        </p>
        <button
          onClick={() => isUnauth ? window.location.reload() : setState("idle")}
          className="px-6 py-3 text-white font-semibold rounded-xl"
          style={{ background: "linear-gradient(135deg,#9333ea,#ec4899)" }}
        >
          {isUnauth ? "Refresh Page" : "Try Again"}
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
        <div>
          <div className="text-5xl mb-3">🔒</div>
          <p className="text-gray-600 mb-1">Today&apos;s lottery has already been drawn.</p>
          <p className="text-gray-400 text-sm">Come back tomorrow!</p>
        </div>
      ) : (
        <button
          onClick={startWatching}
          className="px-8 py-4 text-white font-bold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(135deg,#9333ea,#ec4899)" }}
        >
          Watch Ad Now
        </button>
      )}
    </div>
  );
}
