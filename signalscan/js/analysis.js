// ===== REVERSAL ANALYSIS ENGINE =====
function generateAnalysis(ticker, indData, sr, priceAction) {
  const { rsi, macd, bb, stoch, atr, obv, volRatio, ema20, ema50, lastClose } = indData;
  let score = 0, signals = [];

  // MACD Momentum Shift (30%)
  let macdScore = 0;
  if (macd.histogram > 0 && macd.macd < 0) {
    macdScore = 0.9; signals.push({ text: `MACD bullish crossover below zero — histogram just turned positive (${macd.histogram.toFixed(3)}). Early reversal signal before price confirms.`, type: 'bull' });
  } else if (macd.histogram < 0 && macd.histogram > macd.signal) {
    macdScore = 0.6; signals.push({ text: `MACD bearish momentum fading — histogram (${macd.histogram.toFixed(3)}) narrowing toward zero. Downside pressure weakening.`, type: 'bull' });
  } else if (macd.histogram < 0 && macd.macd > 0) {
    macdScore = -0.9; signals.push({ text: `MACD bearish crossover above zero — histogram just turned negative (${macd.histogram.toFixed(3)}). Bull trend losing momentum.`, type: 'bear' });
  } else if (macd.histogram > 0 && macd.histogram < macd.signal) {
    macdScore = -0.6; signals.push({ text: `MACD bullish momentum fading — histogram (${macd.histogram.toFixed(3)}) shrinking. Upside losing steam.`, type: 'bear' });
  }
  score += macdScore * 0.30;

  // Stochastic Cross (25%)
  let stochScore = 0;
  if (stoch.k < 25 && stoch.k > stoch.d) {
    stochScore = 1.0; signals.push({ text: `Stochastic bullish cross from oversold (%K: ${stoch.k.toFixed(0)} crossing above %D: ${stoch.d.toFixed(0)}) — strongest short-term buy signal.`, type: 'bull' });
  } else if (stoch.k < 25 && stoch.k < stoch.d) {
    stochScore = 0.4; signals.push({ text: `Stochastic in oversold territory (%K: ${stoch.k.toFixed(0)}) but cross not yet confirmed.`, type: 'bull' });
  } else if (stoch.k > 75 && stoch.k < stoch.d) {
    stochScore = -1.0; signals.push({ text: `Stochastic bearish cross from overbought (%K: ${stoch.k.toFixed(0)} crossing below %D: ${stoch.d.toFixed(0)}) — strongest short-term sell signal.`, type: 'bear' });
  } else if (stoch.k > 75 && stoch.k > stoch.d) {
    stochScore = -0.4; signals.push({ text: `Stochastic overbought (%K: ${stoch.k.toFixed(0)}) but bearish cross not yet confirmed.`, type: 'bear' });
  } else if (stoch.k > 50 && stoch.k > stoch.d) { stochScore = 0.2; }
  else if (stoch.k < 50 && stoch.k < stoch.d) { stochScore = -0.2; }
  score += stochScore * 0.25;

  // RSI Exhaustion (20%)
  let rsiScore = 0;
  if (rsi < 25) { rsiScore = 1.0; signals.push({ text: `RSI at ${rsi.toFixed(1)} — extreme oversold exhaustion. Sellers statistically depleted.`, type: 'bull' }); }
  else if (rsi < 35) { rsiScore = 0.7; signals.push({ text: `RSI at ${rsi.toFixed(1)} — deeply oversold. Watch for first bounce candle as entry trigger.`, type: 'bull' }); }
  else if (rsi > 75) { rsiScore = -1.0; signals.push({ text: `RSI at ${rsi.toFixed(1)} — extreme overbought exhaustion. Buyers statistically depleted.`, type: 'bear' }); }
  else if (rsi > 65) { rsiScore = -0.7; signals.push({ text: `RSI at ${rsi.toFixed(1)} — overbought. Upside momentum tiring.`, type: 'bear' }); }
  score += rsiScore * 0.20;

  // Bollinger Band Bounce (15%)
  let bbScore = 0;
  if (bb.pctB < 0.05) { bbScore = 1.0; signals.push({ text: `Price touching Bollinger lower band (%B: ${(bb.pctB * 100).toFixed(0)}%) — mean reversion zone. ~75% revert to midline.`, type: 'bull' }); }
  else if (bb.pctB < 0.15) { bbScore = 0.7; signals.push({ text: `Price near Bollinger lower band (%B: ${(bb.pctB * 100).toFixed(0)}%) — in bounce zone.`, type: 'bull' }); }
  else if (bb.pctB > 0.95) { bbScore = -1.0; signals.push({ text: `Price touching Bollinger upper band (%B: ${(bb.pctB * 100).toFixed(0)}%) — statistically overextended.`, type: 'bear' }); }
  else if (bb.pctB > 0.85) { bbScore = -0.7; signals.push({ text: `Price near Bollinger upper band (%B: ${(bb.pctB * 100).toFixed(0)}%) — in rejection zone.`, type: 'bear' }); }
  score += bbScore * 0.15;

  // EMA Reclaim / Rejection (10%)
  let emaScore = 0;
  if (lastClose > ema20 && lastClose < ema20 * 1.02 && ema20 < ema50) {
    emaScore = 0.8; signals.push({ text: `Price just reclaimed EMA20 ($${ema20.toFixed(2)}) from below — early reversal signal. Next test EMA50 at $${ema50.toFixed(2)}.`, type: 'bull' });
  } else if (lastClose > ema50 && lastClose < ema50 * 1.02 && ema20 < ema50) {
    emaScore = 1.0; signals.push({ text: `Price just reclaimed EMA50 ($${ema50.toFixed(2)}) — major trend reversal signal.`, type: 'bull' });
  } else if (lastClose < ema20 && lastClose > ema20 * 0.98 && ema20 > ema50) {
    emaScore = -0.8; signals.push({ text: `Price just lost EMA20 ($${ema20.toFixed(2)}) support — early bearish reversal. Next support EMA50 at $${ema50.toFixed(2)}.`, type: 'bear' });
  } else if (lastClose < ema50 && lastClose > ema50 * 0.98 && ema20 > ema50) {
    emaScore = -1.0; signals.push({ text: `Price just broke below EMA50 ($${ema50.toFixed(2)}) — major bearish reversal signal.`, type: 'bear' });
  }
  score += emaScore * 0.10;

  // Volume amplifier
  const volAmp = volRatio > 1.5 ? 1.3 : volRatio > 1.2 ? 1.1 : volRatio < 0.7 ? 0.85 : 1.0;
  score = Math.max(-1, Math.min(1, score * volAmp));
  if (volRatio > 1.5 && score > 0.1) signals.push({ text: `High volume (${(volRatio * 100).toFixed(0)}% of avg) confirming bullish setup.`, type: 'bull' });
  else if (volRatio > 1.5 && score < -0.1) signals.push({ text: `High volume (${(volRatio * 100).toFixed(0)}% of avg) confirming bearish setup.`, type: 'bear' });
  else if (volRatio < 0.7) signals.push({ text: `Low volume (${(volRatio * 100).toFixed(0)}% of avg) — weak conviction, wait for confirmation.`, type: 'neutral' });

  // Blend price action (25%) + indicators (75%)
  if (priceAction && typeof priceAction.score === 'number') {
    score = Math.max(-1, Math.min(1, score * 0.75 + Math.max(-1, Math.min(1, priceAction.score)) * 0.25));
    signals = [...priceAction.signals, ...signals];
  }

  const calcConf = s => Math.min(92, Math.round(20 + Math.abs(s) * 72));
  let bias, biasClass, confidence, prediction;
  if (score > 0.2) {
    bias = 'BULLISH'; biasClass = 'bull'; confidence = calcConf(score);
    prediction = score > 0.6 ? 'STRONG REVERSAL UP LIKELY' : score > 0.35 ? 'UPSIDE MOVE BUILDING' : 'DEVELOPING SETUP — NOT YET CONFIRMED';
  } else if (score < -0.2) {
    bias = 'BEARISH'; biasClass = 'bear'; confidence = calcConf(score);
    prediction = score < -0.6 ? 'STRONG REVERSAL DOWN LIKELY' : score < -0.35 ? 'DOWNSIDE MOVE BUILDING' : 'DEVELOPING SETUP — NOT YET CONFIRMED';
  } else {
    bias = 'NEUTRAL'; biasClass = 'neutral'; confidence = calcConf(score);
    prediction = 'NO CLEAR SETUP — WAIT FOR SIGNAL';
  }

  const upTarget = lastClose + atr * (score > 0 ? 2.0 : 1.0);
  const downTarget = lastClose - atr * (score < 0 ? 2.0 : 1.0);
  const stopLoss = bias === 'BULLISH' ? lastClose - atr * 1.5 : lastClose + atr * 1.5;
  let srText = '';
  if (sr.resistance.length) srText += `\nKey resistance: ${sr.resistance.map(r => '$' + r.price.toFixed(2)).join(', ')}`;
  if (sr.support.length) srText += `\nKey support: ${sr.support.map(s => '$' + s.price.toFixed(2)).join(', ')}`;

  const top = signals.slice(0, 5);
  let analysis = confidence >= 80 ? `⚡ HIGH CONVICTION — ${prediction}\n\n` : '';
  analysis += `SIGNAL BREAKDOWN:\n`;
  top.forEach(s => { analysis += `• ${s.text}\n`; });
  if (srText) analysis += `\n${srText}`;
  analysis += `\n\nRISK FACTORS:\n`;
  if (bias === 'BULLISH') {
    analysis += `• Failure to hold $${(lastClose - atr).toFixed(2)} invalidates bullish setup\n• Low volume on bounce = weak reversal, likely fades\n• Broader market selloff could override individual setup`;
  } else if (bias === 'BEARISH') {
    analysis += `• Reclaim of $${(lastClose + atr).toFixed(2)} invalidates bearish setup\n• Low volume on drop = weak move, likely to recover\n• Positive catalyst could reverse momentum quickly`;
  } else {
    analysis += `• Breakout above $${(lastClose + atr * 0.8).toFixed(2)} triggers bullish setup\n• Break below $${(lastClose - atr * 0.8).toFixed(2)} triggers bearish setup\n• No edge right now — preserve capital, wait for signal`;
  }
  return { bias, biasClass, confidence, prediction, analysis, upTarget, downTarget, stopLoss, score, keySignals: signals };
}

