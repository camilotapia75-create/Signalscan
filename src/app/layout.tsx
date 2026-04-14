import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { auth } from "@/lib/auth";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Ad Lottery - Watch Ads, Win Real Money",
  description: "Watch one ad per day and get entered into the daily lottery to win real money!",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  return (
    <html lang="en">
      <head>
        {adsenseClient && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
