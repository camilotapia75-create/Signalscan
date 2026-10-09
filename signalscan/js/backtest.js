// ── Backtest ─────────────────────────────────────────────────────────────────
// Replays the Golden Bull strategy over years of history instead of collecting
// a few dozen trades forward.
//
// Why this exists: a 14-day large-cap return has roughly 5% standard deviation.
// Detecting a 0.3%/trade edge at 95% confidence therefore needs ~1,000 trades.
// Forward collection produces ~25/month, so the live reports could never answer
// the question — with ~50 trades the smallest detectable edge is ~1.4%/trade,
// about 43% annualised. A decade of history gives thousands of trades, which is
// enough to actually know.
//
// Correctness rules followed here:
//   * No look-ahead. Every indicator at bar i is computed only from bars <= i,
//     and a trade entered on bar i fills at bar i's close.
//   * Costs are charged. Idealised fills are how backtests lie.
//   * Train/test split. Parameters were chosen by looking at recent markets, so
//     an in-sample result proves nothing on its own.

// ── Causal indicator series (value at i uses only bars 0..i) ──────────────────

function btEMA(src, period) {
  const out = new Array(src.length).fill(null);
  if (src.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += src[i];
  let ema = sum / period;
  out[period - 1] = ema;
  const k = 2 / (period + 1);
  for (let i = period; i < src.length; i++) { ema = src[i] * k + ema * (1 - k); out[i] = ema; }
  return out;
}

function btRSI(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
  let ag = g / period, al = l / period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

function btMACD(closes) {
  const e12 = btEMA(closes, 12), e26 = btEMA(closes, 26);
  const line = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const firstIdx = line.findIndex(v => v != null);
  const dense = firstIdx < 0 ? [] : line.slice(firstIdx).map(v => v ?? 0);
  const sigDense = btEMA(dense, 9);
  const signal = new Array(closes.length).fill(null);
  for (let i = 0; i < sigDense.length; i++) if (sigDense[i] != null) signal[firstIdx + i] = sigDense[i];
  return closes.map((_, i) => (line[i] != null && signal[i] != null)
    ? { macd: line[i], signal: signal[i], histogram: line[i] - signal[i] } : null);
}

function btBB(closes, period = 20) {
  const out = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const w = closes.slice(i - period + 1, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    const upper = m + 2 * sd, lower = m - 2 * sd;
    out[i] = { upper, lower, middle: m, mean: m,
               pctB: upper === lower ? 0.5 : (closes[i] - lower) / (upper - lower),
               bandwidth: m ? (upper - lower) / m : 0 };
  }
  return out;
}

function btStoch(highs, lows, closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  const raw = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const hi = Math.max(...highs.slice(i - period + 1, i + 1));
    const lo = Math.min(...lows.slice(i - period + 1, i + 1));
    raw[i] = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
  }
  for (let i = period + 1; i < closes.length; i++) {
    if (raw[i] == null || raw[i - 1] == null || raw[i - 2] == null) continue;
    out[i] = { k: raw[i], d: (raw[i] + raw[i - 1] + raw[i - 2]) / 3 };
  }
  return out;
}

function btATR(highs, lows, closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  const tr = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  let sum = 0, count = 0;
  for (let i = 1; i < closes.length; i++) {
    sum += tr[i]; count++;
    if (count > period) { sum -= tr[i - period]; count = period; }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

function btOBV(closes, volumes) {
  const arr = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const v = volumes[i] || 0;
    arr[i] = arr[i - 1] + (closes[i] > closes[i - 1] ? v : closes[i] < closes[i - 1] ? -v : 0);
  }
  return arr;
}

function btVolRatio(volumes, period = 20) {
  const out = new Array(volumes.length).fill(null);
  for (let i = period; i < volumes.length; i++) {
    const avg = volumes.slice(i - period, i).reduce((a, b) => a + (b || 0), 0) / period;
    out[i] = avg > 0 ? (volumes[i] || 0) / avg : 1;
  }
  return out;
}

// ── Strategy replay for one ticker ───────────────────────────────────────────
// Mirrors quickAnalyzeForScan: identical hard gates, identical scoring, and the
// same requirement that both analysis engines independently read BULLISH.

function btSignalDays(bars, spyCloses, opts) {
  const { closes, highs, lows, volumes } = bars;
  const n = closes.length;
  const ema9 = btEMA(closes, 9), ema20 = btEMA(closes, 20), ema21 = btEMA(closes, 21);
  const ema50 = btEMA(closes, 50), ema200 = btEMA(closes, 200);
  const rsiS = btRSI(closes), macdS = btMACD(closes), bbS = btBB(closes);
  const stochS = btStoch(highs, lows, closes), atrS = btATR(highs, lows, closes);
  const obvS = btOBV(closes, volumes), volR = btVolRatio(volumes);

  const W = Object.assign({
    ema_full_stack: 3, ema_partial: 1, ema200_above: 2, rsi_momentum: 3, rsi_dip: 1,
    macd_positive: 2, extension_healthy: 2, extension_over: -2, obv_rising: 2,
    volume_expanding: 1, spy_outperform: 2, spy_underperform: -1,
    bb_constructive: 1, bb_extended: -1,
  }, opts.weights || {});
  const maxScore = Math.max(W.ema_full_stack, W.ema_partial, 0)
    + Math.max(0, W.ema200_above) + Math.max(W.rsi_momentum, W.rsi_dip, 0)
    + Math.max(0, W.macd_positive) + Math.max(0, W.extension_healthy)
    + Math.max(0, W.obv_rising) + Math.max(0, W.volume_expanding)
    + Math.max(0, W.spy_outperform) + Math.max(0, W.bb_constructive);
  const threshold = maxScore * 0.56;

  const out = [];
  const START = 210;  // EMA200 needs history before anything is meaningful

  for (let i = START; i < n; i++) {
    const price = closes[i];
    if (!price || price < 2) continue;
    const e9 = ema9[i], e21 = ema21[i], e50 = ema50[i], e200 = ema200[i];
    const rsi = rsiS[i], macd = macdS[i], bb = bbS[i];
    if (e9 == null || e21 == null || e50 == null || rsi == null || bb == null) continue;

    // Hard gates
    if (price < e50) continue;
    if (rsi > 76) continue;
    if (i >= 70 && ema50[i - 20] != null && e50 < ema50[i - 20] * 0.998) continue;

    // Weighted score
    let score = 0;
    if (e9 > e21 && e21 > e50) score += W.ema_full_stack;
    else if (e9 > e21)         score += W.ema_partial;
    if (e200 != null && price > e200) score += W.ema200_above;
    if (rsi >= 48 && rsi <= 65)      score += W.rsi_momentum;
    else if (rsi >= 38 && rsi < 48)  score += W.rsi_dip;
    if (macd && macd.macd > 0)       score += W.macd_positive;
    const ext = (price - e50) / e50 * 100;
    if (ext <= 15)      score += W.extension_healthy;
    else if (ext > 25)  score += W.extension_over;
    if (i >= 10 && obvS[i] > obvS[i - 10]) score += W.obv_rising;
    if (i >= 25) {
      const rv = volumes.slice(i - 4, i + 1).reduce((a, b) => a + (b || 0), 0) / 5;
      const av = volumes.slice(i - 24, i - 4).reduce((a, b) => a + (b || 0), 0) / 20;
      if (av > 0 && rv > av * 1.15) score += W.volume_expanding;
    }
    if (spyCloses && i >= 20 && spyCloses[i] != null && spyCloses[i - 20] != null) {
      const spyRet = (spyCloses[i] - spyCloses[i - 20]) / spyCloses[i - 20] * 100;
      const tkrRet = (price - closes[i - 20]) / closes[i - 20] * 100;
      if (tkrRet > spyRet + 3)      score += W.spy_outperform;
      else if (tkrRet < spyRet - 5) score += W.spy_underperform;
    }
    if (price > bb.mean && price < bb.upper) score += W.bb_constructive;
    else if (price > bb.upper)               score += W.bb_extended;

    if (score < threshold) continue;

    // Dual-engine agreement — the Golden Bull contract
    if (opts.requireDualEngine !== false) {
      const stoch = stochS[i], atr = atrS[i];
      if (!stoch || atr == null || ema20[i] == null) continue;
      const lo = Math.max(0, i - 120);
      const win = {
        closes: closes.slice(lo, i + 1), highs: highs.slice(lo, i + 1),
        lows: lows.slice(lo, i + 1), volumes: volumes.slice(lo, i + 1),
      };
      const indData = {
        rsi, macd, bb, stoch, atr,
        obv: { obv: obvS[i], trend: obvS[i] > obvS[Math.max(0, i - 10)] ? 'RISING' : 'FALLING' },
        volRatio: volR[i] ?? 1, ema20: ema20[i], ema50: e50, lastClose: price,
      };
      try {
        const sr = findSupportResistance(win.highs, win.lows, win.closes);
        const pa = analyzePriceAction(win);
        const rev  = generateAnalysis('X', indData, sr, pa);
        const cont = generateContinuationAnalysis('X', indData, sr, pa);
        if (rev.bias !== 'BULLISH' || cont.bias !== 'BULLISH') continue;
      } catch (_) { continue; }
    }

    out.push({ i, price, score });
  }
  // ema21/atr come back with the signals so exit rules can be evaluated later
  // without replaying every indicator a second time.
  return { signals: out, ema21, atr: atrS };
}

// ── Portfolio replay over all signals ────────────────────────────────────────

// ── Portfolio replay ─────────────────────────────────────────────────────────
// Exit rules matter at least as much as entry rules, and a fixed clock is the
// worst of them for a trend strategy: it sells winners mid-move and sits in
// cash while the market compounds. These alternatives all have a reason behind
// them rather than being parameters found by searching.
//
//   fixed  — original: sell after N days no matter what
//   trend  — hold while the trend holds, exit when price closes below EMA21
//   trail  — trend exit plus an ATR trailing stop to cap give-back
//
// regimeFilter skips new entries when the index itself is below its own 200-day
// average. A long-only strategy cannot beat a falling market; it can only
// decline to participate.

function btPortfolio(allSignals, barsByTicker, dates, spyCloses, opts) {
  const { capital, slots, holdDays, costBps } = opts;
  const exitMode  = opts.exitMode  || 'fixed';
  const maxHold   = opts.maxHold   || 250;
  const trailAtr  = opts.trailAtr  || 2.5;
  const spyEma200 = opts.spyEma200 || null;
  const positionSize = capital / slots;
  const cost = (costBps || 0) / 10000;

  const byDay = new Map();
  for (const s of allSignals) {
    if (!byDay.has(s.i)) byDay.set(s.i, []);
    byDay.get(s.i).push(s);
  }

  let cash = capital;
  const open = [], trades = [], curve = [];
  let skipped = 0, blockedByRegime = 0;

  const px = (tk, i) => barsByTicker[tk]?.closes?.[i] ?? null;

  for (let i = 0; i < dates.length; i++) {
    // ── Exits ──
    for (let k = open.length - 1; k >= 0; k--) {
      const o = open[k];
      const price = px(o.ticker, i);
      if (price == null || i <= o.entryIdx) continue;
      if (price > o.highWater) o.highWater = price;

      const held = i - o.entryIdx;
      let exit = false;
      if (exitMode === 'fixed') {
        exit = held >= holdDays;
      } else {
        const e21 = o.ema21?.[i];
        if (e21 != null && price < e21) exit = true;            // trend broke
        if (!exit && exitMode === 'trail') {
          const a = o.atr?.[i];
          if (a != null && price < o.highWater - trailAtr * a) exit = true;
        }
        if (!exit && held >= maxHold) exit = true;               // backstop
      }
      if (i === dates.length - 1) exit = true;                   // close the book

      if (!exit) continue;
      const proceeds = o.shares * price * (1 - cost);
      cash += proceeds;
      const ret = (proceeds - positionSize) / positionSize;
      // What the index did over this trade's exact days. Holding anything for
      // 144 days in a rising market earns a positive return by construction, so
      // testing raw returns against zero measures market exposure, not skill.
      const sIn = spyCloses[o.entryIdx], sOut = spyCloses[i];
      const spyRet = (sIn && sOut) ? (sOut - sIn) / sIn : 0;
      // Benchmark each trade against the UNIVERSE over the same days, not the
      // index. Beating SPY while picking from a basket that beat SPY is not
      // stock selection — it is owning the basket.
      const bc = opts.benchCurve;
      const bIn = bc?.[o.entryIdx], bOut = bc?.[i];
      const uniRet = (bIn && bOut) ? (bOut - bIn) / bIn : spyRet;
      trades.push({ ticker: o.ticker, entryIdx: o.entryIdx, exitIdx: i, held,
                    ret, spyRet, uniRet, excess: ret - uniRet, excessSpy: ret - spyRet });
      open.splice(k, 1);
    }

    // ── Entries ──
    const regimeOk = !opts.regimeFilter || !spyEma200 ||
                     (spyCloses[i] != null && spyEma200[i] != null && spyCloses[i] > spyEma200[i]);
    const todays = (byDay.get(i) || []).sort((a, b) => b.score - a.score);
    for (const sig of todays) {
      if (!regimeOk) { blockedByRegime++; continue; }
      if (open.length >= slots || cash + 1e-9 < positionSize) { skipped++; continue; }
      if (open.some(o => o.ticker === sig.ticker)) continue;     // no doubling up
      const entryPx = sig.price * (1 + cost);
      cash -= positionSize;
      open.push({ ticker: sig.ticker, shares: positionSize / entryPx, entryIdx: i,
                  highWater: sig.price, ema21: sig.ema21, atr: sig.atr });
    }

    let mv = 0;
    for (const o of open) {
      const p2 = px(o.ticker, i);
      mv += p2 != null ? o.shares * p2 : positionSize;
    }
    curve.push(cash + mv);
  }

  const equity = curve[curve.length - 1];
  const rets = trades.map(t => t.ret);
  const exc  = trades.map(t => t.excess);
  const n = rets.length;
  const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;

  // Significance is tested on EXCESS return over the index across the same days.
  // That is the only null that distinguishes skill from simply being invested.
  const mExc = n ? exc.reduce((a, b) => a + b, 0) / n : 0;
  const sdExc = n > 1 ? Math.sqrt(exc.reduce((a, b) => a + (b - mExc) ** 2, 0) / (n - 1)) : 0;
  // Long holds overlap in time and share the same market, so trades are not
  // independent draws. Haircut the effective sample by the average overlap
  // rather than pretending each trade is fresh information.
  const avgHoldRaw = n ? trades.reduce((a, t) => a + t.held, 0) / n : 1;
  const effN = Math.max(1, Math.min(n, dates.length / Math.max(1, avgHoldRaw)));
  const tStat = (n > 1 && sdExc > 0) ? mExc / (sdExc / Math.sqrt(effN)) : 0;
  const pValue = 2 * (1 - btNormCdf(Math.abs(tStat)));

  let peak = curve[0], maxDD = 0;
  for (const v of curve) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > maxDD) maxDD = dd; }

  const dailyRet = [];
  for (let i = 1; i < curve.length; i++) dailyRet.push(curve[i] / curve[i - 1] - 1);
  const dm = dailyRet.length ? dailyRet.reduce((a, b) => a + b, 0) / dailyRet.length : 0;
  const dsd = dailyRet.length > 1
    ? Math.sqrt(dailyRet.reduce((a, b) => a + (b - dm) ** 2, 0) / (dailyRet.length - 1)) : 0;
  const sharpe = dsd > 0 ? (dm / dsd) * Math.sqrt(252) : 0;

  const years = dates.length / 252;
  const cagr = years > 0 && equity > 0 ? (Math.pow(equity / capital, 1 / years) - 1) * 100 : 0;
  const spyStart = spyCloses.find(v => v != null), spyEnd = [...spyCloses].reverse().find(v => v != null);
  const spyEquity = (spyStart && spyEnd) ? capital * (spyEnd / spyStart) : null;
  const spyCagr = (spyEquity && years > 0) ? (Math.pow(spyEquity / capital, 1 / years) - 1) * 100 : null;

  // How much of the time capital was actually at work — cash drag is invisible
  // in per-trade statistics but shows up directly in CAGR.
  const avgHold = n ? trades.reduce((a, t) => a + t.held, 0) / n : 0;
  const exposure = Math.min(100, (n * avgHold) / (dates.length * slots) * 100);

  return {
    equity, capital, totalReturn: (equity - capital) / capital * 100, cagr,
    spyEquity, spyCagr,
    trades: n, winRate: n ? Math.round(rets.filter(r => r > 0).length / n * 100) : 0,
    avgTrade: mean * 100, sdTrade: sd * 100, tStat, pValue,
    avgExcess: mExc * 100, effN: Math.round(effN),
    maxDrawdown: maxDD * 100, sharpe, skipped, blockedByRegime, years,
    avgHold, exposure, curve,
  };
}

function btNormCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// ── Runner ───────────────────────────────────────────────────────────────────

let _btCancel = false;

// Tickers list different histories (listings, halts). Project every series onto
// SPY's trading calendar so day i means the same date for every symbol.
function btAlign(src, srcTs, calendar) {
  const out = new Array(calendar.length).fill(null);
  let j = 0;
  for (let i = 0; i < calendar.length; i++) {
    while (j < srcTs.length && srcTs[j] < calendar[i]) j++;
    out[i] = (j < srcTs.length && srcTs[j] === calendar[i]) ? src[j] : null;
  }
  return out;
}

async function btFetch(ticker, years, attempt = 0) {
  const range = years >= 10 ? '10y' : years >= 5 ? '5y' : '2y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    // A burst of ~200 requests can trip Yahoo's rate limiter. Without a retry
    // those tickers vanish silently and the backtest quietly runs on a smaller,
    // biased universe — so back off and try again before giving up.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt)));
      return btFetch(ticker, years, attempt + 1);
    }
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r?.timestamp || !q?.close) return null;
    const ts = [], closes = [], highs = [], lows = [], volumes = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      if (q.close[i] == null) continue;
      ts.push(Math.floor(r.timestamp[i] / 86400) * 86400);
      closes.push(q.close[i]);
      highs.push(q.high?.[i] ?? q.close[i]);
      lows.push(q.low?.[i] ?? q.close[i]);
      volumes.push(q.volume?.[i] ?? 0);
    }
    return closes.length > 250 ? { ts, closes, highs, lows, volumes } : null;
  } catch (_) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt)));
      return btFetch(ticker, years, attempt + 1);
    }
    return null;
  }
}