// ===== CONTINUATION ANALYSIS ENGINE =====
function generateContinuationAnalysis(ticker, indData, sr, priceAction) {
  const { rsi, macd, bb, stoch, atr, obv, volRatio, ema20, ema50, lastClose } = indData;
  let score = 0, signals = [];

  // EMA Stack + Slope (30%)
  let emaScore = 0;
  const ema20Slope = ema20 > ema50 * 1.005;
  const nearEma20 = lastClose > ema20 * 0.98 && lastClose < ema20 * 1.03;
  if (lastClose > ema20 && ema20 > ema50 && ema20Slope) {
    emaScore = 1.0;
    if (nearEma20) signals.push({ text: `Perfect continuation setup: price pulled back to EMA20 ($${ema20.toFixed(2)}) in an uptrend — classic buy-the-dip zone.`, type: 'bull' });
    else signals.push({ text: `Healthy bull trend structure: EMA20 ($${ema20.toFixed(2)}) > EMA50 ($${ema50.toFixed(2)}) with upward slope. Trend continuation is path of least resistance.`, type: 'bull' });
  } else if (lastClose < ema20 && ema20 < ema50) {
    emaScore = -1.0;
    const nearResistance = lastClose < ema20 * 1.02 && lastClose > ema20 * 0.97;
    if (nearResistance) signals.push({ text: `Bear trend continuation: price rallied to EMA20 ($${ema20.toFixed(2)}) resistance — classic sell-the-rally zone.`, type: 'bear' });
    else signals.push({ text: `Downtrend intact: EMA20 ($${ema20.toFixed(2)}) < EMA50 ($${ema50.toFixed(2)}). Continuation lower likely.`, type: 'bear' });
  } else if (lastClose > ema20 && ema20 < ema50) {
    emaScore = 0.2; signals.push({ text: `Early uptrend forming but EMA50 ($${ema50.toFixed(2)}) still overhead — not yet confirmed continuation.`, type: 'neutral' });
  } else {
    emaScore = -0.3; signals.push({ text: `Trend structure weakening — price below EMA20 ($${ema20.toFixed(2)}).`, type: 'bear' });
  }
  score += emaScore * 0.30;

  // MACD Expansion (25%)
  let macdScore = 0;
  if (macd.histogram > 0 && macd.histogram > macd.signal * 0.8 && macd.macd > 0) {
    macdScore = 1.0; signals.push({ text: `MACD confirming bull continuation — histogram positive (${macd.histogram.toFixed(3)}) and expanding above zero.`, type: 'bull' });
  } else if (macd.histogram > 0 && macd.macd > 0) {
    macdScore = 0.6; signals.push({ text: `MACD supporting uptrend — histogram positive (${macd.histogram.toFixed(3)}). Watch for histogram to shrink.`, type: 'bull' });
  } else if (macd.histogram > 0 && macd.macd < 0) {
    macdScore = 0.2; signals.push({ text: `MACD improving but still below zero — early bull momentum, not yet confirmed.`, type: 'neutral' });
  } else if (macd.histogram < 0 && macd.macd < 0 && macd.histogram < macd.signal) {
    macdScore = -1.0; signals.push({ text: `MACD confirming bear continuation — histogram negative (${macd.histogram.toFixed(3)}) and expanding below zero.`, type: 'bear' });
  } else if (macd.histogram < 0 && macd.macd < 0) {
    macdScore = -0.6; signals.push({ text: `MACD supporting downtrend — histogram negative. Bearish momentum intact.`, type: 'bear' });
  } else {
    macdScore = -0.3; signals.push({ text: `MACD momentum fading — histogram turning negative. Trend may be stalling.`, type: 'bear' });
  }
  score += macdScore * 0.25;

  // RSI Momentum Zone (20%)
  let rsiScore = 0;
  const inBull = ema20 > ema50;
  if (rsi >= 50 && rsi <= 65) { rsiScore = 1.0; signals.push({ text: `RSI at ${rsi.toFixed(1)} — in the bull momentum zone (50–65). Strong uptrends ride this range for extended periods.`, type: 'bull' }); }
  else if (rsi > 65 && rsi <= 75) { rsiScore = 0.4; signals.push({ text: `RSI at ${rsi.toFixed(1)} — elevated but strong trends can stay here. Watch for first sign of weakening.`, type: 'neutral' }); }
  else if (rsi >= 35 && rsi < 50) {
    if (inBull) { rsiScore = 0.3; signals.push({ text: `RSI at ${rsi.toFixed(1)} — normal pullback in a bull trend (EMA structure intact). Not a reversal signal.`, type: 'bull' }); }
    else { rsiScore = -1.0; signals.push({ text: `RSI at ${rsi.toFixed(1)} — in the bear momentum zone with bearish EMA structure. Downtrends ride this range.`, type: 'bear' }); }
  } else if (rsi > 75) { rsiScore = -0.5; signals.push({ text: `RSI at ${rsi.toFixed(1)} — overbought. Bull continuation risky at this level.`, type: 'bear' }); }
  else if (rsi < 35) { rsiScore = 0.3; signals.push({ text: `RSI at ${rsi.toFixed(1)} — deeply oversold. Bear continuation risky, bounce likely.`, type: 'neutral' }); }
  score += rsiScore * 0.20;

  // OBV Trend (15%)
  let obvScore = 0;
  if (obv.trend === 'RISING' && volRatio > 1.0) { obvScore = 1.0; signals.push({ text: `OBV rising with solid volume (${(volRatio * 100).toFixed(0)}% of avg) — institutions participating in the uptrend.`, type: 'bull' }); }
  else if (obv.trend === 'RISING') { obvScore = 0.5; signals.push({ text: `OBV trending up — accumulation ongoing but below-average volume suggests lower conviction.`, type: 'bull' }); }
  else if (obv.trend === 'FALLING' && volRatio > 1.0) { obvScore = -1.0; signals.push({ text: `OBV falling on solid volume — institutions distributing. Downtrend has institutional backing.`, type: 'bear' }); }
  else { obvScore = -0.5; }
  score += obvScore * 0.15;

  // Bollinger Bandwidth (10%)
  let bbScore = 0;
  const bw = bb.bandwidth;
  if (bw > 0.08 && score > 0) { bbScore = 1.0; signals.push({ text: `Bollinger Bands expanding (bandwidth: ${(bw * 100).toFixed(1)}%) — trend strengthening, not consolidating.`, type: 'bull' }); }
  else if (bw > 0.08 && score < 0) { bbScore = -1.0; signals.push({ text: `Bollinger Bands expanding (${(bw * 100).toFixed(1)}%) in a downtrend — sell-off accelerating.`, type: 'bear' }); }
  else if (bw < 0.04) { bbScore = -0.5; signals.push({ text: `Bollinger Bands very tight (${(bw * 100).toFixed(1)}%) — price consolidating. No clear continuation yet.`, type: 'neutral' }); }
  score += bbScore * 0.10;

  // Blend price action (25%) + indicators (75%)
  if (priceAction && typeof priceAction.score === 'number') {
    score = Math.max(-1, Math.min(1, score * 0.75 + Math.max(-1, Math.min(1, priceAction.score)) * 0.25));
    signals = [...priceAction.signals, ...signals];
  }

  const calcConf = s => Math.min(92, Math.round(20 + Math.abs(s) * 72));
  let bias, biasClass, confidence, prediction;
  if (score > 0.25) {
    bias = 'BULLISH'; biasClass = 'bull'; confidence = calcConf(score);
    prediction = score > 0.6 ? 'STRONG UPTREND — HIGH CONTINUATION ODDS' : score > 0.4 ? 'UPTREND INTACT — BUY DIPS' : 'DEVELOPING SETUP — NOT YET CONFIRMED';
  } else if (score < -0.25) {
    bias = 'BEARISH'; biasClass = 'bear'; confidence = calcConf(score);
    prediction = score < -0.6 ? 'STRONG DOWNTREND — CONTINUATION LIKELY' : score < -0.4 ? 'DOWNTREND INTACT — SELL RALLIES' : 'DEVELOPING SETUP — NOT YET CONFIRMED';
  } else {
    bias = 'NEUTRAL'; biasClass = 'neutral'; confidence = calcConf(score);
    prediction = 'NO CLEAR TREND — WAIT FOR STRUCTURE';
  }

  const upTarget = lastClose + atr * 2.0;
  const downTarget = lastClose - atr * 2.0;
  const stopLoss = bias === 'BULLISH' ? Math.max(lastClose - atr * 1.5, ema20 * 0.99) : lastClose + atr * 1.5;
  let srText = '';
  if (sr.resistance.length) srText += `\nKey resistance: ${sr.resistance.map(r => '$' + r.price.toFixed(2)).join(', ')}`;
  if (sr.support.length) srText += `\nKey support: ${sr.support.map(s => '$' + s.price.toFixed(2)).join(', ')}`;

  const top = signals.slice(0, 5);
  let analysis = confidence >= 80 ? `⚡ HIGH CONVICTION — ${prediction}\n\n` : '';
  analysis += `TREND SIGNALS:\n`;
  top.forEach(s => { analysis += `• ${s.text}\n`; });
  if (srText) analysis += `\n${srText}`;
  analysis += `\n\nRISK FACTORS:\n`;
  if (bias === 'BULLISH') {
    analysis += `• Loss of EMA20 ($${ema20.toFixed(2)}) on a daily close invalidates bull continuation\n• RSI pushing above 75 signals exhaustion — reduce position\n• MACD histogram starting to shrink = early exit warning`;
  } else if (bias === 'BEARISH') {
    analysis += `• Reclaim of EMA20 ($${ema20.toFixed(2)}) invalidates bear continuation\n• RSI dropping below 30 = oversold bounce risk, cover shorts\n• MACD histogram narrowing = downside momentum fading`;
  } else {
    analysis += `• No trend to trade — entering now has low edge\n• Wait for EMA20/50 to align and MACD to confirm direction\n• Breakout from Bollinger squeeze will define next trend`;
  }
  return { bias, biasClass, confidence, prediction, analysis, upTarget, downTarget, stopLoss, score, keySignals: signals };
}
