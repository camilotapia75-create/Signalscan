const SCAN_UNIVERSE=['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','ORCL','ADBE','CRM','NOW','INTU','SHOP','NET','CRWD','PLTR','SNOW','JPM','BAC','GS','MS','V','MA','BLK','SPGI','AXP','WFC','LLY','UNH','JNJ','ABBV','MRK','TMO','ABT','ISRG','AMGN','GILD','WMT','COST','HD','MCD','SBUX','NKE','TGT','LOW','PG','KO','XOM','CVX','COP','SLB','EOG','CAT','BA','HON','GE','UNP','RTX','LMT','DE','AMD','INTC','QCOM','TXN','MU','AMAT','LRCX','MRVL','ARM','NFLX','DIS','CMCSA','SPOT','NEE','DUK','BTC-USD','ETH-USD','SOL-USD','XRP-USD','BNB-USD','DOGE-USD','ADA-USD','AVAX-USD','LINK-USD'];

async function quickAnalyzeForScan(ticker){
  try{
    const data=await fetchStockData(ticker,'1wk|1y',5000);
    const closes=data.closes.filter(Boolean),highs=data.highs.filter(Boolean),lows=data.lows.filter(Boolean),vols=data.volumes.filter(Boolean);
    if(closes.length<30)return null;
    const rsi=calcRSI(closes),macd=calcMACD(closes),bb=calcBollinger(closes),stoch=calcStochastic(highs,lows,closes),atr=calcATR(highs,lows,closes),obv=calcOBV(closes,vols);
    const e20=calcEMA(closes,20),e50=calcEMA(closes,50),ema20=e20[e20.length-1],ema50=e50[e50.length-1],lastClose=closes[closes.length-1];
    const vol20avg=vols.slice(-20).reduce((a,b)=>a+b,0)/20,volRatio=vols[vols.length-1]/vol20avg;
    const sr=findSupportResistance(highs,lows,closes),indData={rsi,macd,bb,stoch,atr,obv,volRatio,ema20,ema50,lastClose};
    const pa=analyzePriceAction(data);
    return{ticker,price:lastClose,revResult:generateAnalysis(ticker,indData,sr,pa),conResult:generateContinuationAnalysis(ticker,indData,sr,pa)};
  }catch(e){return null;}
}

function renderScanCard({ticker,price,revResult,conResult,combinedStrength}){
  const pct=Math.round(combinedStrength*100),isPerfect=combinedStrength>0.4;
  const top=revResult.keySignals.find(s=>s.type==='bull')||conResult.keySignals.find(s=>s.type==='bull');
  const txt=top?top.text.slice(0,110)+(top.text.length>110?'...':''):'Both engines aligned bullish.';
  const name=ticker.replace(/-USD$/,''),priceStr='$'+price.toFixed(price<1?4:2);
  const card=document.createElement('div');
  card.className='scan-card'+(isPerfect?' perfect':'');
  card.innerHTML=`
    ${isPerfect?'<div class="scan-card-bar"></div>':''}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <div><div style="font-family:'Syne',sans-serif;font-weight:800;font-size:20px;color:var(--accent);">${name}</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">${priceStr}</div></div>
      <div style="text-align:right;"><div style="font-size:9px;color:var(--gold);letter-spacing:1.5px;font-weight:700;">${isPerfect?'\u26a1 PERFECT BULL':'\ud83d\udc02 GOLDEN BULL'}</div><div style="font-family:'Syne',sans-serif;font-weight:800;font-size:24px;color:var(--accent);line-height:1.1;">${pct}%</div><div style="font-size:9px;color:var(--muted);">CONVICTION</div></div>
    </div>
    <div style="font-size:11px;color:#c0cdd8;line-height:1.7;margin-bottom:12px;">${txt}</div>
    <div style="display:flex;gap:6px;margin-bottom:12px;"><span style="font-size:9px;padding:3px 8px;border:1px solid var(--accent);color:var(--accent);">REVERSAL \u2713</span><span style="font-size:9px;padding:3px 8px;border:1px solid var(--accent3);color:var(--accent3);">CONTINUATION \u2713</span></div>
    <div style="font-size:10px;color:var(--muted);letter-spacing:1.5px;border-top:1px solid var(--border);padding-top:10px;">CLICK TO ANALYZE \u2192</div>`;
  card.addEventListener('click',()=>loadTickerAndAnalyze(ticker));
  card.addEventListener('mouseover',()=>{card.style.borderColor='rgba(0,255,136,0.6)';card.style.background='rgba(0,255,136,0.03)';});
  card.addEventListener('mouseout',()=>{card.style.borderColor=isPerfect?'rgba(0,255,136,0.45)':'rgba(0,255,136,0.2)';card.style.background='var(--surface)';});
  document.getElementById('scanResultsGrid').appendChild(card);
}

function loadTickerAndAnalyze(ticker){
  document.getElementById('tickerInput').value=ticker.replace(/-USD$/,'');
  window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>runAnalysis(),400);
}

async function runScanner(){
  const btn=document.getElementById('scanBtn');
  if(btn.disabled)return;
  btn.disabled=true;btn.textContent='\u23f3 SCANNING...';
  const bar=document.getElementById('scanProgressBar'),countEl=document.getElementById('scanProgressCount'),statusEl=document.getElementById('scanStatusText'),foundEl=document.getElementById('scanFoundMsg'),grid=document.getElementById('scanResultsGrid'),emptyEl=document.getElementById('scanEmpty'),hdrEl=document.getElementById('scanResultsHeader');
  grid.innerHTML='';emptyEl.style.display='none';hdrEl.style.display='none';
  document.getElementById('scanProgress').style.display='block';
  bar.style.width='0%';foundEl.textContent='';
  const total=SCAN_UNIVERSE.length;let processed=0,found=0;
  for(let i=0;i<total;i+=5){
    const batch=SCAN_UNIVERSE.slice(i,i+5);
    statusEl.textContent='Scanning '+batch.map(t=>t.replace(/-USD$/,'')).join(', ')+'...';
    const results=await Promise.allSettled(batch.map(t=>quickAnalyzeForScan(t)));
    results.forEach(res=>{
      processed++;bar.style.width=((processed/total)*100).toFixed(1)+'%';countEl.textContent=processed+' / '+total;
      if(res.status!=='fulfilled'||!res.value)return;
      const{ticker,price,revResult,conResult}=res.value;
      if(revResult.bias!=='BULLISH'||conResult.bias!=='BULLISH')return;
      const cs=(Math.abs(revResult.score)+Math.abs(conResult.score))/2;
      found++;foundEl.textContent=found+' golden bull'+(found!==1?'s':'')+' found...';
      renderScanCard({ticker,price,revResult,conResult,combinedStrength:cs});
      hdrEl.style.display='block';hdrEl.textContent=found+' GOLDEN BULL'+(found!==1?'S':'')+' FOUND';
    });
    if(i+5<total)await new Promise(r=>setTimeout(r,500));
  }
  document.getElementById('scanProgress').style.display='none';
  if(found===0)emptyEl.style.display='block';
  else hdrEl.textContent=found+' GOLDEN BULL'+(found!==1?'S':'')+' FOUND \u2014 CLICK ANY TO ANALYZE';
  btn.disabled=false;btn.textContent='\ud83d\udd04 SCAN AGAIN';
}