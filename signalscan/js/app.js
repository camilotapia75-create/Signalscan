// ===== CONFIG =====
const CRYPTO = ['BTC','ETH','SOL','XRP','BNB','DOGE','ADA','AVAX','LINK','DOT','MATIC','LTC','BCH','UNI','ATOM','XLM','ALGO','NEAR','FTM','SAND','MANA','CRO','VET','ICP','FIL','HBAR','APT','ARB','OP','INJ','SUI','SEI','TIA','BONK','WIF','PEPE','SHIB','FLOKI'];

function normalizeTicker(raw) {
  const t = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (t.endsWith('-USD') || t.endsWith('-USDT')) return t;
  if (CRYPTO.includes(t)) return t + '-USD';
  return t;
}

// ===== DATA FETCH =====
async function fetchStockData(ticker, intervalRange = '1d|1y', timeoutMs = 8000) {
  const [interval, range] = intervalRange.split('|');
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.toUpperCase()}?interval=${interval}&range=${range}`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    `https://proxy.cors.sh/${yahooUrl}`,
  ];
  for (const url of proxies) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) continue;
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) continue;
      const q = result.indicators.quote[0];
      const meta = result.meta;
      return {
        ticker: ticker.toUpperCase(),
        name: meta.shortName || ticker,
        currency: meta.currency,
        currentPrice: meta.regularMarketPrice,
        timestamps: result.timestamp,
        opens: q.open, highs: q.high, lows: q.low, closes: q.close, volumes: q.volume,
      };
    } catch (e) { /* try next proxy */ }
  }
  throw new Error(`Failed to fetch data for ${ticker}. Try again in a moment.`);
}

// ===== CHART =====
let priceChart = null;
function resetZoom() { if (priceChart) priceChart.resetZoom(); }

function renderChart(data) {
  const wrap = document.getElementById('chartWrap');
  wrap.innerHTML = '<canvas id="priceCanvas"></canvas>';
  const canvas = document.getElementById('priceCanvas');
  canvas.style.width = '100%'; canvas.style.height = '300px';
  const labels = data.timestamps.map(t => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }));
  const closes = data.closes.filter(Boolean);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  if (priceChart) priceChart.destroy();
  const controls = document.getElementById('chartControls');
  if (controls) controls.style.display = 'flex';
  priceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Price', data: data.closes, borderColor: '#00ff88', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(0,255,136,0.05)', tension: 0.1 },
        { label: 'EMA 20', data: [...Array(data.closes.length - ema20.length).fill(null), ...ema20], borderColor: '#4d9fff', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3, borderDash: [4, 4] },
        { label: 'EMA 50', data: [...Array(data.closes.length - ema50.length).fill(null), ...ema50], borderColor: '#ff3d6b', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3, borderDash: [8, 4] },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#5a6a7a', font: { family: 'Space Mono', size: 10 }, boxWidth: 20 } },
        tooltip: { backgroundColor: '#0d1117', borderColor: '#1c2330', borderWidth: 1, titleColor: '#e8edf2', bodyColor: '#5a6a7a', titleFont: { family: 'Space Mono', size: 11 }, bodyFont: { family: 'Space Mono', size: 11 } },
        zoom: { pan: { enabled: true, mode: 'x', threshold: 5 }, zoom: { wheel: { enabled: true, speed: 0.08 }, pinch: { enabled: true }, mode: 'x' }, limits: { x: { minRange: 5 } } }
      },
      scales: {
        x: { grid: { color: 'rgba(28,35,48,0.5)' }, ticks: { color: '#5a6a7a', font: { family: 'Space Mono', size: 9 }, maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(28,35,48,0.5)' }, ticks: { color: '#5a6a7a', font: { family: 'Space Mono', size: 9 } } }
      }
    }
  });
}

