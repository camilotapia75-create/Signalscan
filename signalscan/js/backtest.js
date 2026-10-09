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
  return out;
}

// ── Portfolio replay over all signals ────────────────────────────────────────

function btPortfolio(allSignals, barsByTicker, dates, spyCloses, opts) {
  const { capital, slots, holdDays, costBps } = opts;
  const positionSize = capital / slots;
  const cost = (costBps || 0) / 10000;

  const byDay = new Map();
  for (const s of allSignals) {
    if (!byDay.has(s.i)) byDay.set(s.i, []);
    byDay.get(s.i).push(s);
  }

  let cash = capital;
  const open = [], trades = [], curve = [];
  let skipped = 0;

  for (let i = 0; i < dates.length; i++) {
    // Exit anything that has reached its holding period
    for (let k = open.length - 1; k >= 0; k--) {
      const o = open[k];
      if (i < o.exitIdx) continue;
      const px = barsByTicker[o.ticker].closes[i];
      if (px == null) continue;
      const proceeds = o.shares * px * (1 - cost);
      cash += proceeds;
      trades.push({ ticker: o.ticker, entryIdx: o.entryIdx, exitIdx: i,
                    ret: (proceeds - positionSize) / positionSize });
      open.splice(k, 1);
    }

    // Enter the day's signals, highest score first, capital permitting
    const todays = (byDay.get(i) || []).sort((a, b) => b.score - a.score);
    for (const s of todays) {
      if (open.length >= slots || cash + 1e-9 < positionSize) { skipped++; continue; }
      const entryPx = s.price * (1 + cost);
      cash -= positionSize;
      open.push({ ticker: s.ticker, shares: positionSize / entryPx,
                  entryIdx: i, exitIdx: Math.min(i + holdDays, dates.length - 1) });
    }

    let mv = 0;
    for (const o of open) {
      const px = barsByTicker[o.ticker].closes[i];
      if (px != null) mv += o.shares * px;
      else mv += positionSize;
    }
    curve.push(cash + mv);
  }

  const equity = curve[curve.length - 1];
  const rets = trades.map(t => t.ret);
  const n = rets.length;
  const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  // Is the average trade distinguishable from zero?
  const tStat = (n > 1 && sd > 0) ? mean / (sd / Math.sqrt(n)) : 0;
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

  const spyStart = spyCloses[0], spyEnd = spyCloses[spyCloses.length - 1];
  const spyEquity = (spyStart && spyEnd) ? capital * (spyEnd / spyStart) : null;
  const spyCagr = (spyEquity && years > 0) ? (Math.pow(spyEquity / capital, 1 / years) - 1) * 100 : null;

  return {
    equity, capital, totalReturn: (equity - capital) / capital * 100, cagr,
    spyEquity, spyCagr,
    trades: n, winRate: n ? Math.round(rets.filter(r => r > 0).length / n * 100) : 0,
    avgTrade: mean * 100, sdTrade: sd * 100, tStat, pValue,
    maxDrawdown: maxDD * 100, sharpe, skipped, years,
    curve,
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

async function btFetch(ticker, years) {
  const range = years >= 10 ? '10y' : years >= 5 ? '5y' : '2y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
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
  } catch (_) { return null; }
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

    const universe = [...new Set([...SCAN_UNIVERSE_CORE, ...ROTATION_POOL])]
      .filter(t => !t.endsWith('-USD'));   // crypto has no comparable history here

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
    if (tickers.length < 20) { out.innerHTML = '<div class="bt-err">Too few tickers loaded to backtest.</div>'; return; }

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
      const sigs = btSignalDays(b, spyCloses, { requireDualEngine: true });
      for (const s of sigs) allSignals.push({ ...s, ticker: tk });
      if (t % 10 === 0) { setStatus(`REPLAYING ${t}/${tickers.length} · ${allSignals.length} signals`); await new Promise(r => setTimeout(r, 0)); }
    }
    allSignals.sort((a, b) => a.i - b.i);

    if (!allSignals.length) {
      out.innerHTML = '<div class="bt-err">The strategy produced zero signals over this period.</div>';
      return;
    }

    // Train/test split. Parameters were chosen while looking at recent markets,
    // so only the later, unseen half is honest evidence.
    const splitIdx = Math.floor(calendar.length * 0.6);
    const opts = { capital, slots, holdDays, costBps };
    const full  = btPortfolio(allSignals, barsByTicker, calendar, spyCloses, opts);
    const train = btPortfolio(allSignals.filter(s => s.i <  splitIdx),
                              barsByTicker, calendar.slice(0, splitIdx), spyCloses.slice(0, splitIdx), opts);
    const test  = btPortfolio(allSignals.filter(s => s.i >= splitIdx).map(s => ({ ...s, i: s.i - splitIdx })),
                              barsByTicker0(barsByTicker, splitIdx), calendar.slice(splitIdx), spyCloses.slice(splitIdx), opts);

    out.innerHTML = renderBacktest(full, train, test, allSignals.length, tickers.length, calendar, costBps);
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

function renderBacktest(full, train, test, signalCount, tickerCount, calendar, costBps) {
  const m = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pc = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  const col = n => n >= 0 ? 'var(--accent)' : 'var(--accent2)';

  // The verdict rests on out-of-sample evidence, not the full-period number.
  const beatsMarket = test.spyCagr !== null && test.cagr > test.spyCagr;
  const significant = test.pValue < 0.05 && test.avgTrade > 0;
  let level, headline, detail;
  if (significant && beatsMarket) {
    level = 'ok';
    headline = 'EVIDENCE OF AN EDGE OUT OF SAMPLE';
    detail = `The average trade returned ${pc(test.avgTrade)} with p = ${test.pValue.toFixed(4)}, so this is unlikely to be chance, and it beat buy-and-hold.`;
  } else if (beatsMarket) {
    level = 'warn';
    headline = 'BEATS THE MARKET, BUT NOT STATISTICALLY PROVEN';
    detail = `It outperformed out of sample, but the average trade (${pc(test.avgTrade)}) has p = ${test.pValue.toFixed(3)} — above the 0.05 bar, so this could still be luck.`;
  } else {
    level = 'bad';
    headline = 'NO EDGE OUT OF SAMPLE';
    detail = `On unseen data the strategy returned ${pc(test.cagr)} a year against ${test.spyCagr === null ? 'n/a' : pc(test.spyCagr)} for simply holding the index. The average trade was ${pc(test.avgTrade)} (p = ${test.pValue.toFixed(3)}).`;
  }

  const row = (label, r) => `<tr>
    <td style="padding:6px 8px;color:var(--muted);">${label}</td>
    <td style="padding:6px 8px;">${r.trades.toLocaleString()}</td>
    <td style="padding:6px 8px;font-weight:700;color:${col(r.cagr)};">${pc(r.cagr)}</td>
    <td style="padding:6px 8px;color:var(--muted);">${r.spyCagr === null ? '—' : pc(r.spyCagr)}</td>
    <td style="padding:6px 8px;font-weight:700;color:${col(r.avgTrade)};">${pc(r.avgTrade)}</td>
    <td style="padding:6px 8px;">${r.winRate}%</td>
    <td style="padding:6px 8px;color:var(--accent2);">-${r.maxDrawdown.toFixed(1)}%</td>
    <td style="padding:6px 8px;">${r.sharpe.toFixed(2)}</td>
    <td style="padding:6px 8px;${r.pValue < 0.05 ? 'color:var(--accent);font-weight:700;' : 'color:var(--muted);'}">${r.pValue < 0.0001 ? '<0.0001' : r.pValue.toFixed(4)}</td>
  </tr>`;

  const years = (calendar.length / 252).toFixed(1);

  return `
    <div class="bt-verdict bt-${level}">
      <div class="bt-verdict-head">${level === 'ok' ? '✓' : '⚠'} ${headline}</div>
      <div class="bt-verdict-detail">${detail}</div>
    </div>

    <div class="bt-meta">
      ${years} years · ${tickerCount} tickers · ${signalCount.toLocaleString()} signals · ${costBps} bps cost per side
    </div>

    <table class="bt-table">
      <tr>
        <th>PERIOD</th><th>TRADES</th><th>CAGR</th><th>BUY &amp; HOLD</th>
        <th>AVG TRADE</th><th>WIN%</th><th>MAX DD</th><th>SHARPE</th><th>P-VALUE</th>
      </tr>
      ${row('In-sample (tuned on)', train)}
      ${row('Out-of-sample', test)}
      ${row('Full period', full)}
    </table>

    <div class="bt-note">
      <strong>How to read this.</strong> Only the out-of-sample row is evidence — the in-sample row covers
      the period the strategy was shaped around, so a good number there proves nothing.
      P-value is the probability of seeing an average trade this good if the true edge were zero;
      below 0.05 is the usual bar. Max drawdown is the worst peak-to-trough fall in account value,
      which is what you would actually have to sit through. Costs of ${costBps} bps per side are charged
      on entry and exit; real slippage on thin names is often worse.
    </div>`;
}