async function runBacktest() {
  const btn = document.getElementById('btRunBtn');
  const statusEl = document.getElementById('btStatus');
  const out = document.getElementById('btResults');
  if (!out) return;

  const years    = parseInt(document.getElementById('btYears')?.value, 10) || 10;
  const capital  = parseFloat(document.getElementById('btCapital')?.value) || 10000;
  const slots    = parseInt(document.getElementById('btSlots')?.value, 10) || 10;
  const holdDays = parseInt(document.getElementById('btHold')?.value, 10) || 14;
  const costBps  = parseFloat(document.getElementById('btCost')?.value);

  _btCancel = false;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ RUNNING...'; }
  const setStatus = t => { if (statusEl) statusEl.textContent = t; };

  try {
    setStatus('FETCHING SPY CALENDAR');
    const spy = await btFetch('SPY', years);
    if (!spy) { out.innerHTML = '<div class="bt-err">Could not load SPY history — market data unavailable.</div>'; return; }
    const calendar = spy.ts;

    const groundSel = document.getElementById('btUniverse')?.value || 'mega';
    const universe = (groundSel === 'small'
      ? SMALLCAP_UNIVERSE
      : [...new Set([...SCAN_UNIVERSE_CORE, ...ROTATION_POOL])]
    ).filter(t => !t.endsWith('-USD'));   // crypto has no comparable history here

    const barsByTicker = {};
    let done = 0, idx = 0;
    const worker = async () => {
      while (idx < universe.length && !_btCancel) {
        const tk = universe[idx++];
        const d = await btFetch(tk, years);
        if (d) {
          barsByTicker[tk] = {
            closes:  btAlign(d.closes,  d.ts, calendar),
            highs:   btAlign(d.highs,   d.ts, calendar),
            lows:    btAlign(d.lows,    d.ts, calendar),
            volumes: btAlign(d.volumes, d.ts, calendar),
          };
        }
        done++;
        setStatus(`LOADING HISTORY ${done}/${universe.length}`);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (_btCancel) { setStatus('CANCELLED'); return; }

    const tickers = Object.keys(barsByTicker);
    const coverage = Math.round(tickers.length / universe.length * 100);
    if (tickers.length < 20) {
      out.innerHTML = `<div class="bt-err">Only ${tickers.length} of ${universe.length} tickers loaded — market data is being rate-limited. Wait a minute and try again.</div>`;
      return;
    }
    if (coverage < 70) {
      console.warn(`[backtest] only ${tickers.length}/${universe.length} tickers loaded (${coverage}%) — results cover a partial universe`);
    }

    // Forward-fill gaps so indicators do not see holes
    const spyCloses = btAlign(spy.closes, spy.ts, calendar);
    for (const tk of tickers) {
      const b = barsByTicker[tk];
      for (const key of ['closes', 'highs', 'lows', 'volumes']) {
        let last = null;
        for (let i = 0; i < b[key].length; i++) {
          if (b[key][i] == null) b[key][i] = last; else last = b[key][i];
        }
      }
    }

    setStatus('REPLAYING STRATEGY');
    const allSignals = [];
    for (let t = 0; t < tickers.length; t++) {
      const tk = tickers[t];
      const b = barsByTicker[tk];
      if (b.closes.findIndex(v => v != null) < 0) continue;
      const first = b.closes.findIndex(v => v != null);
      if (first > calendar.length - 300) continue;
      const res = btSignalDays(b, spyCloses, { requireDualEngine: true });
      for (const sg of res.signals) allSignals.push({ ...sg, ticker: tk, ema21: res.ema21, atr: res.atr });
      if (t % 10 === 0) { setStatus(`REPLAYING ${t}/${tickers.length} · ${allSignals.length} signals`); await new Promise(r => setTimeout(r, 0)); }
    }
    allSignals.sort((a, b) => a.i - b.i);

    if (!allSignals.length) {
      out.innerHTML = '<div class="bt-err">The strategy produced zero signals over this period.</div>';
      return;
    }

    // Only the later, unseen window is evidence.
    const splitIdx = Math.floor(calendar.length * 0.6);
    const spyEma200 = btEMA(spyCloses.map(v => v ?? 0), 200);

    // A SMALL, PRE-SPECIFIED family of hypotheses — not a search. Each one is
    // here because there is a mechanical reason to think it matters, decided
    // before seeing any result. Four tests is a family loose enough to reason
    // about; four hundred would guarantee a false winner.
    const configs = [
      { key: 'fixed',       name: `Fixed ${holdDays}-day exit (original)`,
        why: 'Sells on a clock regardless of what the trade is doing.',
        opts: { exitMode: 'fixed' } },
      { key: 'trend',       name: 'Exit on trend break (close < EMA21)',
        why: 'Lets winners run and cuts the trade when the trend actually ends.',
        opts: { exitMode: 'trend' } },
      { key: 'trend+reg',   name: 'Trend exit + market regime filter',
        why: 'Also stops opening new positions while the index is below its 200-day average.',
        opts: { exitMode: 'trend', regimeFilter: true } },
      { key: 'trail+reg',   name: 'Trend exit + ATR trailing stop + regime filter',
        why: 'Adds a volatility-scaled stop so open profit is not handed back.',
        opts: { exitMode: 'trail', regimeFilter: true } },
    ];

    const barsIn  = barsByTicker;              // full arrays; in-sample slices below
    const ewIn  = btEqualWeight(barsByTicker, calendar.slice(0, splitIdx));
    const base = { capital, slots, holdDays, costBps, spyEma200 };
    const sigsTest = allSignals.filter(x => x.i >= splitIdx).map(x => ({ ...x, i: x.i - splitIdx }));
    const barsTest = barsByTicker0(barsByTicker, splitIdx);
    const calTest  = calendar.slice(splitIdx);
    const spyTest  = spyCloses.slice(splitIdx);
    const emaTest  = spyEma200.slice(splitIdx);

    // Second strategy family: cross-sectional momentum. Different hypothesis
    // class entirely — relative ranking over months rather than absolute
    // technical thresholds over days — and the most replicated anomaly in the
    // literature. If even this shows nothing on this universe, the universe
    // itself (mega-cap, maximally analysed) is the binding constraint.
    const momConfigs = [
      { key: 'mom12-1',     name: 'Momentum 12-1mo, monthly rebalance',
        opts: { lookback: 252, skip: 21, rebalance: 21 } },
      { key: 'mom6-1',      name: 'Momentum 6-1mo, monthly rebalance',
        opts: { lookback: 126, skip: 21, rebalance: 21 } },
      { key: 'mom12-1+trend', name: 'Momentum 12-1mo + above own 200-day',
        opts: { lookback: 252, skip: 21, rebalance: 21, trendFilter: true } },
      { key: 'high52',  name: '52-week-high proximity (George & Hwang)',
        opts: { mode: 'high52', lookback: 252, skip: 0, rebalance: 21 } },
      { key: 'lowvol',  name: 'Lowest trailing volatility (Ang et al.)',
        opts: { mode: 'lowvol', lookback: 126, skip: 0, rebalance: 21 } },
      { key: 'reversal', name: 'Short-term reversal, 1-week losers (Lehmann)',
        opts: { mode: 'reversal', lookback: 5, skip: 0, rebalance: 5 } },
    ];

    const ewOutEarly = btEqualWeight(barsTest, calTest);
    const results = configs.map(c => {
      setStatus(`TESTING ${c.key}`);
      const inS  = btPortfolio(allSignals.filter(x => x.i < splitIdx), barsByTicker,
                               calendar.slice(0, splitIdx), spyCloses.slice(0, splitIdx),
                               { ...base, ...c.opts, spyEma200, benchCurve: ewIn?.curve });
      const outS = btPortfolio(sigsTest, barsTest, calTest, spyTest,
                               { ...base, ...c.opts, spyEma200: emaTest, benchCurve: ewOutEarly?.curve });
      return { ...c, family: 'Golden Bull', inSample: inS, outSample: outS };
    });

    for (const c of momConfigs) {
      setStatus(`TESTING ${c.key}`);
      const inS  = btMomentum(barsByTicker, calendar.slice(0, splitIdx), spyCloses.slice(0, splitIdx),
                              { ...base, ...c.opts, spyEma200, benchCurve: ewIn?.curve });
      const outS = btMomentum(barsTest, calTest, spyTest,
                              { ...base, ...c.opts, spyEma200: emaTest, benchCurve: ewOutEarly?.curve });
      results.push({ ...c, family: 'Momentum', why: '', inSample: inS, outSample: outS });
    }

    // Fair control: owning every name in this universe equally, doing nothing.
    const ewFull = ewOutEarly;
    for (const r of results) {
      r.vsControlOut = ewFull ? r.outSample.cagr - ewFull.cagr : null;
      r.vsControlIn  = ewIn   ? r.inSample.cagr  - ewIn.cagr   : null;
    }

    out.innerHTML = renderBacktest(results, allSignals.length, tickers.length, calendar, costBps, splitIdx, ewFull, ewIn);
    setStatus('');
  } catch (e) {
    out.innerHTML = `<div class="bt-err">Backtest failed: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ RUN BACKTEST'; }
  }
}

// Slice every ticker's bars so index 0 lines up with the split point
function barsByTicker0(bars, from) {
  const out = {};
  for (const tk of Object.keys(bars)) {
    out[tk] = {
      closes:  bars[tk].closes.slice(from),
      highs:   bars[tk].highs.slice(from),
      lows:    bars[tk].lows.slice(from),
      volumes: bars[tk].volumes.slice(from),
    };
  }
  return out;
}

function renderBacktest(results, signalCount, tickerCount, calendar, costBps, splitIdx, equalWeight, equalWeightIn) {
  const pc = n => (n === null || n === undefined) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  const col = n => n >= 0 ? 'var(--accent)' : 'var(--accent2)';
  const years = (calendar.length / 252).toFixed(1);
  const oosYears = ((calendar.length - splitIdx) / 252).toFixed(1);

  // Rank on out-of-sample excess return over buy-and-hold. In-sample is ignored
  // entirely — it describes the past the strategy was shaped around.
  // Beat the HARDER of the two benchmarks. Beating SPY while losing to an
  // equal-weight basket of the same universe is not skill — it is just owning
  // a basket that happened to outrun the index.
  const ewCagr = equalWeight ? equalWeight.cagr : null;
  const bench = r => Math.max(r.outSample.spyCagr ?? -999, ewCagr ?? -999);
  const scored = results.map(r => ({
    ...r,
    excess: (r.outSample.spyCagr === null) ? -999 : r.outSample.cagr - bench(r),
  })).sort((a, b) => b.excess - a.excess);
  const best = scored[0];
  const baseline = results.find(r => r.key === 'fixed');
  const benchLabel = (ewCagr !== null && ewCagr > (best?.outSample.spyCagr ?? -999))
    ? 'an equal-weight basket of the same universe' : 'the index';

  // Four hypotheses were tested, so the bar for calling any of them real has to
  // account for that. Bonferroni: 0.05 / 4.
  const ALPHA = 0.05 / results.length;
  const beats = best.excess > 0;
  const consistent = best.vsControlIn != null && best.vsControlIn > 0 && (best.vsControlOut ?? -1) > 0;
  const MIN_EFF_N = 30;   // too few independent observations to claim anything
  const thin  = best.outSample.effN < MIN_EFF_N;
  const sig   = !thin && best.outSample.pValue < ALPHA && best.outSample.avgExcess > 0;

  let level, headline, detail;
  if (beats && sig && consistent) {
    level = 'ok'; headline = 'CLEARS THE BAR IN BOTH PERIODS';
    detail = `${best.name} beat buy-and-hold by ${pc(best.excess)} a year out of sample. Its average trade beat the index by ${pc(best.outSample.avgExcess)} over the same days, p = ${best.outSample.pValue.toFixed(4)} against a corrected bar of ${ALPHA.toFixed(4)}, across ${best.outSample.effN} independent observations. Worth pursuing — and worth re-testing on a locked holdout before trusting.`;
  } else if (beats) {
    level = 'warn'; headline = 'BEST VARIANT BEATS THE MARKET, BUT NOT YET PROVEN';
    detail = `${best.name} returned ${pc(best.outSample.cagr)} a year against ${pc(best.outSample.spyCagr)} for the index. ` +
      (thin
        ? `But it only produced ${best.outSample.effN} independent observations — long, overlapping holds in one market are not ${best.outSample.trades} separate pieces of evidence. Far too thin to call.`
        : `Against the universe itself its average trade added ${pc(best.outSample.avgExcess)}, p = ${best.outSample.pValue.toFixed(3)} — above the ${ALPHA.toFixed(4)} bar required once ${results.length} hypotheses are tested, so this could still be chance.` +
          (best.vsControlIn != null
            ? ` In the earlier period it was ${best.vsControlIn > 0 ? 'also ahead of' : 'BEHIND'} the control by ${pc(Math.abs(best.vsControlIn))}.`
            : ''));
  } else {
    level = 'bad'; headline = 'NO VARIANT BEATS SIMPLY HOLDING THE INDEX';
    detail = `The best of ${results.length}, ${best.name}, returned ${pc(best.outSample.cagr)} a year out of sample against ${pc(best.outSample.spyCagr)} for the index` +
      (ewCagr !== null ? ` and ${pc(ewCagr)} for simply owning this universe equally` : '') +
      `. Two different strategy families were tested and neither cleared ${benchLabel}.`;
  }

  const delta = (baseline && best.key !== 'fixed')
    ? `<div class="bt-note" style="border:none;padding-top:0;margin-bottom:12px;">
         Against the original fixed-exit rule, the best variant changes out-of-sample CAGR from
         <strong style="color:${col(baseline.outSample.cagr)}">${pc(baseline.outSample.cagr)}</strong> to
         <strong style="color:${col(best.outSample.cagr)}">${pc(best.outSample.cagr)}</strong>,
         average holding period from ${baseline.outSample.avgHold.toFixed(0)} to ${best.outSample.avgHold.toFixed(0)} days,
         and time invested from ${baseline.outSample.exposure.toFixed(0)}% to ${best.outSample.exposure.toFixed(0)}%.
       </div>` : '';

  const row = (r, isBest) => {
    const o = r.outSample;
    return `<tr style="${isBest ? 'background:rgba(155,107,255,0.10);' : ''}">
      <td style="padding:6px 8px;"><span style="color:#555;font-size:9px;">${r.family}</span><br>${isBest ? '★ ' : ''}${r.name}</td>
      <td style="padding:6px 8px;">${o.trades.toLocaleString()}</td>
      <td style="padding:6px 8px;color:#666;">${o.avgHold.toFixed(0)}d</td>
      <td style="padding:6px 8px;color:#666;">${o.exposure.toFixed(0)}%</td>
      <td style="padding:6px 8px;font-weight:700;color:${col(o.cagr)};">${pc(o.cagr)}</td>
      <td style="padding:6px 8px;color:var(--muted);">${pc(o.spyCagr)}</td>
      <td style="padding:6px 8px;font-weight:700;color:${col(r.vsControlOut ?? 0)};">${pc(r.vsControlOut)}</td>
      <td style="padding:6px 8px;color:${col(r.vsControlIn ?? 0)};">${pc(r.vsControlIn)}</td>
      <td style="padding:6px 8px;font-weight:700;color:${col(o.avgExcess)};">${pc(o.avgExcess)}</td>
      <td style="padding:6px 8px;color:#666;">${o.effN}</td>
      <td style="padding:6px 8px;">${o.winRate}%</td>
      <td style="padding:6px 8px;color:var(--accent2);">-${o.maxDrawdown.toFixed(1)}%</td>
      <td style="padding:6px 8px;">${o.sharpe.toFixed(2)}</td>
      <td style="padding:6px 8px;${o.pValue < ALPHA ? 'color:var(--accent);font-weight:700;' : 'color:var(--muted);'}">${o.pValue < 0.0001 ? '<0.0001' : o.pValue.toFixed(4)}</td>
    </tr>`;
  };

  const inRows = results.map(r => `<tr>
      <td style="padding:4px 8px;color:#666;">${r.name}</td>
      <td style="padding:4px 8px;color:#666;">${pc(r.inSample.cagr)}</td>
      <td style="padding:4px 8px;color:#666;">${pc(r.inSample.cagr - (r.inSample.spyCagr ?? 0))}</td>
    </tr>`).join('');

  return `
    <div class="bt-verdict bt-${level}">
      <div class="bt-verdict-head">${level === 'ok' ? '✓' : '⚠'} ${headline}</div>
      <div class="bt-verdict-detail">${detail}</div>
    </div>

    <div class="bt-meta">
      ${years} years · ${oosYears}y out of sample · ${tickerCount} tickers · ${signalCount.toLocaleString()} signals ·
      ${costBps} bps per side · ${results.length} pre-specified hypotheses · significance bar ${ALPHA.toFixed(4)}
    </div>

    ${delta}

    <div style="font-size:8px;color:#555;letter-spacing:2px;margin-bottom:6px;">OUT-OF-SAMPLE — THE ONLY ROWS THAT COUNT</div>
    <table class="bt-table">
      <tr>
        <th>EXIT RULE</th><th>TRADES</th><th>AVG HOLD</th><th>INVESTED</th><th>CAGR</th>
        <th>BUY &amp; HOLD</th><th>VS CONTROL (OOS)</th><th>VS CONTROL (IN)</th><th>EXCESS/TRADE vs UNIVERSE</th><th>EFF. N</th><th>WIN%</th><th>MAX DD</th><th>SHARPE</th><th>P-VALUE</th>
      </tr>
      ${scored.map((r, i) => row(r, i === 0)).join('')}
      ${equalWeight ? `<tr style="border-top:2px solid var(--border);">
        <td style="padding:6px 8px;color:var(--gold);"><span style="color:#555;font-size:9px;">CONTROL</span><br>Own all ${equalWeight.members} names equally, do nothing</td>
        <td style="padding:6px 8px;color:#666;">0</td><td style="padding:6px 8px;color:#666;">—</td>
        <td style="padding:6px 8px;color:#666;">100%</td>
        <td style="padding:6px 8px;font-weight:700;color:var(--gold);">${pc(ewCagr)}</td>
        <td style="padding:6px 8px;color:var(--muted);">${pc(scored[0]?.outSample.spyCagr)}</td>
        <td style="padding:6px 8px;color:#666;">—</td>
        <td style="padding:6px 8px;color:#666;">—</td>
        <td style="padding:6px 8px;color:#666;">—</td>
        <td style="padding:6px 8px;color:#666;">—</td>
        <td style="padding:6px 8px;color:#666;">—</td>
        <td style="padding:6px 8px;color:var(--accent2);">-${(equalWeight.maxDrawdown ?? 0).toFixed(1)}%</td>
        <td style="padding:6px 8px;color:var(--gold);">${(equalWeight.sharpe ?? 0).toFixed(2)}</td>
        <td style="padding:6px 8px;color:#666;">no trading, no costs</td>
      </tr>` : ''}
    </table>

    <div style="font-size:8px;color:#555;letter-spacing:2px;margin:16px 0 6px;">IN-SAMPLE (SHOWN ONLY TO EXPOSE OVERFITTING)</div>
    <table class="bt-table">
      <tr><th>EXIT RULE</th><th>CAGR</th><th>VS MARKET</th></tr>
      ${inRows}
    </table>

    <div class="bt-note">
      <strong>Why these four.</strong> Each was chosen for a mechanical reason before any result was seen:
      a clock-based exit sells winners mid-trend; a trend-based exit holds while the move lasts; a regime
      filter stops buying into a falling market; a trailing stop caps give-back. That is a hypothesis test.
      Searching hundreds of parameter combinations is not — on data with no edge at all, the best of 1,000
      random variants still shows p ≈ 0.005. Because four were tested here, the significance bar is
      tightened to ${ALPHA.toFixed(4)}. <strong>INVESTED</strong> is the share of capital actually at work;
      cash drag does not show up in per-trade statistics but it does show up in CAGR.
      <strong>AVG EXCESS/TRADE</strong> is the return over the index across that trade's exact days — the
      only figure that separates skill from simply being invested, since holding anything for months in a
      rising market earns a positive return by construction. <strong>EFF. N</strong> discounts overlapping
      holds: 35 trades averaging 144 days in one market are nowhere near 35 independent observations, and
      the p-value is computed against that reduced count.
    </div>`;
}

// ── Equal-weight universe benchmark ──────────────────────────────────────────
// Comparing to SPY alone was not a fair control. This universe is tech and
// growth heavy, so if the basket itself outran the index over the decade, then
// ANY strategy drawing from it inherits that and "beats SPY" without any skill.
// The honest question is whether picking beats owning the same names equally.
function btEqualWeight(barsByTicker, dates) {
  const tickers = Object.keys(barsByTicker);
  const curve = new Array(dates.length).fill(0);
  let live = 0;
  for (const tk of tickers) {
    const c = barsByTicker[tk].closes;
    const first = c.findIndex(v => v != null);
    if (first < 0 || first > dates.length * 0.1) continue;   // must exist near the start
    live++;
    const base = c[first];
    for (let i = 0; i < dates.length; i++) {
      const v = c[i] ?? c[first];
      curve[i] += v / base;
    }
  }
  if (!live) return null;
  for (let i = 0; i < curve.length; i++) curve[i] /= live;
  const years = dates.length / 252;
  const total = curve[curve.length - 1] / curve[0];
  // The control needs its own risk numbers too. A strategy with lower CAGR but
  // materially better Sharpe is still an edge — it can be levered to match.
  let peak = curve[0], maxDD = 0;
  for (const v of curve) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > maxDD) maxDD = dd; }
  const dr = [];
  for (let i = 1; i < curve.length; i++) dr.push(curve[i] / curve[i - 1] - 1);
  const dm = dr.length ? dr.reduce((a, b) => a + b, 0) / dr.length : 0;
  const dsd = dr.length > 1 ? Math.sqrt(dr.reduce((a, b) => a + (b - dm) ** 2, 0) / (dr.length - 1)) : 0;
  return { cagr: (Math.pow(total, 1 / years) - 1) * 100, curve, members: live,
           maxDrawdown: maxDD * 100, sharpe: dsd > 0 ? (dm / dsd) * Math.sqrt(252) : 0 };
}

// ── Cross-sectional momentum ─────────────────────────────────────────────────
// A genuinely different hypothesis, not a tweak of the last one. The Golden Bull
// rules are ABSOLUTE technical thresholds on daily bars over two weeks. The
// momentum anomaly (Jegadeesh & Titman, 1993) is RELATIVE ranking across a
// universe over 3-12 months, and it is among the most replicated effects in
// finance — it survived out of sample for decades after publication, which is
// more than can be said for any indicator crossover.
//
// Standard construction: rank by return over `lookback` days skipping the most
// recent `skip` days (short-term reversal pollutes the signal), hold the top N,
// rebalance monthly.
function btMomentum(barsByTicker, dates, spyCloses, opts) {
  const { capital, slots, costBps, lookback, skip, rebalance, trendFilter, spyEma200 } = opts;
  const cost = (costBps || 0) / 10000;
  const tickers = Object.keys(barsByTicker);
  const ema200 = {};
  if (trendFilter) for (const tk of tickers) ema200[tk] = btEMA(barsByTicker[tk].closes.map(v => v ?? 0), 200);

  let cash = capital;
  let held = [];                 // { ticker, shares, entryIdx, entryPx }
  const trades = [], curve = [];
  const START = Math.max(lookback + skip + 5, 210);

  for (let i = 0; i < dates.length; i++) {
    const isRebal = i >= START && (i - START) % rebalance === 0;

    if (isRebal) {
      // Liquidate everything, then rebuild. Simple, and it charges full costs.
      for (const h of held) {
        const px = barsByTicker[h.ticker].closes[i];
        if (px == null) continue;
        const proceeds = h.shares * px * (1 - cost);
        cash += proceeds;
        const size = capital / slots;
        const ret = (proceeds - h.cost) / h.cost;
        const sIn = spyCloses[h.entryIdx], sOut = spyCloses[i];
        const spyRet = (sIn && sOut) ? (sOut - sIn) / sIn : 0;
        const bc = opts.benchCurve;
        const bIn = bc?.[h.entryIdx], bOut = bc?.[i];
        const uniRet = (bIn && bOut) ? (bOut - bIn) / bIn : spyRet;
        trades.push({ ticker: h.ticker, held: i - h.entryIdx, ret, spyRet, uniRet,
                      excess: ret - uniRet, excessSpy: ret - spyRet });
      }
      held = [];

      const regimeOk = !opts.regimeFilter || !spyEma200 ||
        (spyCloses[i] != null && spyEma200[i] != null && spyCloses[i] > spyEma200[i]);

      if (regimeOk) {
        const eligible = trendFilter
          ? tickers.filter(tk => {
              const c = barsByTicker[tk].closes;
              return c[i] != null && ema200[tk][i] != null && c[i] > ema200[tk][i];
            })
          : tickers;
        const ranked = btFactorRank(barsByTicker, eligible, i, opts.mode || 'momentum',
                                    { lookback, skip });
        const picks = ranked.slice(0, slots);
        const size = cash / Math.max(1, picks.length);
        for (const p of picks) {
          const px = barsByTicker[p.tk].closes[i];
          if (px == null) continue;
          const spend = Math.min(size, cash);
          if (spend <= 0) continue;
          cash -= spend;
          held.push({ ticker: p.tk, shares: spend / (px * (1 + cost)), entryIdx: i, cost: spend });
        }
      }
    }

    let mv = 0;
    for (const h of held) {
      const px = barsByTicker[h.ticker].closes[i];
      mv += px != null ? h.shares * px : h.cost;
    }
    curve.push(cash + mv);
  }

  return btStats(curve, trades, dates, capital, spyCloses);
}

// Shared statistics so every strategy family is judged identically.
function btStats(curve, trades, dates, capital, spyCloses) {
  const equity = curve[curve.length - 1];
  const rets = trades.map(t => t.ret);
  const exc  = trades.map(t => t.excess);
  const n = rets.length;
  const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const mExc = n ? exc.reduce((a, b) => a + b, 0) / n : 0;
  const sdExc = n > 1 ? Math.sqrt(exc.reduce((a, b) => a + (b - mExc) ** 2, 0) / (n - 1)) : 0;
  const avgHold = n ? trades.reduce((a, t) => a + t.held, 0) / n : 1;
  const effN = Math.max(1, Math.min(n, dates.length / Math.max(1, avgHold)));
  const tStat = (n > 1 && sdExc > 0) ? mExc / (sdExc / Math.sqrt(effN)) : 0;
  const pValue = 2 * (1 - btNormCdf(Math.abs(tStat)));

  let peak = curve[0], maxDD = 0;
  for (const v of curve) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > maxDD) maxDD = dd; }
  const dr = [];
  for (let i = 1; i < curve.length; i++) dr.push(curve[i] / curve[i - 1] - 1);
  const dm = dr.length ? dr.reduce((a, b) => a + b, 0) / dr.length : 0;
  const dsd = dr.length > 1 ? Math.sqrt(dr.reduce((a, b) => a + (b - dm) ** 2, 0) / (dr.length - 1)) : 0;
  const sharpe = dsd > 0 ? (dm / dsd) * Math.sqrt(252) : 0;
  const years = dates.length / 252;
  const cagr = years > 0 && equity > 0 ? (Math.pow(equity / capital, 1 / years) - 1) * 100 : 0;
  const spyStart = spyCloses.find(v => v != null), spyEnd = [...spyCloses].reverse().find(v => v != null);
  const spyEquity = (spyStart && spyEnd) ? capital * (spyEnd / spyStart) : null;
  const spyCagr = (spyEquity && years > 0) ? (Math.pow(spyEquity / capital, 1 / years) - 1) * 100 : null;
  const exposure = Math.min(100, (n * avgHold) / (dates.length * 10) * 100);

  return { equity, capital, cagr, spyEquity, spyCagr, trades: n,
           winRate: n ? Math.round(rets.filter(r => r > 0).length / n * 100) : 0,
           avgTrade: mean * 100, avgExcess: mExc * 100, effN: Math.round(effN),
           tStat, pValue, maxDrawdown: maxDD * 100, sharpe, avgHold, exposure, years, curve };
}

// ── Hunting grounds ──────────────────────────────────────────────────────────
// An edge only survives if something stops smart money arbitraging it away:
// capacity limits, mandate restrictions, risk that is genuinely unpleasant, or
// research costs nobody will pay. Mega-cap US tech has none of those — it is the
// most analysed corner of the most efficient market on earth, which is exactly
// where an edge should NOT be expected to exist. Testing the same ideas on a
// less-covered universe separates "our rules are wrong" from "our hunting ground
// is wrong", and those call for completely different responses.
//
// SURVIVORSHIP BIAS WARNING: both lists are companies that still trade today.
// Names that went to zero are absent, which inflates every backtested return.
// That cuts one way only — a strategy that still loses despite a universe
// stacked in its favour is conclusively dead, while a winner needs point-in-time
// constituent data before it can be believed.

const SMALLCAP_UNIVERSE = [
  // Small/mid-cap industrials, materials, regional banks, healthcare, consumer —
  // chosen for sector spread and enough liquidity to be tradeable.
  'AAON','ACIW','AEIS','AIT','ALRM','AMPH','ANET','APOG','ARCB','ASGN',
  'ATKR','AVAV','AWI','AZZ','BCPC','BMI','BOOT','BRC','CALM','CARG',
  'CBT','CCOI','CENX','CHCO','CNMD','CRS','CSWI','CVCO','CWST','DORM',
  'DY','EAT','EPAC','ESE','EXPO','FELE','FIX','FORM','FSS','GFF',
  'GPI','GRBK','GTLS','HAE','HELE','HLIT','HWKN','ICFI','IIPR','INSW',
  'ITGR','JBT','JJSF','KAI','KFY','KMT','KTOS','LANC','LCII','LNN',
  'MATX','MLI','MMSI','MOG-A','MYRG','NPO','NSP','OSIS','OTTR','PATK',
  'PLXS','POWL','PRIM','PTGX','RUSHA','SAIA','SHOO','SITM','SKYW','SMPL',
  'SPSC','SSD','STRL','SXI','TGLS','TMHC','TNC','TREX','TRNO','TTEK',
  'UFPI','UNF','VCEL','VICR','VRTS','WDFC','WERN','WIRE','WTS','ZWS',
];

// ── Generalised cross-sectional factor engine ────────────────────────────────
// One machine, several ranking rules, all of them documented effects that are
// computable from price alone — so none of this is parameter-searching.
//
//   momentum  — Jegadeesh & Titman 1993: past 3-12mo winners keep winning
//   high52    — George & Hwang 2004: proximity to the 52-week high predicts
//               continuation (anchoring bias; works where momentum does not)
//   lowvol    — Ang et al. 2006: low-volatility names beat high-volatility ones
//               risk-adjusted, because leverage constraints push buyers into
//               lottery-like stocks
//   reversal  — Lehmann 1990: one-week losers bounce. Real, but usually eaten
//               by costs — included precisely to show what that looks like.
function btFactorRank(bars, tickers, i, mode, opts) {
  const out = [];
  for (const tk of tickers) {
    const c = bars[tk].closes, h = bars[tk].highs;
    let score = null;
    if (mode === 'momentum') {
      const now = c[i - opts.skip], then = c[i - opts.skip - opts.lookback];
      if (now != null && then > 0) score = (now - then) / then;
    } else if (mode === 'high52') {
      const win = h.slice(Math.max(0, i - 252), i + 1).filter(v => v != null);
      if (win.length > 100 && c[i] != null) {
        const hi = Math.max(...win);
        if (hi > 0) score = c[i] / hi;            // closer to 1 = nearer its high
      }
    } else if (mode === 'lowvol') {
      const win = c.slice(Math.max(0, i - 126), i + 1).filter(v => v != null);
      if (win.length > 60) {
        const r = [];
        for (let k = 1; k < win.length; k++) r.push(win[k] / win[k - 1] - 1);
        const m = r.reduce((a, b) => a + b, 0) / r.length;
        const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
        if (sd > 0) score = -sd;                   // least volatile ranks highest
      }
    } else if (mode === 'reversal') {
      const now = c[i], then = c[i - 5];
      if (now != null && then > 0) score = -((now - then) / then);  // biggest loser first
    }
    if (score == null || !isFinite(score)) continue;
    out.push({ tk, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