// ===== INDICATORS UI =====
function updateIndicators(indData) {
  const { rsi, macd, bb, stoch, atr, obv, volRatio, ema20, ema50, lastClose } = indData;
  const rsiClass = rsi > 70 ? 'bear' : rsi < 30 ? 'bull' : 'neutral';
  const rsiSignal = rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : rsi > 55 ? 'BULLISH ZONE' : rsi < 45 ? 'BEARISH ZONE' : 'NEUTRAL';
  const macdClass = macd.histogram > 0 ? 'bull' : 'bear';
  const macdSignal = macd.histogram > 0 ? (macd.macd > 0 ? 'BULLISH' : 'WEAK BULL') : (macd.macd < 0 ? 'BEARISH' : 'WEAK BEAR');
  const emaClass = lastClose > ema20 && ema20 > ema50 ? 'bull' : lastClose < ema20 && ema20 < ema50 ? 'bear' : 'neutral';
  const emaSignal = lastClose > ema20 ? (ema20 > ema50 ? 'BULLISH STACK' : 'MIXED') : 'BEARISH STACK';
  const bbClass = bb.pctB > 0.8 ? 'bear' : bb.pctB < 0.2 ? 'bull' : 'neutral';
  const bbSignal = bb.pctB > 0.8 ? 'NEAR UPPER BAND' : bb.pctB < 0.2 ? 'NEAR LOWER BAND' : 'MID RANGE';
  const stochClass = stoch.k > 80 ? 'bear' : stoch.k < 20 ? 'bull' : 'neutral';
  const stochSignal = stoch.k > stoch.d ? 'K > D (BULL)' : 'K < D (BEAR)';
  const volClass = volRatio > 1.5 ? 'bull' : volRatio < 0.7 ? 'bear' : 'neutral';
  const volSignal = volRatio > 1.5 ? 'HIGH VOLUME' : volRatio < 0.7 ? 'LOW VOLUME' : 'AVERAGE';
  document.getElementById('indicatorsGrid').innerHTML = `
    <div class="ind-cell"><div class="ind-label">RSI (14)</div><div class="ind-value ${rsiClass}">${rsi.toFixed(1)}</div><div class="ind-signal ${rsiClass}">${rsiSignal}</div></div>
    <div class="ind-cell"><div class="ind-label">MACD HISTOGRAM</div><div class="ind-value ${macdClass}">${macd.histogram > 0 ? '+' : ''}${macd.histogram.toFixed(3)}</div><div class="ind-signal ${macdClass}">${macdSignal}</div></div>
    <div class="ind-cell"><div class="ind-label">EMA 20 / EMA 50</div><div class="ind-value ${emaClass}">${ema20.toFixed(2)}</div><div class="ind-signal ${emaClass}">${emaSignal}</div></div>
    <div class="ind-cell"><div class="ind-label">BOLLINGER %B</div><div class="ind-value ${bbClass}">${(bb.pctB * 100).toFixed(1)}%</div><div class="ind-signal ${bbClass}">${bbSignal}</div></div>
    <div class="ind-cell"><div class="ind-label">STOCH %K / %D</div><div class="ind-value ${stochClass}">${stoch.k.toFixed(1)} / ${stoch.d.toFixed(1)}</div><div class="ind-signal ${stochClass}">${stochSignal}</div></div>
    <div class="ind-cell"><div class="ind-label">ATR (14)</div><div class="ind-value neutral">${atr.toFixed(2)}</div><div class="ind-signal neutral">VOLATILITY: ${(atr / lastClose * 100).toFixed(1)}%</div></div>
    <div class="ind-cell"><div class="ind-label">OBV TREND</div><div class="ind-value ${obv.trend === 'RISING' ? 'bull' : 'bear'}">${obv.trend}</div><div class="ind-signal ${obv.trend === 'RISING' ? 'bull' : 'bear'}">VOLUME FLOW</div></div>
    <div class="ind-cell"><div class="ind-label">VOLUME VS 20D AVG</div><div class="ind-value ${volClass}">${(volRatio * 100).toFixed(0)}%</div><div class="ind-signal ${volClass}">${volSignal}</div></div>
  `;
}

// ===== MODE TOGGLE =====
let currentMode = 'reversal';
function setMode(mode) {
  currentMode = mode;
  const revBtn = document.getElementById('modeReversal');
  const conBtn = document.getElementById('modeContinuation');
  const label  = document.getElementById('modeLabel');
  if (mode === 'reversal') {
    revBtn.style.background = 'var(--accent)'; revBtn.style.color = '#000';
    conBtn.style.background = 'transparent';   conBtn.style.color = 'var(--muted)';
    label.textContent = 'REVERSAL MODE'; label.style.color = 'var(--accent)';
  } else {
    conBtn.style.background = 'var(--accent3)'; conBtn.style.color = '#000';
    revBtn.style.background = 'transparent';    revBtn.style.color = 'var(--muted)';
    label.textContent = 'CONTINUATION MODE'; label.style.color = 'var(--accent3)';
  }
}

