"use client";

import { useEffect, useRef } from "react";

// Google IMA type stubs — full types live in @types/google.ima if needed
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }
}

interface Props {
  /** Called when the ad finishes, is skipped, or fails (so the timer can proceed). */
  onReady: () => void;
}

// Default test VAST tag from Google — always serves a real video ad, no account needed.
// Replace with NEXT_PUBLIC_VAST_TAG_URL env var to use your own ad network.
const TEST_VAST_TAG =
  "https://pubads.g.doubleclick.net/gampad/ads" +
  "?iu=/21775744923/external/single_ad_samples" +
  "&sz=640x480&cust_params=sample_ct%3Dlinear" +
  "&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast" +
  "&unviewed_position_start=1&env=vp&impl=s&correlator=";

export default function VideoAdPlayer({ onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    function init() {
      try {
        const ima = window.google?.ima;
        if (!ima || !videoRef.current || !adContainerRef.current) {
          onReady();
          return;
        }

        const adDisplayContainer = new ima.AdDisplayContainer(
          adContainerRef.current,
          videoRef.current
        );

        const adsLoader = new ima.AdsLoader(adDisplayContainer);

        adsLoader.addEventListener(
          ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (e: any) => {
            try {
              const mgr = e.getAdsManager(videoRef.current);
              const done = () => { try { mgr.destroy(); } catch {} onReady(); };
              mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, done);
              mgr.addEventListener(ima.AdEvent.Type.SKIPPED, done);
              adDisplayContainer.initialize();
              mgr.init(640, 360, ima.ViewMode.NORMAL);
              mgr.start();
            } catch {
              onReady();
            }
          }
        );

        adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_LOAD_ERROR, () => onReady());

        const req = new ima.AdsRequest();
        req.adTagUrl = process.env.NEXT_PUBLIC_VAST_TAG_URL ?? TEST_VAST_TAG;
        req.linearAdSlotWidth = 640;
        req.linearAdSlotHeight = 360;
        adsLoader.requestAds(req);
      } catch {
        onReady();
      }
    }

    // If IMA SDK already loaded (preloaded in layout), init immediately.
    // Otherwise load it now.
    if (window.google?.ima) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
      script.async = true;
      script.onload = init;
      script.onerror = () => onReady();
      document.head.appendChild(script);
    }
  }, [onReady]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: "16/9" }}
    >
      {/* Actual content / fallback background */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <span className="text-white/30 text-sm">Loading ad…</span>
      </div>

      {/* IMA renders into these two elements */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        playsInline
      />
      <div
        ref={adContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: "pointer" }}
      />
    </div>
  );
}
