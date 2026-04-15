// ===== TECHNICAL CALCULATIONS =====

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  let gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  if (gains.length < period) return null;
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine.slice(macdLine.length - 20), 9);
  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signal[signal.length - 1];
  return { macd: lastMACD, signal: lastSignal, histogram: lastMACD - lastSignal };
}

function calcBollinger(closes, period = 20) {
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / period);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const last = closes[closes.length - 1];
  const pctB = (last - lower) / (upper - lower);
  return { upper, lower, middle: mean, pctB, bandwidth: (upper - lower) / mean };
}

function calcStochastic(highs, lows, closes, period = 14) {
  const slice_h = highs.slice(-period);
  const slice_l = lows.slice(-period);
  const highest = Math.max(...slice_h);
  const lowest = Math.min(...slice_l);
  const last = closes[closes.length - 1];
  const k = ((last - lowest) / (highest - lowest)) * 100;
  const ks = [];
  for (let i = 0; i < 3; i++) {
    const sh = highs.slice(-(period + i), highs.length - i || undefined);
    const sl = lows.slice(-(period + i), lows.length - i || undefined);
    const h2 = Math.max(...sh), l2 = Math.min(...sl);
    const c2 = closes[closes.length - 1 - i];
    ks.push(((c2 - l2) / (h2 - l2)) * 100);
  }
  const d = ks.reduce((a, b) => a + b, 0) / 3;
  return { k, d };
}

function calcATR(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcOBV(closes, volumes) {
  let obv = 0, obvArr = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    obvArr.push(obv);
  }
  const recent = obvArr.slice(-10);
  const trend = recent[recent.length - 1] > recent[0] ? 'RISING' : 'FALLING';
  return { obv, trend };
}

function findSupportResistance(highs, lows, closes, n = 5) {
  const levels = [];
  for (let i = n; i < closes.length - n; i++) {
    const high_window = highs.slice(i - n, i + n + 1);
    const low_window = lows.slice(i - n, i + n + 1);
    if (highs[i] === Math.max(...high_window)) levels.push({ price: highs[i], type: 'R' });
    if (lows[i] === Math.min(...low_window)) levels.push({ price: lows[i], type: 'S' });
  }
  const last = closes[closes.length - 1];
  const resistance = levels.filter(l => l.type === 'R' && l.price > last).sort((a, b) => a.price - b.price).slice(0, 2);
  const support = levels.filter(l => l.type === 'S' && l.price < last).sort((a, b) => b.price - a.price).slice(0, 2);
  return { resistance, support };
}

function analyzePriceAction(data) {
  try {
    const closes = (data.closes || []).filter(Boolean);
    const highs = (data.highs || []).filter(Boolean);
    const lows = (data.lows || []).filter(Boolean);
    const volumes = (data.volumes || []).filter(Boolean);
    const n = closes.length;
    if (n < 20) return { score: 0, signals: [] };

    let score = 0, signals = [];

    // Higher highs / higher lows
    const lookback = Math.min(15, Math.floor(n / 2));
    const recentHighs = highs.slice(-lookback);
    const recentLows = lows.slice(-lookback);
    const mid = Math.floor(recentHighs.length / 2);
    const fhHigh = Math.max(...recentHighs.slice(0, mid));
    const shHigh = Math.max(...recentHighs.slice(mid));
    const fhLow = Math.min(...recentLows.slice(0, mid));
    const shLow = Math.min(...recentLows.slice(mid));

    if (shHigh > fhHigh && shLow > fhLow) {
      score += 0.8;
      signals.push({ text: 'Price making higher highs and higher lows — bull trend structure confirmed', type: 'bull' });
    } else if (shHigh < fhHigh && shLow < fhLow) {
      score -= 0.8;
      signals.push({ text: 'Price making lower highs and lower lows — bear trend structure confirmed', type: 'bear' });
    } else if (shLow > fhLow && !(shHigh > fhHigh)) {
      score += 0.3;
      signals.push({ text: 'Higher lows forming — buyers defending dips, base building', type: 'bull' });
    } else if (shHigh < fhHigh && !(shLow < fhLow)) {
      score -= 0.3;
      signals.push({ text: 'Lower highs forming — sellers capping rallies, distribution pattern', type: 'bear' });
    }

    // Breakout detection
    const rs = Math.max(0, n - 60), re = Math.max(rs + 5, n - 5);
    if (re > rs + 4) {
      const rc = closes[n - 1];
      const rh = Math.max(...highs.slice(rs, re));
      const rl = Math.min(...lows.slice(rs, re));
      const rv = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const av = volumes.slice(-30).reduce((a, b) => a + b, 0) / 30 || 1;
      const vs = rv / av;
      if (rc > rh * 1.02 && vs > 1.3) { score += 1.2; signals.push({ text: `Breakout above $${rh.toFixed(2)} on ${(vs * 100).toFixed(0)}% avg volume — high conviction bullish breakout`, type: 'bull' }); }
      else if (rc > rh * 1.01) { score += 0.6; signals.push({ text: `Breaking above range ($${rh.toFixed(2)}) — watch for volume confirmation`, type: 'bull' }); }
      else if (rc < rl * 0.98 && vs > 1.3) { score -= 1.2; signals.push({ text: `Breakdown below $${rl.toFixed(2)} on ${(vs * 100).toFixed(0)}% avg volume — high conviction bearish breakdown`, type: 'bear' }); }
      else if (rc < rl * 0.99) { score -= 0.6; signals.push({ text: `Breaking below range ($${rl.toFixed(2)}) — watch for volume confirmation`, type: 'bear' }); }
    }

    // 52-week proximity
    if (n >= 50) {
      const yh = Math.max(...highs.slice(-Math.min(252, n)));
      const yl = Math.min(...lows.slice(-Math.min(252, n)));
      const rc = closes[n - 1];
      if ((yh - rc) / yh < 0.05) { score -= 0.3; signals.push({ text: `Within 5% of 52-week high ($${yh.toFixed(2)}) — approaching major resistance`, type: 'bear' }); }
      else if ((rc - yl) / Math.max(yl, 0.01) < 0.10) { score += 0.3; signals.push({ text: `Near 52-week low ($${yl.toFixed(2)}) — potential long-term support zone`, type: 'bull' }); }
    }

    // Recent 5-candle momentum
    if (n >= 10) {
      const l5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const p5 = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
      if (p5 > 0) {
        const mp = (l5 - p5) / p5;
        if (mp > 0.04) { score += 0.4; signals.push({ text: `Strong recent momentum: +${(mp * 100).toFixed(1)}% over last 5 candles vs prior 5`, type: 'bull' }); }
        else if (mp < -0.04) { score -= 0.4; signals.push({ text: `Weak recent momentum: ${(mp * 100).toFixed(1)}% over last 5 candles vs prior 5`, type: 'bear' }); }
      }
    }

    score = Math.max(-1, Math.min(1, score));
    return { score, signals };
  } catch (e) {
    return { score: 0, signals: [] };
  }
}