// ===== PERFECT SIGNAL EFFECTS =====
function triggerPerfectSignalEffect(isBull) {
  const color = isBull ? '#00ff88' : '#ff3d6b';
  const flash = document.createElement('div');
  flash.className = 'perfect-flash-overlay';
  flash.style.background = color;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1700);

  [0.1,0.25,0.42,0.58,0.75,0.9].forEach((xFrac, i) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    const h = 180 + Math.random() * 120, w = 28;
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.style.cssText = `position:fixed;left:${xFrac*100}vw;top:${Math.random()*20}vh;pointer-events:none;z-index:9997;animation:lightningStrike ${0.5+Math.random()*0.4}s ease-out ${i*0.07}s forwards;opacity:0;filter:drop-shadow(0 0 8px ${color});`;
    let pts = `${w/2},0 `; let y=0,x=w/2;
    while(y<h-20){y+=15+Math.random()*20;x=4+Math.random()*(w-8);pts+=`${x},${y} `;}
    pts+=`${w/2},${h}`;
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points',pts); poly.setAttribute('stroke',color); poly.setAttribute('stroke-width','2.5'); poly.setAttribute('fill','none'); poly.setAttribute('stroke-linecap','round'); poly.setAttribute('stroke-linejoin','round');
    const core = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    core.setAttribute('points',pts); core.setAttribute('stroke','white'); core.setAttribute('stroke-width','0.8'); core.setAttribute('fill','none'); core.setAttribute('opacity','0.8');
    svg.appendChild(poly); svg.appendChild(core); document.body.appendChild(svg);
    setTimeout(()=>svg.remove(),1200);
  });

  const animal = document.createElement('div');
  animal.className = isBull ? 'bull-overlay' : 'bear-overlay';
  animal.style.color = isBull ? '#FFD700' : color;
  animal.style.textShadow = isBull ? '0 0 40px #FFD700,0 0 80px #FFA500' : `0 0 40px ${color}`;
  animal.textContent = isBull ? '🐂' : '🐻';
  document.body.appendChild(animal);
  setTimeout(()=>animal.remove(),1900);

  const panel = document.querySelector('.signal-panel');
  if (panel) {
    panel.style.transition='transform 0.07s';
    [4,-4,3,-3,2,-1,0].forEach((v,i)=>setTimeout(()=>{panel.style.transform=`translateX(${v}px)`;},i*55));
    setTimeout(()=>{panel.style.transform='';panel.style.transition='';},7*55+60);
  }

  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const notes = isBull
      ? [{f:261.6,t:0,d:0.18,v:0.18},{f:329.6,t:0.14,d:0.18,v:0.18},{f:392,t:0.28,d:0.18,v:0.18},{f:523.2,t:0.42,d:0.30,v:0.20},{f:659.3,t:0.56,d:0.50,v:0.22},{f:523.2,t:0.72,d:0.60,v:0.12},{f:659.3,t:0.72,d:0.60,v:0.12},{f:784,t:0.72,d:0.60,v:0.12}]
      : [{f:493.9,t:0,d:0.22,v:0.15},{f:440,t:0.18,d:0.22,v:0.15},{f:369.9,t:0.36,d:0.22,v:0.15},{f:293.7,t:0.54,d:0.45,v:0.18},{f:293.7,t:0.70,d:0.55,v:0.10},{f:349.2,t:0.70,d:0.55,v:0.10},{f:440,t:0.70,d:0.55,v:0.10}];
    notes.forEach(({f,t,d,v})=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='triangle'; osc.frequency.value=f; if(isBull) osc.detune.value=(Math.random()-0.5)*8;
      osc.connect(gain); gain.connect(ctx.destination);
      const s=ctx.currentTime+t;
      gain.gain.setValueAtTime(0,s); gain.gain.linearRampToValueAtTime(v,s+0.04);
      gain.gain.setValueAtTime(v,s+d-0.06); gain.gain.exponentialRampToValueAtTime(0.001,s+d);
      osc.start(s); osc.stop(s+d+0.05);
    });
  } catch(e){}
}

