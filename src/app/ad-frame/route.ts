import { NextResponse } from "next/server";

// Standalone HTML page served inside an iframe in the Watch Ad section.
// Running Monetag scripts here confines their rendered ads to this iframe's
// viewport, so they appear inside the watching-section box rather than floating
// over the whole browser window.
export function GET() {
  const scriptSrc = process.env.NEXT_PUBLIC_AD_SCRIPT_SRC ?? "";
  const zoneId = process.env.NEXT_PUBLIC_AD_ZONE_ID ?? "";

  const scriptTag = scriptSrc
    ? `<script async data-cfasync="false" data-zone="${zoneId}" src="${scriptSrc}"></script>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: linear-gradient(135deg, #f3e8ff 0%, #fce7f3 100%);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, sans-serif; overflow: hidden;
    }
    .badge {
      position: absolute; top: 8px; right: 10px;
      font-size: 10px; color: #a855f7; opacity: 0.6; letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .center {
      text-align: center; color: #9333ea;
    }
    .center .icon { font-size: 36px; margin-bottom: 8px; }
    .center p { font-size: 13px; opacity: 0.7; }
  </style>
</head>
<body>
  <span class="badge">Ad</span>
  <div class="center">
    <div class="icon">📺</div>
    <p>Your ad is loading…</p>
  </div>
  ${scriptTag}
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