// ===== STREAM AI ANALYSIS =====
async function streamAIAnalysis(ticker, indData, sr, priceAction) {
  const aiText = document.getElementById('aiText');
  aiText.textContent = ''; aiText.className = 'ai-text streaming-cursor';
  await new Promise(r => setTimeout(r, 400));

  const reversalResult      = generateAnalysis(ticker, indData, sr, priceAction);
  const continuationResult  = generateContinuationAnalysis(ticker, indData, sr, priceAction);
  const result = currentMode === 'continuation' ? continuationResult : reversalResult;

  const agreeBull  = reversalResult.bias === 'BULLISH' && continuationResult.bias === 'BULLISH';
  const agreeBear  = reversalResult.bias === 'BEARISH' && continuationResult.bias === 'BEARISH';
  const conflictBull = reversalResult.bias === 'BULLISH' && continuationResult.bias === 'BEARISH';
  const conflictBear = reversalResult.bias === 'BEARISH' && continuationResult.bias === 'BULLISH';
  const hasConflict  = conflictBull || conflictBear;
  const hasAgreement = agreeBull || agreeBear;

  const banner = document.getElementById('conflictBanner');
  banner.innerHTML = ''; banner.style.display = 'none';

  if (hasAgreement) {
    const cs = (Math.abs(reversalResult.score) + Math.abs(continuationResult.score)) / 2;
    const isPerfect = cs > 0.3;
    const sl = cs > 0.5 ? 'VERY HIGH' : cs > 0.25 ? 'HIGH' : 'MODERATE';
    const isBull = agreeBull;
    const color  = isBull ? 'var(--accent)' : 'var(--accent2)';
    const bc     = isBull ? 'rgba(0,255,136,0.7)' : 'rgba(255,61,107,0.7)';
    const bg     = isBull ? 'rgba(0,255,136,0.10)' : 'rgba(255,61,107,0.10)';
    const title  = isPerfect
      ? `⚡ PERFECT SIGNAL — ALL SYSTEMS GO — ${isBull ? 'BULLISH' : 'BEARISH'}`
      : `⚡ ALL SIGNALS ALIGNED — ${sl} CONVICTION ${isBull ? 'BUY' : 'SELL'}`;
    const body = `Both <strong style="color:var(--text)">Reversal</strong> and <strong style="color:var(--text)">Continuation</strong> are pointing <strong style="color:${color}">${isBull ? 'BULLISH' : 'BEARISH'}</strong>. This is the ${isPerfect ? '<em>strongest</em>' : 'strongest'} ${isBull ? 'buy' : 'sell'} signal the tool can produce — both engines fully aligned.`;
    const tip = isPerfect ? `→ Highest conviction setup. Risk/reward strongly favors ${isBull ? 'longs' : 'shorts'}.` : `→ Watch for volume confirmation on the next ${isBull ? 'up' : 'down'} candle.`;
    banner.innerHTML = `
      ${isPerfect ? `<div class="perfect-scan-line" style="background:${color};"></div>` : ''}
      <div class="perfect-title-anim" style="font-size:10px;font-weight:700;letter-spacing:1.5px;margin-bottom:8px;color:${color}${isPerfect ? ';text-shadow:0 0 12px currentColor' : ''}">${title}</div>
      <div style="font-size:11px;line-height:1.8;color:#c0bfbc;">${body}</div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:var(--muted);">${tip}</div>`;
    banner.style.cssText = `background:${bg};border:1px solid ${bc};padding:14px 16px;display:block;position:relative;overflow:hidden;${isPerfect?`box-shadow:0 0 24px ${bc};animation:perfectBannerPulse 2s ease-in-out 3;`:''}}`;
    if (isPerfect) setTimeout(() => triggerPerfectSignalEffect(isBull), 300);
  }

  if (hasConflict) {
    const contStr = Math.abs(continuationResult.score);
    let title, color, borderColor, bgColor, body, tip;
    if (conflictBull) {
      if (contStr >= 0.55) { title='⚡ DEAD CAT BOUNCE — TREND STILL DOWN'; color='var(--gold)'; borderColor='rgba(255,204,68,0.3)'; bgColor='rgba(255,204,68,0.06)'; body=`<strong style="color:var(--text)">Reversal</strong> sees oversold exhaustion — a short-term bounce <strong style="color:var(--accent)">up</strong> is likely. But <strong style="color:var(--text)">Continuation</strong> shows the downtrend is <strong style="color:var(--accent2)">firmly intact</strong>.`; tip='→ Short-term: play bounce with tight stop. Trend followers: wait for bounce to fail.'; }
      else if (contStr >= 0.25) { title='⚠ POSSIBLE TREND CHANGE — SIGNALS MIXED'; color='#ffaa44'; borderColor='rgba(255,170,68,0.3)'; bgColor='rgba(255,170,68,0.06)'; body=`<strong style="color:var(--text)">Reversal</strong> sees strong exhaustion pointing <strong style="color:var(--accent)">up</strong>. <strong style="color:var(--text)">Continuation</strong> shows the downtrend is <strong style="color:var(--gold)">weakening but not yet broken</strong>.`; tip='→ Watch for EMA20 reclaim + MACD cross above zero to confirm real reversal.'; }
      else { title='🔄 EARLY TREND REVERSAL — HIGH PROBABILITY'; color='var(--accent)'; borderColor='rgba(0,255,136,0.3)'; bgColor='rgba(0,255,136,0.06)'; body=`<strong style="color:var(--text)">Reversal</strong> sees strong buy signals. <strong style="color:var(--text)">Continuation</strong> shows the downtrend structure has <strong style="color:var(--accent)">largely broken down</strong>.`; tip='→ Higher conviction than a typical bounce. Wait for EMA20 reclaim to confirm.'; }
    } else {
      if (contStr >= 0.55) { title='📉 HEALTHY PULLBACK IN STRONG UPTREND'; color='#b388ff'; borderColor='rgba(179,136,255,0.3)'; bgColor='rgba(179,136,255,0.06)'; body=`<strong style="color:var(--text)">Reversal</strong> sees overbought exhaustion. <strong style="color:var(--text)">Continuation</strong> shows the uptrend is <strong style="color:var(--accent)">firmly intact</strong>.`; tip='→ Trend followers: hold or add on dip near EMA20. Short-term: take partial profits.'; }
      else if (contStr >= 0.25) { title='⚠ UPTREND LOSING STEAM — WATCH CLOSELY'; color='#ffaa44'; borderColor='rgba(255,170,68,0.3)'; bgColor='rgba(255,170,68,0.06)'; body=`<strong style="color:var(--text)">Reversal</strong> sees bearish exhaustion. <strong style="color:var(--text)">Continuation</strong> shows the uptrend is <strong style="color:var(--gold)">still positive but weakening</strong>.`; tip='→ Loss of EMA20 on daily close = exit signal.'; }
      else { title='🔄 POSSIBLE TREND TOP — HIGH CAUTION'; color='var(--accent2)'; borderColor='rgba(255,61,107,0.3)'; bgColor='rgba(255,61,107,0.06)'; body=`<strong style="color:var(--text)">Reversal</strong> sees strong sell signals. <strong style="color:var(--text)">Continuation</strong> shows the uptrend structure has <strong style="color:var(--accent2)">largely broken down</strong>.`; tip='→ Reduce long exposure. Break below EMA50 confirms trend change.'; }
    }
    banner.innerHTML = `<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;margin-bottom:8px;color:${color}">${title}</div><div style="font-size:11px;line-height:1.8;color:#c0bfbc;">${body}</div><div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:var(--muted);">${tip}</div>`;
    banner.style.cssText = `background:${bgColor};border:1px solid ${borderColor};padding:14px 16px;display:block;`;
  }

  // Typewriter
  const riskSplit = result.analysis.split('\n\nRISK FACTORS:\n');
  const mainText  = riskSplit[0], riskText = riskSplit[1] || '';
  let i = 0;
  await new Promise(resolve => {
    const iv = setInterval(() => { i += 3; aiText.textContent = mainText.slice(0, i); if (i >= mainText.length) { clearInterval(iv); resolve(); } }, 16);
  });
  if (riskText) {
    const rb = document.createElement('div'); rb.className = 'risk-block';
    rb.innerHTML = `<div class="risk-block-title">⚠ RISK FACTORS</div>${riskText.replace(/\n/g,'<br>')}`;
    aiText.parentNode.appendChild(rb);
  }
  aiText.className = 'ai-text';

  let displayConf = result.confidence;
  if (hasAgreement) {
    const cs = (Math.abs(reversalResult.score) + Math.abs(continuationResult.score)) / 2;
    displayConf = Math.min(94, Math.max(result.confidence, Math.round(20 + cs * 72) + 8));
  }

  document.getElementById('overallSignal').textContent  = result.bias;
  document.getElementById('overallSignal').className    = `signal-value ${result.biasClass}`;
  document.getElementById('signalConf').textContent     = '';
  document.getElementById('predictionLabel').textContent = '';
  document.getElementById('tgt-current').textContent = '$' + indData.lastClose.toFixed(2);
  document.getElementById('tgt-up').textContent      = '$' + result.upTarget.toFixed(2);
  document.getElementById('tgt-down').textContent    = '$' + result.downTarget.toFixed(2);
  document.getElementById('tgt-stop').textContent    = '$' + result.stopLoss.toFixed(2);
  fetchNews(ticker);
}

// ===== NEWS =====
async function fetchNews(ticker) {
  const clean = ticker.replace('-USD','').replace('-USDT','');
  const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${clean}&region=US&lang=en-US`)}`;
  const newsPanel = document.getElementById('newsPanel');
  const newsList  = document.getElementById('newsList');
  newsPanel.style.display = 'block';
  newsList.innerHTML = '<div style="padding:16px 20px;font-size:11px;color:var(--muted)">Loading news...</div>';
  try {
    const res  = await fetch(url);
    const text = await res.text();
    const xml  = new DOMParser().parseFromString(text, 'text/xml');
    const items = Array.from(xml.querySelectorAll('item')).slice(0, 3);
    if (!items.length) throw new Error();
    newsList.innerHTML = items.map(item => {
      const title   = item.querySelector('title')?.textContent || '';
      const link    = item.querySelector('link')?.textContent || '#';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const date    = pubDate ? new Date(pubDate).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
      const bull = /surges?|jumps?|beats?|gains?|rallies?|bullish|upgrade|buy|strong|rises?|up \d/i.test(title);
      const bear = /falls?|drops?|misses?|loses?|bearish|downgrade|sell|weak|declines?|down \d|cuts?/i.test(title);
      const sent = bull ? `<span class="news-sentiment bull">▲ BULLISH</span>` : bear ? `<span class="news-sentiment bear">▼ BEARISH</span>` : `<span class="news-sentiment neutral">● NEUTRAL</span>`;
      return `<a class="news-item" href="${link}" target="_blank" rel="noopener noreferrer"><div class="news-title">${title}</div><div style="display:flex;gap:12px;align-items:center">${sent}<span class="news-meta">${date}</span></div></a>`;
    }).join('');
  } catch(e) {
    newsList.innerHTML = '<div style="padding:16px 20px;font-size:11px;color:var(--muted)">News unavailable for this ticker.</div>';
  }
}

// ===== MAIN ANALYSIS =====
async function runAnalysis() {
  const raw   = document.getElementById('tickerInput').value.trim();
  const ticker = normalizeTicker(raw);
  const intervalRange = document.getElementById('timeframeSelect').value;
  const btn = document.getElementById('analyzeBtn');
  const err = document.getElementById('errorMsg');
  if (!ticker) { showError('Please enter a ticker symbol'); return; }

  err.style.display = 'none';
  btn.disabled = true; btn.classList.add('loading'); btn.textContent = 'ANALYZING...';
  document.getElementById('statusMsg').style.display = 'block';
  document.getElementById('statusMsg').textContent = '📡 Fetching data for ' + ticker + '...';

  // Reset UI
  ['overallSignal','signalConf','predictionLabel'].forEach(id => document.getElementById(id).textContent = id === 'overallSignal' ? '—' : '');
  document.getElementById('overallSignal').className = 'signal-value';
  ['tgt-current','tgt-up','tgt-down','tgt-stop'].forEach(id => document.getElementById(id).textContent = '—');
  document.getElementById('aiText').textContent = '';
  document.getElementById('newsPanel').style.display = 'none';
  document.querySelectorAll('.risk-block').forEach(el => el.remove());
  const cb = document.getElementById('conflictBanner'); cb.innerHTML=''; cb.style.display='none';

  try {
    const data = await fetchStockData(ticker, intervalRange);
    const closes  = data.closes.filter(Boolean);
    const highs   = data.highs.filter(Boolean);
    const lows    = data.lows.filter(Boolean);
    const volumes = data.volumes.filter(Boolean);

    const rsi  = calcRSI(closes);
    const macd = calcMACD(closes);
    const bb   = calcBollinger(closes);
    const stoch = calcStochastic(highs, lows, closes);
    const atr  = calcATR(highs, lows, closes);
    const obv  = calcOBV(closes, volumes);
    const ema20arr = calcEMA(closes, 20), ema50arr = calcEMA(closes, 50);
    const ema20 = ema20arr[ema20arr.length-1], ema50 = ema50arr[ema50arr.length-1];
    const lastClose = closes[closes.length-1];
    const vol20avg = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
    const volRatio = volumes[volumes.length-1]/vol20avg;
    const sr = findSupportResistance(highs, lows, closes);
    const indData = { rsi, macd, bb, stoch, atr, obv, volRatio, ema20, ema50, lastClose };
    const priceAction = analyzePriceAction(data);

    const pctChange = ((lastClose - closes[closes.length-2]) / closes[closes.length-2] * 100);
    const infoEl = document.getElementById('tickerInfo');
    infoEl.innerHTML = `
      <div class="info-item"><div class="info-label">SYMBOL</div><div class="info-val">${data.ticker}</div></div>
      <div class="info-item"><div class="info-label">PRICE</div><div class="info-val">$${lastClose.toFixed(2)}</div></div>
      <div class="info-item"><div class="info-label">1D CHANGE</div><div class="info-val ${pctChange>=0?'bull':'bear'}">${pctChange>=0?'+':''}${pctChange.toFixed(2)}%</div></div>
      <div class="info-item"><div class="info-label">52W RANGE</div><div class="info-val" style="font-size:11px">$${Math.min(...lows).toFixed(2)} — $${Math.max(...highs).toFixed(2)}</div></div>`;
    infoEl.style.display = 'flex';
    document.getElementById('tgt-current').textContent = '$' + lastClose.toFixed(2);

    renderChart(data);
    updateIndicators(indData);
    btn.textContent = 'RUNNING AI...';
    document.getElementById('statusMsg').textContent = '🤖 Running analysis...';
    await streamAIAnalysis(ticker, indData, sr, priceAction);
  } catch (e) { showError(e.message); }

  btn.disabled = false; btn.classList.remove('loading'); btn.textContent = '⚡ ANALYZE';
  document.getElementById('statusMsg').style.display = 'none';
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = '⚠ ' + msg; el.style.display = 'block';
}

function showModalTab(tab) {
  const revTab = document.getElementById('tabReversal');
  const conTab = document.getElementById('tabContinuation');
  if (tab === 'reversal') {
    revTab.style.background='#00ff88'; revTab.style.color='#000';
    conTab.style.background='transparent'; conTab.style.color='#5a6a7a';
    document.getElementById('modalReversal').style.display='flex';
    document.getElementById('modalContinuation').style.display='none';
  } else {
    conTab.style.background='#4d9fff'; conTab.style.color='#000';
    revTab.style.background='transparent'; revTab.style.color='#5a6a7a';
    document.getElementById('modalContinuation').style.display='flex';
    document.getElementById('modalReversal').style.display='none';
  }
}

function toggleHowItWorks() {
  const overlay = document.getElementById('howItWorksOverlay');
  const panel   = document.getElementById('howItWorksPanel');
  const isOpen  = panel.style.display !== 'none';
  overlay.style.display = isOpen ? 'none' : 'block';
  panel.style.display   = isOpen ? 'none' : 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tickerInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') runAnalysis();
  });
});
