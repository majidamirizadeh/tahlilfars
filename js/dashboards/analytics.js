/* تب «تحلیل» — داشبورد کارت‌های ثابت (بدون انتخاب شاخص).
   ورودی از app.js: rows (محدوده فعلی با همه فیلترهای بالای صفحه)، baseRows (کل استان با فیلتر کاربری/شهروروستا
   ولی بدون فیلتر امور — مبنای «٪ از استان»)، activeAreas (فیلتر امور فعلی).
   با هر تغییر فیلتر بالای صفحه، renderAnalytics دوباره فراخوانی می‌شود. */
import {calc} from "./map.js";
import {sum} from "../engines/statistics.js";
import {fa, fmtMetric, absStatus, healthScore, scoreFormulaText, hasSpectrum, spectrumT} from "../engines/analyticsEngine.js";

const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const pct = (a,b) => b ? 100*a/b : null;
/** نسبت مقدار یک شاخص در محدوده فعلی به مقدار همان شاخص در محدوده مرجع (والد)، به درصد. */
const ratio = (metric, rows, base) => { const b=calc(base,metric); return b ? 100*calc(rows,metric)/b : null; };
const pf = (v,d=1) => v===null||v===undefined||!Number.isFinite(v) ? "—" : fa(v,d)+"٪";
const splitRows = rows => ({city: rows.filter(r=>r.settlementType==="شهر"), rural: rows.filter(r=>r.settlementType==="روستا")});
const fm = (metric,v) => fmtMetric(metric,v);

/* حالت باز شدن نمودار کارت تعداد مشترک + drill-down */
let custExpand = null; // null | "right" | "left"
let custDrillUsage = null; // null | نام کاربری
let custDrillArea = null;  // null | نام امور (استان → شهرهای امور)
let custDrillCity = null;  // null | نام شهر (امور → کاربری‌های شهر)

/* ───────── نمره امور/شهر + رتبه (رتبه در استان برای امور، رتبه در امور برای شهر) ───────── */
function areaRanks(baseRows){
  const byArea = new Map();
  baseRows.forEach(r=>{ if(!r.area) return; if(!byArea.has(r.area)) byArea.set(r.area,[]); byArea.get(r.area).push(r); });
  const scored = [...byArea.entries()].map(([area,rs])=>({area, hs:healthScore(rs)})).filter(x=>x.hs);
  scored.sort((a,b)=>b.hs.score-a.hs.score);
  return scored;
}
function cityRanks(areaRows){
  const byCity = new Map();
  areaRows.forEach(r=>{ if(!r.city) return; if(!byCity.has(r.city)) byCity.set(r.city,[]); byCity.get(r.city).push(r); });
  const scored = [...byCity.entries()].map(([city,rs])=>({city, hs:healthScore(rs)})).filter(x=>x.hs);
  scored.sort((a,b)=>b.hs.score-a.hs.score);
  return scored;
}
const RING_R = 42, RING_C = 2*Math.PI*RING_R;
/** توضیح کوتاه نمره: مقدار و وضعیت هر مؤلفه (مثلاً «درصد وصول ۸۰٫۳٪ (هشدار) و دوره وصول …») */
function scoreDesc(hs){
  const partText = p => { const f=fm(p.metric,p.value); const u=/[٪%]/.test(f.unit)?"٪":(f.unit?" "+f.unit:""); return `${p.label} ${f.num}${u} (${p.status.label})`; };
  return hs.parts.map(partText).join(" و ")+" است.";
}
const sev3Of = hs => hs.sev==="red" ? "red" : hs.sev==="orange" ? "orange" : "green";
const SEV3_LABEL = {red:"بحرانی", orange:"هشدار", green:"عادی"};

function scoreCard(rows, baseRows, areaRows, activeAreas, singleArea, singleCity, S){
  const name = singleCity ? singleCity : singleArea ? singleArea
    : activeAreas.length>1 ? `${fa(activeAreas.length)} امور انتخاب‌شده` : "کل استان";
  const hs = healthScore(rows);
  if(!hs) return `<article class="ax-card ax-score none">
    <div class="ax-score-top"><div class="ax-score-name">${esc(name)}</div></div>
    <p class="ax-empty">داده درآمدی برای این محدوده نیست.</p>
  </article>`;

  const sev3 = sev3Of(hs), label3 = SEV3_LABEL[sev3];
  const desc = scoreDesc(hs);

  let rankLine = "";
  if(singleCity){
    const idx = cityRanks(areaRows).findIndex(x=>x.city===singleCity), ranks = cityRanks(areaRows);
    if(idx>=0) rankLine = `رتبه <b>${fa(idx+1)}</b> از ${fa(ranks.length)} در امور`;
  }else if(singleArea){
    const ranks = areaRanks(baseRows), idx = ranks.findIndex(x=>x.area===singleArea);
    if(idx>=0) rankLine = `رتبه <b>${fa(idx+1)}</b> از ${fa(ranks.length)} در استان`;
  }

  const offset = RING_C*(1-Math.max(0,Math.min(100,hs.score))/100);
  return `<article class="ax-card ax-score ${sev3}">
    <div class="ax-score-top">
      <div class="ax-score-name">${esc(name)}${rankLine?`<span class="ax-score-rank">${rankLine}</span>`:""}</div>
      <em class="ax-tag ${sev3}">${label3}</em>
    </div>
    <div class="ax-score-body">
      <div class="ax-ring-wrap">
        <div class="ax-ring${sc?" on":""}" data-scopen="1" role="button" tabindex="0" title="کلیک برای لیست نمره امور (و کاربری) به ترتیب وضعیت">
          <svg viewBox="0 0 100 100" class="ax-ring-svg">
            <circle cx="50" cy="50" r="${RING_R}" class="ax-ring-bg"/>
            <circle cx="50" cy="50" r="${RING_R}" class="ax-ring-fg" style="stroke-dasharray:${RING_C.toFixed(1)};stroke-dashoffset:${offset.toFixed(1)}"/>
          </svg>
          <div class="ax-ring-center"><b>${fa(hs.score,0)}</b><span>از ۱۰۰</span></div>
        </div>
        <span class="ax-ring-hint" data-scopen="1">${sc?"بستن ▴":"لیست ▾"}</span>
      </div>
      <p class="ax-desc">${esc(desc)}</p>
    </div>
    ${sc ? scorePanel(S) : ""}
  </article>`;
}

/* ───────── کاربری غالب (بجز مسکونی) ───────── */
function topUsages(rows, n=3){
  const byU = new Map();
  rows.forEach(r=>{
    if(!r.usage || r.usage==="مسکونی") return;
    byU.set(r.usage, (byU.get(r.usage)||0) + (r.customers||0));
  });
  const total = sum(rows,"customers") || 1;
  return [...byU.entries()]
    .map(([usage,cust])=>({usage, cust, pct: 100*cust/total}))
    .sort((a,b)=>b.cust-a.cust)
    .slice(0,n);
}

/* ───────── تعداد مشترک — بازطراحی دو نیمه ───────── */
function customersCard(rows, compare, baseRows, areaRows, singleArea, singleCity, activeAreas){
  const total = sum(rows,"customers");
  const {city,rural} = splitRows(rows);
  const cityN = sum(city,"customers"), ruralN = sum(rural,"customers");
  const cityPct = pct(cityN,total) || 0;
  const ruralPct = pct(ruralN,total) || 0;

  /* درصد از والد */
  let parentPctHtml = "";
  if(compare){
    const rTotal = ratio("customers",rows,compare.base);
    parentPctHtml = `<div class="ax-cust-parent">٪ از ${esc(compare.label)}: <b>${pf(rTotal)}</b></div>`;
  }

  /* بافت */
  let textureLabel = "";
  if(singleCity){
    const tops = topUsages(rows, 1);
    textureLabel = tops.length ? `بافت غالب: ${tops[0].usage}` : "بافت غالب نامشخص";
  }else if(cityPct > ruralPct + 2){
    textureLabel = "بافت شهری";
  }else if(ruralPct > cityPct + 2){
    textureLabel = "بافت روستایی";
  }else{
    textureLabel = "بافت مختلط شهری/روستایی";
  }

  /* سه کاربری غالب بجز مسکونی */
  const tops3 = topUsages(rows, 3);
  const topsHtml = tops3.length
    ? `<div class="ax-cust-usages">${tops3.map(t=>`<span><em>${esc(t.usage)}</em> <b>${pf(t.pct)}</b></span>`).join("")}</div>`
    : `<div class="ax-cust-usages"><span class="muted">کاربری غیرمسکونی نیست</span></div>`;

  /* استوانهٔ سه‌بعدی دورنگ به ارتفاع کارت: سهم مشترکین شهر (آبی) / روستا (سبز) — هماهنگ با استوانهٔ کارت مصرف */
  const cylHtml = cylinder(cityPct, ruralPct, `مشترکین شهر ${pf(cityPct)} · روستا ${pf(ruralPct)}`);

  /* نمودار بازشونده */
  let chartHtml = "";
  if(custExpand==="right"){
    chartHtml = buildSettlementChart(rows, baseRows, areaRows, singleArea, singleCity, activeAreas);
  }else if(custExpand==="left"){
    chartHtml = buildUsageChart(rows, baseRows, areaRows, singleArea, singleCity);
  }

  /* چیدمان دو کادر زیر هم: بالا عدد اصلی + استوانه، پایین بافت + کاربری‌های پرمصرف */
  return `<article class="ax-card ax-customers">
    <h3><i class="ico ico-users"></i>تعداد مشترک</h3>
    <div class="ax-cust-body">
      <div class="ax-cust-top">
        <div class="ax-cust-right" data-side="right" role="button" tabindex="0" title="کلیک برای نمودار امور/شهر">
          <div class="ax-total"><b>${fa(total)}</b><span class="unit">مشترک</span></div>
          ${parentPctHtml}
        </div>
        <div class="ax-cust-cyl" data-side="right" role="button" tabindex="0" title="کلیک برای نمودار امور/شهر">${cylHtml}</div>
      </div>
      <div class="ax-cust-left" data-side="left" role="button" tabindex="0" title="کلیک برای نمودار کاربری">
        <div class="ax-cust-texture">${esc(textureLabel)}</div>
        ${topsHtml}
      </div>
    </div>
    ${chartHtml}
  </article>`;
}

function buildSettlementChart(rows, baseRows, areaRows, singleArea, singleCity, activeAreas){
  /* drill: امور → شهر → کاربری */
  if(custDrillArea && custDrillCity){
    return buildSettlementCityUsageChart(baseRows, custDrillArea, custDrillCity);
  }
  if(custDrillArea && !singleArea){
    return buildSettlementDrillChart(baseRows, custDrillArea);
  }
  /* اگر فیلتر امور فعال است و شهر انتخاب شده برای drill */
  if(singleArea && custDrillCity){
    return buildSettlementCityUsageChart(areaRows || rows, singleArea, custDrillCity);
  }

  let items = [];
  let highlight = null;
  let rankMap = new Map();
  let unitLabel = "امور";
  let canDrillArea = false;
  let canDrillCity = false;
  let areaForCity = null;

  if(singleArea || (activeAreas && activeAreas.length===1)){
    const src = areaRows || rows;
    areaForCity = singleArea || (activeAreas && activeAreas[0]) || null;
    const byCity = new Map();
    src.forEach(r=>{
      if(!r.city) return;
      if(!byCity.has(r.city)) byCity.set(r.city,{city:0,rural:0,total:0});
      const o = byCity.get(r.city);
      const c = r.customers||0;
      if(r.settlementType==="شهر") o.city += c; else o.rural += c;
      o.total += c;
    });
    items = [...byCity.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.total-a.total);
    if(singleCity) highlight = singleCity;
    cityRanks(src).forEach((x,i)=>rankMap.set(x.city,i+1));
    unitLabel = "شهر";
    canDrillCity = true;
  }else{
    const src = baseRows || rows;
    const byArea = new Map();
    src.forEach(r=>{
      if(!r.area) return;
      if(!byArea.has(r.area)) byArea.set(r.area,{city:0,rural:0,total:0});
      const o = byArea.get(r.area);
      const c = r.customers||0;
      if(r.settlementType==="شهر") o.city += c; else o.rural += c;
      o.total += c;
    });
    items = [...byArea.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.total-a.total);
    if(activeAreas && activeAreas.length===1) highlight = activeAreas[0];
    else if(singleArea) highlight = singleArea;
    areaRanks(src).forEach((x,i)=>rankMap.set(x.area,i+1));
    canDrillArea = true;
  }

  const maxT = Math.max(...items.map(i=>i.total),1);
  const grand = items.reduce((s,i)=>s+i.total,0) || 1;
  /* خط میانگین استان — فقط در نمودار سطح امور (canDrillArea)، نه در سطح شهر */
  const avgPct = canDrillArea && items.length ? 100*(grand/items.length)/maxT : null;
  const rowsHtml = items.map(it=>{
    const isHi = highlight && it.name===highlight;
    const rank = rankMap.get(it.name);
    const cityW = (100*it.city/maxT).toFixed(1);
    const ruralW = (100*it.rural/maxT).toFixed(1);
    const share = 100*it.total/grand;
    const label = it.name.replace(/^امور\s*/,"");
    const pctCenter = pf(share);
    let drillCls = "", drillAttr = "";
    if(canDrillArea){
      drillCls = " ax-area-row";
      drillAttr = ` data-area="${esc(it.name)}" role="button" tabindex="0" title="کلیک برای شهرهای این امور"`;
    }else if(canDrillCity){
      drillCls = " ax-city-row";
      drillAttr = ` data-city="${esc(it.name)}" data-area="${esc(areaForCity||"")}" role="button" tabindex="0" title="کلیک برای کاربری‌های این شهر"`;
    }
    return `<div class="ax-hchart-row${isHi?" ax-blink":""}${drillCls}"${drillAttr}>
      <div class="ax-hchart-label"><span class="ax-hchart-name${isHi?" ax-name-blink":""}">${esc(label)}</span>${rank?`<small>رتبه ${fa(rank)}</small>`:""}</div>
      <div class="ax-hchart-bar">
        <div class="ax-hchart-seg ax-hchart-city" data-w="${cityW}"></div>
        <div class="ax-hchart-seg ax-hchart-rural" data-w="${ruralW}"></div>
        <span class="ax-bar-pct-center">${pctCenter}</span>
        ${avgLineHtml(avgPct)}
      </div>
      <div class="ax-hchart-val">${fa(it.total)}</div>
    </div>`;
  }).join("");

  let tip = "";
  if(canDrillArea) tip = ` <small>(کلیک روی امور ← شهرها ← کاربری)</small>`;
  else if(canDrillCity) tip = ` <small>(کلیک روی شهر برای کاربری‌ها)</small>`;
  return `<div class="ax-hchart" data-chart="settlement">
    <div class="ax-hchart-title">تعداد مشترک به تفکیک شهر / روستا — مرتب‌شده بر اساس ${unitLabel}${tip}</div>
    <div class="ax-hchart-legend"><span class="lg-city">شهر</span><span class="lg-rural">روستا</span>${avgPct!==null?'<span class="lg-avg"><i></i>میانگین استان</span>':""}</div>
    <div class="ax-hchart-list">${rowsHtml||'<p class="ax-empty">داده‌ای نیست</p>'}</div>
  </div>`;
}

function buildSettlementDrillChart(baseRows, areaName){
  const src = (baseRows || []).filter(r=>r.area===areaName);
  const byCity = new Map();
  src.forEach(r=>{
    if(!r.city) return;
    if(!byCity.has(r.city)) byCity.set(r.city,{city:0,rural:0,total:0});
    const o = byCity.get(r.city);
    const c = r.customers||0;
    if(r.settlementType==="شهر") o.city += c; else o.rural += c;
    o.total += c;
  });
  const items = [...byCity.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.total-a.total);
  const maxT = Math.max(...items.map(i=>i.total),1);
  const grand = items.reduce((s,i)=>s+i.total,0) || 1;
  const ranks = cityRanks(src);
  const rankMap = new Map(ranks.map((x,i)=>[x.city,i+1]));

  const rowsHtml = items.map(it=>{
    const cityW = (100*it.city/maxT).toFixed(1);
    const ruralW = (100*it.rural/maxT).toFixed(1);
    const share = 100*it.total/grand;
    const pctCenter = pf(share);
    const rank = rankMap.get(it.name);
    return `<div class="ax-hchart-row ax-city-row" data-city="${esc(it.name)}" data-area="${esc(areaName)}" role="button" tabindex="0" title="کلیک برای کاربری‌های این شهر">
      <div class="ax-hchart-label">${esc(it.name)}${rank?`<small>رتبه ${fa(rank)}</small>`:""}</div>
      <div class="ax-hchart-bar">
        <div class="ax-hchart-seg ax-hchart-city" data-w="${cityW}"></div>
        <div class="ax-hchart-seg ax-hchart-rural" data-w="${ruralW}"></div>
        <span class="ax-bar-pct-center">${pctCenter}</span>
      </div>
      <div class="ax-hchart-val">${fa(it.total)}</div>
    </div>`;
  }).join("");

  const shortName = areaName.replace(/^امور\s*/,"");
  return `<div class="ax-hchart" data-chart="settlement-drill">
    <div class="ax-hchart-title">
      <button type="button" class="ax-drill-back" data-action="back-area" title="بازگشت">← بازگشت</button>
      امور «${esc(shortName)}» — شهرها <small>(کلیک روی شهر برای کاربری)</small>
    </div>
    <div class="ax-hchart-legend"><span class="lg-city">شهر</span><span class="lg-rural">روستا</span></div>
    <div class="ax-hchart-list">${rowsHtml||'<p class="ax-empty">شهری در این امور نیست</p>'}</div>
  </div>`;
}

function buildSettlementCityUsageChart(srcRows, areaName, cityName){
  const src = (srcRows || []).filter(r=>{
    if(areaName && r.area!==areaName) return false;
    return r.city===cityName;
  });
  const byU = new Map();
  src.forEach(r=>{
    if(!r.usage) return;
    byU.set(r.usage, (byU.get(r.usage)||0) + (r.customers||0));
  });
  const grand = [...byU.values()].reduce((s,v)=>s+v,0) || 1;
  const items = [...byU.entries()].map(([name,total])=>({name,total,pct:100*total/grand})).sort((a,b)=>b.total-a.total);
  const maxT = Math.max(...items.map(i=>i.total),1);

  const rowsHtml = items.map(it=>{
    const w = (100*it.total/maxT).toFixed(1);
    const isRes = it.name==="مسکونی";
    const pctCenter = pf(it.pct);
    return `<div class="ax-hchart-row">
      <div class="ax-hchart-label">${esc(it.name)}</div>
      <div class="ax-hchart-bar">
        <div class="ax-hchart-seg ax-hchart-usage${isRes?" is-res":""}" data-w="${w}"></div>
        <span class="ax-bar-pct-center">${pctCenter}</span>
      </div>
      <div class="ax-hchart-val">${fa(it.total)}</div>
    </div>`;
  }).join("");

  const shortArea = (areaName||"").replace(/^امور\s*/,"");
  return `<div class="ax-hchart" data-chart="settlement-city-usage">
    <div class="ax-hchart-title">
      <button type="button" class="ax-drill-back" data-action="back-city" title="بازگشت">← بازگشت</button>
      ${esc(cityName)}${shortArea?` — ${esc(shortArea)}`:""} · کاربری‌ها
    </div>
    <div class="ax-hchart-list">${rowsHtml||'<p class="ax-empty">کاربری‌ای نیست</p>'}</div>
  </div>`;
}

function buildUsageChart(rows, baseRows, areaRows, singleArea, singleCity){
  /* اگر drill-down فعال باشد: نمایش امور/شهر برای همان کاربری با تفکیک شهر/روستا */
  if(custDrillUsage){
    return buildUsageDrillChart(rows, baseRows, areaRows, singleArea, singleCity, custDrillUsage);
  }

  const src = rows;
  const byU = new Map();
  src.forEach(r=>{
    if(!r.usage) return;
    byU.set(r.usage, (byU.get(r.usage)||0) + (r.customers||0));
  });
  const grandTotal = sum(src,"customers") || 1;
  const items = [...byU.entries()].map(([name,total])=>({name,total,pct:100*total/grandTotal})).sort((a,b)=>b.total-a.total);
  const maxT = Math.max(...items.map(i=>i.total),1);
  const rowsHtml = items.map(it=>{
    const w = (100*it.total/maxT).toFixed(1);
    const isRes = it.name==="مسکونی";
    const pctLabel = pf(it.pct);
    return `<div class="ax-hchart-row ax-usage-row" data-usage="${esc(it.name)}" role="button" tabindex="0" title="کلیک برای جزئیات این کاربری">
      <div class="ax-hchart-label">${esc(it.name)}</div>
      <div class="ax-hchart-bar">
        <div class="ax-hchart-seg ax-hchart-usage${isRes?" is-res":""}" data-w="${w}"></div>
        <span class="ax-bar-pct-center">${pctLabel}</span>
      </div>
      <div class="ax-hchart-val">${fa(it.total)}</div>
    </div>`;
  }).join("");

  return `<div class="ax-hchart" data-chart="usage">
    <div class="ax-hchart-title">تعداد مشترک به تفکیک کاربری <small>(کلیک روی هر کاربری برای جزئیات)</small></div>
    <div class="ax-hchart-list">${rowsHtml||'<p class="ax-empty">داده‌ای نیست</p>'}</div>
  </div>`;
}

function buildUsageDrillChart(rows, baseRows, areaRows, singleArea, singleCity, usageName){
  let items = [];
  let unitLabel = "امور";

  if(singleArea){
    /* سطح امور انتخاب‌شده → تفکیک شهر */
    const src = (areaRows || rows).filter(r=>r.usage===usageName);
    const byCity = new Map();
    src.forEach(r=>{
      if(!r.city) return;
      if(!byCity.has(r.city)) byCity.set(r.city,{city:0,rural:0,total:0});
      const o = byCity.get(r.city);
      const c = r.customers||0;
      if(r.settlementType==="شهر") o.city += c; else o.rural += c;
      o.total += c;
    });
    items = [...byCity.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.total-a.total);
    unitLabel = "شهر";
  }else{
    const src = (baseRows || rows).filter(r=>r.usage===usageName);
    const byArea = new Map();
    src.forEach(r=>{
      if(!r.area) return;
      if(!byArea.has(r.area)) byArea.set(r.area,{city:0,rural:0,total:0});
      const o = byArea.get(r.area);
      const c = r.customers||0;
      if(r.settlementType==="شهر") o.city += c; else o.rural += c;
      o.total += c;
    });
    items = [...byArea.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.total-a.total);
  }

  const maxT = Math.max(...items.map(i=>i.total),1);
  const grand = items.reduce((s,i)=>s+i.total,0) || 1;
  const rowsHtml = items.map(it=>{
    const cityW = (100*it.city/maxT).toFixed(1);
    const ruralW = (100*it.rural/maxT).toFixed(1);
    const share = 100*it.total/grand;
    const label = it.name.replace(/^امور\s*/,"");
    const pctCenter = pf(share);
    return `<div class="ax-hchart-row">
      <div class="ax-hchart-label">${esc(label)}</div>
      <div class="ax-hchart-bar">
        <div class="ax-hchart-seg ax-hchart-city" data-w="${cityW}"></div>
        <div class="ax-hchart-seg ax-hchart-rural" data-w="${ruralW}"></div>
        <span class="ax-bar-pct-center">${pctCenter}</span>
      </div>
      <div class="ax-hchart-val">${fa(it.total)}</div>
    </div>`;
  }).join("");

  return `<div class="ax-hchart" data-chart="usage-drill">
    <div class="ax-hchart-title">
      <button type="button" class="ax-drill-back" data-action="back-usage" title="بازگشت">← بازگشت</button>
      کاربری «${esc(usageName)}» به تفکیک ${unitLabel}
    </div>
    <div class="ax-hchart-legend"><span class="lg-city">شهر</span><span class="lg-rural">روستا</span></div>
    <div class="ax-hchart-list">${rowsHtml||'<p class="ax-empty">داده‌ای برای این کاربری نیست</p>'}</div>
  </div>`;
}

/* ───────── آیکون دورنگ (آدمک/قطره): شهر آبی سمت راست، روستا سبز سمت چپ + درصدها در یک خط ───────── */
const C_CITY = "var(--c-city)", C_RURAL = "var(--c-rural)";
/** میلهٔ افقی دورنگ به عرض کامل کارت: راست سهم شهر (آبی)، چپ سهم روستا (سبز)؛ روی هر قطعه فقط درصد. */
function cylinder(cityPct, ruralPct, title){
  const cp = Math.max(0, Math.min(100, Number.isFinite(cityPct)?cityPct:0));
  const rp = Math.max(0, Math.min(100, Number.isFinite(ruralPct)?ruralPct:(100-cp)));
  const seg = (cls, v) => `<div class="ax-cyl-seg ${cls}" style="width:${v.toFixed(1)}%">${v>=7?`<span>${pf(v)}</span>`:""}</div>`;
  return `<div class="ax-cyl" title="${esc(title||"")}">
    <div class="ax-cyl-tube">${seg("ax-cyl-city",cp)}${seg("ax-cyl-rural",rp)}</div>
  </div>`;
}

/* ───────── مصرف: ۴ خط (مصرف کل، سرانه، متوسط روزانه، قیمت هر مترمکعب) ───────── */
const CONS_LINES = [
  {key:"total", m:"consumption", label:"مصرف کل", add:true},
  {key:"per",   m:"perConsumption", label:"سرانه مصرف — مترمکعب/مشترک/ماه", add:false},
  {key:"day",   m:"perConsumptionDay", label:"متوسط مصرف روزانه", add:true},
  {key:"price", m:"idxPrice", label:"قیمت هر مترمکعب آب — ریال", add:false}
];
let consOpen = null;              // null | {key, side:"right"|"left"}
let consDA = null, consDC = null; // drill نمودار راست: امور ← شهر ← کاربری
let consDU = null, consDUA = null;// drill نمودار چپ: کاربری ← امور ← شهر

/** مصرف کل: از یک میلیون به بالا «میلیون مترمکعب»، زیرش مقدار دقیق مترمکعب */
function consMain(v){
  if(Math.abs(v) >= 1e6) return {num:fa(v/1e6,2), unit:"میلیون مترمکعب", sub:`${fa(v,0)} مترمکعب`};
  return {num:fa(v,0), unit:"مترمکعب", sub:""};
}
const cmv = (m,v) => { if(m==="consumption"){ const c=consMain(v); return `${c.num} ${c.unit}`; } const f=fm(m,v); return `${f.num}${f.unit?" "+f.unit:""}`; };

function consRefLine(label, base, line, rows){
  const {city,rural} = splitRows(rows), {city:bc, rural:br} = splitRows(base);
  const m = line.m, bv = calc(base,m), bcv = calc(bc,m), brv = calc(br,m);
  const share = (x,y) => y ? 100*x/y : null;
  return `<div class="ax-cl-ref"><b>${esc(label)}</b> ${cmv(m,bv)} <span>شهر ${cmv(m,bcv)}</span> <span>روستا ${cmv(m,brv)}</span>
    <em>٪ کل ${pf(share(calc(rows,m),bv))} · شهر ${pf(share(calc(city,m),bcv))} · روستا ${pf(share(calc(rural,m),brv))}</em></div>`;
}

function consumptionCard(S){
  const {rows, baseRows, areaRows, singleArea, singleCity} = S;
  const {city,rural} = splitRows(rows);
  /* زیرخط‌ها پیرو فیلتر: فقط خط سرانه مصرف و قیمت هر مترمکعب، فقط مقدار کل استان/امور (بدون شهر و روستا) */
  const REF_LABEL = {per:"سرانه", price:"قیمت"};
  const refsFor = l => (l.key==="per"||l.key==="price")
    ? (singleCity ? [[`${REF_LABEL[l.key]} استان`,baseRows],[`${REF_LABEL[l.key]} امور`,areaRows]] : singleArea ? [[`${REF_LABEL[l.key]} استان`,baseRows]] : [])
    : [];
  const consAll = calc(rows,"consumption"), consC = calc(city,"consumption"), consR = calc(rural,"consumption");

  const linesHtml = CONS_LINES.map(l=>{
    const tot = calc(rows,l.m), cv = calc(city,l.m), rv = calc(rural,l.m);
    let mainHtml;
    if(l.key==="total"){
      const c = consMain(tot);
      mainHtml = `<div class="ax-cl-main"><b>${c.num}</b><span class="unit">${c.unit}</span></div>${c.sub?`<div class="ax-cl-sub">${c.sub}</div>`:""}`;
    }else{
      const f = fm(l.m,tot);
      mainHtml = `<div class="ax-cl-main"><b>${f.num}</b><span class="unit">${f.unit}</span></div>`;
    }
    let leftHtml, isCyl = false;
    if(l.key==="total"){
      leftHtml = cylinder(pct(consC,consAll)||0, pct(consR,consAll)||0, "سهم شهر/روستا از مصرف کل");
      isCyl = true;
    }else{
      leftHtml = `<div class="ax-cl-split"><span class="ax-pc" style="--c:${C_CITY}"><i></i>شهر <b>${fm(l.m,cv).num}</b></span><span class="ax-pc" style="--c:${C_RURAL}"><i></i>روستا <b>${fm(l.m,rv).num}</b></span></div>`;
    }
    const on = side => consOpen && consOpen.key===l.key && consOpen.side===side ? " on" : "";
    /* راست‌چین مثل کارت مشترک: باکس عدد اصلی راست صفحه، استوانه/تقسیم شهر-روستا سمت چپ */
    return `<div class="ax-cline" data-cl="${l.key}">
      <div class="ax-cl-body${isCyl?" ax-cl-body--col":""}">
        <div class="ax-cl-right${on("right")}" data-cside="right" role="button" tabindex="0" title="کلیک برای نمودار امور/شهر"><span class="ax-cl-lab">${l.label}</span>${mainHtml}</div>
        <div class="ax-cl-left${isCyl?" ax-cl-left--cyl":""}${on("left")}" data-cside="left" role="button" tabindex="0" title="کلیک برای نمودار کاربری">${leftHtml}</div>
      </div>
      ${refsFor(l).map(([lb,base])=>{ const r = fm(l.m,calc(base,l.m)); return `<div class="ax-fin-ref ax-cons-ref"><span>${lb}</span><b>${r.num}</b><i>${r.unit}</i></div>`; }).join("")}
      ${consOpen && consOpen.key===l.key ? consChart(l, S) : ""}
    </div>`;
  }).join("");
  return `<article class="ax-card ax-consumption"><h3><i class="ico ico-droplet"></i>مصرف</h3>${linesHtml}</article>`;
}

/* ── نمودارهای خط‌های مصرف ── */
function groupBy(rs, keyFn){
  const m = new Map();
  rs.forEach(r=>{ const k = keyFn(r); if(!k) return; if(!m.has(k)) m.set(k,{all:[],c:[],r:[]}); const g = m.get(k); g.all.push(r); (r.settlementType==="شهر"?g.c:g.r).push(r); });
  return m;
}
function consItems(map, line, {usage=false}={}){
  return [...map.entries()].map(([name,g])=>({name, t:calc(g.all,line.m), c:g.c.length?calc(g.c,line.m):0, r:g.r.length?calc(g.r,line.m):0, hasC:!!g.c.length, hasR:!!g.r.length}))
    .sort((a,b)=>b.t-a.t);
}
const avgLineHtml = pct => Number.isFinite(pct) ? `<div class="ax-avg-line" style="right:${Math.max(0,Math.min(100,pct)).toFixed(1)}%"></div>` : "";
function consRowsHtml(items, line, {kind, extra=(()=>""), showAvg=false, avgValue=null}){
  if(!items.length) return '<p class="ax-empty">داده‌ای نیست</p>';
  const max = Math.max(...items.map(i=>line.add ? i.t : Math.max(i.c,i.r,i.t)), 1e-9);
  const grand = items.reduce((a,i)=>a+i.t,0) || 1;
  const avgPct = showAvg && items.length ? 100*(Number.isFinite(avgValue) ? avgValue : grand/items.length)/max : null;
  const mil = line.m==="consumption" && max>=1e6;
  /* مبالغ اصلی: یک واحد برای کل نمودار (زیر یک میلیون ریال → ریال) */
  const isMoney = MONEY_M.has(line.m);
  lastMoneyRial = isMoney && max>0 && max<1e6;
  const vs = v => line.m==="consumption" ? (mil ? fa(v/1e6,2) : fa(v,0)) : isMoney ? (lastMoneyRial ? fa(v,0) : fa(v/1e6,0)) : fm(line.m,v).num;
  return items.map(it=>{
    const label = it.name.replace(/^امور\s*/,"");
    const avg = avgLineHtml(avgPct);
    const bar = kind==="usage"
      ? `<div class="ax-hchart-bar"><div class="ax-hchart-seg ax-hchart-usage${it.name==="مسکونی"?" is-res":""}" data-w="${(100*it.t/max).toFixed(1)}"></div>${line.add?`<span class="ax-bar-pct-center">${pf(100*it.t/grand)}</span>`:""}${avg}</div>`
      : line.add
        ? `<div class="ax-hchart-bar"><div class="ax-hchart-seg ax-hchart-city" data-w="${(100*it.c/max).toFixed(1)}"></div><div class="ax-hchart-seg ax-hchart-rural" data-w="${(100*it.r/max).toFixed(1)}"></div><span class="ax-bar-pct-center">${pf(100*it.t/grand)}</span>${avg}</div>`
        : `<div class="ax-hchart-bar ax-dual" title="شهر ${it.hasC?vs(it.c):"—"} · روستا ${it.hasR?vs(it.r):"—"}"><div class="ax-hchart-seg ax-hchart-city" data-w="${it.hasC?(100*it.c/max).toFixed(1):0}"></div><div class="ax-hchart-seg ax-hchart-rural" data-w="${it.hasR?(100*it.r/max).toFixed(1):0}"></div>${avg}</div>`;
    return `<div class="ax-hchart-row${extra(it).cls||""}"${extra(it).attr||""}>
      <div class="ax-hchart-label"><span class="ax-hchart-name">${esc(label)}</span></div>${bar}
      <div class="ax-hchart-val">${vs(it.t)}${line.add?"":`<small>${it.hasC?vs(it.c):"—"} | ${it.hasR?vs(it.r):"—"}</small>`}</div></div>`;
  }).join("");
}
const MONEY_M = new Set(["income","collection","debtEnd","debtStart"]);
let lastMoneyRial = false;   // واحد آخرین نمودار مبلغ (ریال یا میلیون ریال)
function consChartFrame(line, title, body, {back=null, legend=true, unitNote="", showAvg=false}={}){
  if(MONEY_M.has(line.m)) unitNote = ` <small>(${lastMoneyRial?"ریال":"میلیون ریال"})</small>`;
  return `<div class="ax-hchart ax-cx" data-chart="cons-${line.key}">
    <div class="ax-hchart-title">${back?`<button type="button" class="ax-cx-back" data-cxback="${back}" title="بازگشت">← بازگشت</button>`:""}${title}${unitNote}</div>
    ${legend?`<div class="ax-hchart-legend"><span class="lg-city">شهر</span><span class="lg-rural">روستا</span>${line.add?"":"<small> (مقادیر: شهر | روستا)</small>"}${showAvg?'<span class="lg-avg"><i></i>میانگین استان</span>':""}</div>`:""}
    <div class="ax-hchart-list">${body}</div></div>`;
}
function consChart(line, S){
  const {rows, baseRows, areaRows, singleArea, activeAreas} = S;
  const lab = line.label.split("—")[0].trim();
  const unitNote = line.m==="consumption" ? ` <small>(${Math.max(...[...groupBy(rows,r=>r.area).values()].map(g=>calc(g.all,"consumption")),0)>=1e6?"میلیون مترمکعب":"مترمکعب"})</small>`
    : line.fin ? ` <small>(${esc(fm(line.m,0).unit)})</small>` : "";
  /* خط میانگین استان: برای خط‌های جمع‌پذیر میانگین امورها؛ برای سرانه‌ها مقدار سرانه کل استان */
  const avgValue = line.fin && !line.add ? calc(baseRows||rows, line.m) : null;
  const area1 = singleArea || (activeAreas && activeAreas.length===1 ? activeAreas[0] : null);
  const srcCities = singleArea ? areaRows : baseRows;

  if(consOpen.side==="right"){
    /* امور ← شهر ← کاربری */
    const aName = consDA || area1;
    if(consDC && aName){
      const rs = (singleArea?areaRows:baseRows).filter(r=>r.area===aName && r.city===consDC);
      const items = consItems(groupBy(rs, r=>r.usage), line);
      return consChartFrame(line, `${esc(lab)} — ${esc(consDC)} · کاربری‌ها`, consRowsHtml(items,line,{kind:"usage"}), {back:"city", legend:false, unitNote});
    }
    if(aName){
      const rs = (singleArea?areaRows:baseRows).filter(r=>r.area===aName);
      const items = consItems(groupBy(rs, r=>r.city), line);
      const body = consRowsHtml(items,line,{kind:"cities", extra:it=>({cls:" ax-cx-row", attr:` data-cxcity="${esc(it.name)}" role="button" tabindex="0" title="کلیک برای کاربری‌های این شهر"`})});
      return consChartFrame(line, `${esc(lab)} — امور «${esc(aName.replace(/^امور\s*/,""))}» · شهرها <small>(کلیک روی شهر برای کاربری)</small>`, body, {back:consDA?"area":null, unitNote});
    }
    const items = consItems(groupBy(baseRows||rows, r=>r.area), line);
    const body = consRowsHtml(items,line,{kind:"areas", showAvg:true, avgValue, extra:it=>({cls:" ax-cx-row", attr:` data-cxarea="${esc(it.name)}" role="button" tabindex="0" title="کلیک برای شهرهای این امور"`})});
    return consChartFrame(line, `${esc(lab)} به تفکیک امور <small>(کلیک روی امور ← شهرها ← کاربری)</small>`, body, {unitNote, showAvg:true});
  }

  /* چپ: کاربری ← امور ← شهر */
  if(consDU){
    if(consDUA || singleArea){
      const aName = consDUA || singleArea;
      const rs = (singleArea?areaRows:baseRows).filter(r=>r.area===aName && r.usage===consDU);
      const items = consItems(groupBy(rs, r=>r.city), line);
      return consChartFrame(line, `${esc(lab)} — «${esc(consDU)}» · شهرهای ${esc(aName.replace(/^امور\s*/,""))}`, consRowsHtml(items,line,{kind:"cities"}), {back:consDUA?"uarea":"usage", unitNote});
    }
    const items = consItems(groupBy((baseRows||rows).filter(r=>r.usage===consDU), r=>r.area), line);
    const body = consRowsHtml(items,line,{kind:"areas", extra:it=>({cls:" ax-cx-row", attr:` data-cxuarea="${esc(it.name)}" role="button" tabindex="0" title="کلیک برای شهرهای این امور"`})});
    return consChartFrame(line, `${esc(lab)} — کاربری «${esc(consDU)}» به تفکیک امور <small>(کلیک روی امور برای شهرها)</small>`, body, {back:"usage", unitNote});
  }
  const items = consItems(groupBy(rows, r=>r.usage), line);
  const body = consRowsHtml(items,line,{kind:"usage", extra:it=>({cls:" ax-cx-row", attr:` data-cxusage="${esc(it.name)}" role="button" tabindex="0" title="کلیک برای جزئیات این کاربری"`})});
  return consChartFrame(line, `${esc(lab)} به تفکیک کاربری <small>(کلیک روی هر کاربری برای جزئیات)</small>`, body, {legend:false, unitNote});
}

function bindConsClicks(container, ctx){
  const rerender = () => { const y = window.scrollY; renderAnalytics(ctx); window.scrollTo(0,y); };
  container.querySelectorAll(".ax-cline").forEach(line=>{
    const key = line.getAttribute("data-cl");
    line.querySelectorAll("[data-cside]").forEach(z=>{
      const act = e => {
        e.stopPropagation();
        const side = z.getAttribute("data-cside");
        if(consOpen && consOpen.key===key && consOpen.side===side) consOpen = null;
        else consOpen = {key, side};
        consDA = consDC = consDU = consDUA = null;
        rerender();
      };
      z.addEventListener("click", act);
      z.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); act(e); } });
    });
  });
  const on = (sel, attr, fn) => container.querySelectorAll(sel).forEach(el=>{
    const act = e => { e.stopPropagation(); fn(el.getAttribute(attr)); rerender(); };
    el.addEventListener("click", act);
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); act(e); } });
  });
  on("[data-cxarea]","data-cxarea", v=>{ consDA = v; consDC = null; });
  on("[data-cxcity]","data-cxcity", v=>{ consDC = v; });
  on("[data-cxusage]","data-cxusage", v=>{ consDU = v; consDUA = null; });
  on("[data-cxuarea]","data-cxuarea", v=>{ consDUA = v; });
  on("[data-cxback]","data-cxback", v=>{
    if(v==="city") consDC = null;
    else if(v==="area"){ consDA = null; consDC = null; }
    else if(v==="usage"){ consDU = null; consDUA = null; }
    else if(v==="uarea") consDUA = null;
  });
}

/* ───────── کارت‌های درآمد / وصول / بدهی — همان الگوی کارت مصرف (راست‌چین: باکس عدد اصلی سمت راست) ─────────
   درآمد و وصول: ۳ خط (کل + استوانه شهر/روستا · سرانه مشترک ماه · متوسط روز) — بدهی: ۲ خط (کل + استوانه · سرانه بدهی).
   کلیک سمت راست هر خط ← نمودار میله‌ای امور (شهر/روستا + خط عمودی بنفش میانگین استان) · کلیک سمت چپ ← نمودار کاربری؛ هر دو با drill-down. */
const FIN_CARDS = [
  {id:"income", title:'<i class="ico ico-banknote"></i>درآمد', cls:"fin-income", lines:[
    {key:"inc_t", m:"income", label:"درآمد", add:true, fin:true, kind:"total"},
    {key:"inc_p", m:"perIncome", label:"سرانه مشترک ماه", add:false, fin:true, kind:"per"},
    {key:"inc_d", m:"perIncomeDay", label:"متوسط روز", add:true, fin:true, kind:"day"}]},
  {id:"collection", title:'<i class="ico ico-circle-check"></i>وصول', cls:"fin-collection", lines:[
    {key:"col_t", m:"collection", label:"وصول", add:true, fin:true, kind:"total"},
    {key:"col_p", m:"perCollection", label:"سرانه مشترک ماه", add:false, fin:true, kind:"per"},
    {key:"col_d", m:"perCollectionDay", label:"متوسط روز", add:true, fin:true, kind:"day"}]},
  {id:"debt", title:'<i class="ico ico-triangle-alert"></i>بدهی', cls:"fin-debt", lines:[
    {key:"debt_t", m:"debtEnd", label:"بدهی پایان دوره", add:true, fin:true, kind:"total"},
    {key:"debt_p", m:"perDebt", label:"سرانه بدهی", add:false, fin:true, kind:"per"},
    {key:"debt_s", m:"debtStart", label:"بدهی ابتدای دوره", add:true, fin:true, kind:"start"}]}
];

function finLineHtml(l, S){
  const {rows, baseRows, areaRows, singleArea, singleCity} = S;
  const {city,rural} = splitRows(rows);
  const tot = calc(rows,l.m), f = fm(l.m,tot);
  const on = side => consOpen && consOpen.key===l.key && consOpen.side===side ? " on" : "";
  let extra = "", leftHtml, isCyl = false;
  if(l.kind==="total"){
    /* استوانهٔ سه‌بعدی شهر/روستا (همان رنگ‌ها و ارتفاع کارت مصرف) */
    leftHtml = cylinder(pct(calc(city,l.m),tot)||0, pct(calc(rural,l.m),tot)||0, `سهم شهر/روستا از ${l.label}`);
    isCyl = true;
    /* زیر عدد اصلی: با امور ← ٪ از استان؛ با شهر ← ٪ از امور */
    if(singleCity) extra = `<div class="ax-fin-ref"><span>٪ از امور</span><b>${pf(ratio(l.m,rows,areaRows))}</b></div>`;
    else if(singleArea) extra = `<div class="ax-fin-ref"><span>٪ از استان</span><b>${pf(ratio(l.m,rows,baseRows))}</b></div>`;
  }else{
    leftHtml = `<span class="ax-cl-hint">نمودار کاربری</span>`;
    if(l.kind==="per"){
      /* با امور ← سرانه استان؛ با شهر ← سرانه استان و زیرش سرانه امور (۳ سرانه زیر هم) */
      const refs = singleCity ? [["سرانه استان",baseRows],["سرانه امور",areaRows]] : singleArea ? [["سرانه استان",baseRows]] : [];
      extra = refs.map(([lb,b])=>{ const r = fm(l.m,calc(b,l.m)); return `<div class="ax-fin-ref"><span>${lb}</span><b>${r.num}</b><i>${r.unit}</i></div>`; }).join("");
    }
  }
  return `<div class="ax-cline" data-cl="${l.key}">
    <div class="ax-cl-body${isCyl?" ax-cl-body--col":""}">
      <div class="ax-cl-right${on("right")}" data-cside="right" role="button" tabindex="0" title="کلیک برای نمودار امور (شهر/روستا)"><span class="ax-cl-lab">${l.label}</span><div class="ax-cl-main"><b>${f.num}</b><span class="unit">${f.unit}</span></div>${extra}</div>
      <div class="ax-cl-left${isCyl?" ax-cl-left--cyl":""}${on("left")}" data-cside="left" role="button" tabindex="0" title="کلیک برای نمودار کاربری">${leftHtml}</div>
    </div>
    ${consOpen && consOpen.key===l.key ? consChart(l, S) : ""}
  </div>`;
}
function finCards(S){
  return FIN_CARDS.map(c=>`<article class="ax-card ax-fincard ${c.cls}"><h3>${c.title}</h3>${c.lines.map(l=>finLineHtml(l,S)).join("")}</article>`).join("");
}

/* ───────── سلسله‌مراتب مشترک پنل‌های «شاخص‌ها» و «نمره»: کلید الاکلنگی امور ⇄ کاربری + drill-down در همه سطوح ─────────
   امور: امور ← شهر ← کاربری (اگر یک امور فعال است از شهرها شروع می‌شود) · کاربری: کاربری ← امور ← شهر */
const shortName = s => String(s||"").replace(/^امور\s*/,"");
const KEY_LABEL = {area:"امور", city:"شهر", usage:"کاربری"};
function hierLevel(dim, path, S){
  const {rows, baseRows, areaRows, singleArea} = S;
  const order = (dim==="usage" ? ["usage","area","city"] : ["area","city","usage"]).filter(k=>!(k==="area" && singleArea));
  const key = order[path.length];
  if(!key) return {key:null, items:[], canDrill:false};
  let src = (path.length===0 && dim==="usage") ? rows : (singleArea ? areaRows : baseRows);
  path.forEach(p=>{ src = src.filter(r=>r[p.k]===p.v); });
  const g = new Map();
  src.forEach(r=>{ const k=r[key]; if(!k) return; if(!g.has(k)) g.set(k,[]); g.get(k).push(r); });
  return {key, items:[...g.entries()].map(([name,rs])=>({name, rs})), canDrill: !!order[path.length+1]};
}
const seesawHtml = (scope, dim) => `<div class="ax-seesaw" data-see="${scope}" data-dim="${dim}" role="group" aria-label="نمایش بر اساس امور یا کاربری">
  <i class="ax-see-knob"></i>
  <button type="button" class="ax-see-opt${dim==="area"?" on":""}" data-setdim="area" aria-pressed="${dim==="area"}">امور</button>
  <button type="button" class="ax-see-opt${dim==="usage"?" on":""}" data-setdim="usage" aria-pressed="${dim==="usage"}">کاربری</button>
</div>`;
const crumbs = path => path.length ? path.map(p=>esc(shortName(p.v))).join(" › ") : "";
const panelBar = (scope, dim, path, title) => `<div class="ax-panel-bar">
  <div class="ax-panel-title">${path.length?`<button type="button" class="ax-drill-back" data-panelback="${scope}">← بازگشت</button>`:""}<span>${title}${path.length?` — ${crumbs(path)}`:""}</span></div>
  ${seesawHtml(scope, dim)}
</div>`;
const drillAttrs = (key, name) => ` data-pk="${key}" data-pv="${esc(name)}" role="button" tabindex="0" title="کلیک برای سطح پایین‌تر"`;

/* ───────── شاخص‌ها: ۴ مربع + جدول هیت‌مپ ───────── */
const IDX4 = [["idxCycle","دوره وصول"],["idxCollection","درصد جذب"],["debtGrowth","رشد بدهی"],["debtRisk","ریسک بدهی"]];
const IDX_BASE = {idxCycle:"income", idxCollection:"income", debtRisk:"income", debtGrowth:"debtStart"};
const idxVal = (m, rs) => { if(!sum(rs,IDX_BASE[m])) return null; const v = calc(rs,m); return Number.isFinite(v) ? v : null; };
let hm = null;   // null | {metric, dim:"area"|"usage", path:[{k,v}]}
let sc = null;   // null | {dim, path}

function heatStyle(m, v, col){
  if(v===null) return "";
  let t;
  if(hasSpectrum(m)) t = spectrumT(m, v);
  else t = col.max>col.min ? 1 - (v-col.min)/(col.max-col.min) : .5;   // شاخص بدون آستانه (در صورت ثبت‌نشدن آستانه): کمتر = بهتر، نسبی در همان ستون
  const h = Math.round(125*Math.max(0,Math.min(1,t)));
  return `background:linear-gradient(135deg,hsla(${h},82%,62%,.44),hsla(${h},82%,84%,.16));color:hsl(${h},62%,20%)`;
}
function heatPanel(S){
  const lv = hierLevel(hm.dim, hm.path, S);
  const metrics = [hm.metric, ...IDX4.map(x=>x[0]).filter(k=>k!==hm.metric)];
  const items = lv.items.map(it=>({...it, vals: metrics.map(m=>idxVal(m,it.rs))}));
  items.sort((a,b)=>{ const x=a.vals[0], y=b.vals[0]; if(x===null&&y===null) return 0; if(x===null) return 1; if(y===null) return -1; return y-x; });
  const cols = metrics.map((m,i)=>{ const vs=items.map(it=>it.vals[i]).filter(v=>v!==null); return {min:Math.min(...vs), max:Math.max(...vs)}; });
  const labelOf = k => IDX4.find(x=>x[0]===k)[1];
  const head = metrics.map((m,i)=>{ const u = fm(m,0).unit; return `<th class="${i===0?"first":""}" data-hmth="${m}" title="مرتب‌سازی بر اساس ${labelOf(m)}">${labelOf(m)}<small>${esc(u)}</small></th>`; }).join("");
  const body = items.map(it=>`<tr class="${lv.canDrill?"ax-hm-drill":""}"${lv.canDrill?drillAttrs(lv.key,it.name):""}>
    <td class="nm">${esc(shortName(it.name))}${lv.canDrill?'<em>‹</em>':""}</td>
    ${it.vals.map((v,i)=>`<td class="n${i===0?" first":""}" style="${heatStyle(metrics[i],v,cols[i])}">${v===null?"—":fm(metrics[i],v).num}</td>`).join("")}
  </tr>`).join("");
  return `<div class="ax-panel ax-hm">
    ${panelBar("hm", hm.dim, hm.path, `هیت‌مپ شاخص‌ها — مرتب بر اساس «${labelOf(hm.metric)}»`)}
    <div class="ax-hm-scroll"><table class="ax-hm-tbl"><thead><tr><th class="nmh">${KEY_LABEL[lv.key]||""}</th>${head}</tr></thead>
      <tbody>${body||`<tr><td colspan="5" class="ax-empty">داده‌ای نیست</td></tr>`}</tbody></table></div>
    <p class="ax-panel-note">رنگ: قرمز (نامطلوب) ← سبز (مطلوب) بر اساس آستانه‌های استاندارد هر شاخص (قابل تنظیم از منوی همبرگری)؛ ریسک بدهی: خوب تا ۵۰٪ · هشدار تا ۷۰٪ · بالاتر بحرانی. روی ردیف بزنید تا وارد سطح پایین‌تر شوید.${lv.canDrill?"":" (پایین‌ترین سطح)"}</p>
  </div>`;
}

/* ───────── شاخص‌ها: کارت ۴ مربعی ───────── */
function indicesCard(rows, areaRows, baseRows, singleArea, singleCity, S){
  const cell = (rs, k, lb, main) => {
    const v = idxVal(k, rs), st = v===null ? null : absStatus(k,v), f = v===null ? {num:"—",unit:""} : fm(k,v);
    const cls = `ax-idx-cell ${st?st.sev:""}`;
    if(!main) return `<div class="${cls}"><small>${lb}</small><b>${f.num}</b><span class="unit">${f.unit}</span></div>`;
    return `<button type="button" class="${cls} ax-idx-sq${hm&&hm.metric===k?" on":""}" data-hm="${k}" title="کلیک برای جدول هیت‌مپ امور/کاربری"><small>${lb}</small><span class="ax-idx-line"><b>${f.num}</b><span class="unit">${f.unit}</span></span></button>`;
  };
  const rowHtml = (rs,label) => `<div class="ax-idx-row ${label?"ax-idx-ref":"ax-idx-main"}">
      ${label?`<span class="ax-idx-row-label">${esc(label)}</span>`:""}
      <div class="ax-idx-cells">${IDX4.map(([k,lb])=>cell(rs,k,lb,!label)).join("")}</div>
    </div>`;
  let extra = "";
  if(singleCity) extra += rowHtml(areaRows,"امور");
  if(singleArea) extra += rowHtml(baseRows,"استان");
  return `<article class="ax-card ax-indices">
    <h3><i class="ico ico-pin"></i>شاخص‌ها</h3>
    ${rowHtml(rows,"")}
    ${extra}
    ${hm ? heatPanel(S) : ""}
  </article>`;
}

/* ───────── نمره: لیست امور (یا کاربری) به ترتیب وضعیت — بدترین اول، با توضیح مقابل هر ردیف ───────── */
function scorePanel(S){
  const lv = hierLevel(sc.dim, sc.path, S);
  const items = lv.items.map(it=>({...it, hs: healthScore(it.rs)})).filter(x=>x.hs).sort((a,b)=>a.hs.score-b.hs.score);
  const body = items.map(it=>{
    const s3 = sev3Of(it.hs);
    return `<div class="ax-sc-row ${s3}${lv.canDrill?" ax-sc-drill":""}"${lv.canDrill?drillAttrs(lv.key,it.name):""}>
      <div class="ax-sc-head"><span class="ax-sc-name">${esc(shortName(it.name))}${lv.canDrill?'<em>‹</em>':""}</span><b class="ax-sc-score">${fa(it.hs.score,0)}</b><em class="ax-tag ${s3}">${SEV3_LABEL[s3]}</em></div>
      <div class="ax-sc-bar"><i style="width:${Math.max(2,Math.min(100,it.hs.score)).toFixed(0)}%"></i></div>
      <p class="ax-sc-desc">${esc(scoreDesc(it.hs))}</p>
    </div>`;
  }).join("");
  return `<div class="ax-panel ax-sc-panel">
    ${panelBar("sc", sc.dim, sc.path, "نمره به ترتیب وضعیت (بحرانی‌ترین اول)")}
    <div class="ax-sc-list">${body||'<p class="ax-empty">داده درآمدی برای این سطح نیست</p>'}</div>
  </div>`;
}

function animateBars(container){
  const segs = container.querySelectorAll(".ax-hchart-seg[data-w]");
  segs.forEach(el=>{ el.style.width = "0%"; });
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      segs.forEach(el=>{
        const w = el.getAttribute("data-w") || "0";
        el.style.width = w + "%";
      });
    });
  });
}

function bindCustClicks(container, ctx){
  const toggle = side => {
    if(custExpand===side){
      custExpand = null;
      custDrillUsage = null;
      custDrillArea = null;
      custDrillCity = null;
    }else{
      custExpand = side;
      if(side!=="left"){ custDrillUsage = null; }
      if(side!=="right"){ custDrillArea = null; custDrillCity = null; }
    }
    renderAnalytics(ctx);
  };
  /* هر دو المان سمت راست (باکس عدد + استوانه) و المان سمت چپ کلیک‌پذیرند */
  container.querySelectorAll('.ax-customers [data-side="left"]').forEach(el=>el.addEventListener("click", e=>{ e.stopPropagation(); toggle("left"); }));
  container.querySelectorAll('.ax-customers [data-side="right"]').forEach(el=>el.addEventListener("click", e=>{ e.stopPropagation(); toggle("right"); }));

  /* drill-down کاربری (نمودار چپ) */
  container.querySelectorAll(".ax-usage-row").forEach(row=>{
    row.addEventListener("click", e=>{
      e.stopPropagation();
      const u = row.getAttribute("data-usage");
      if(!u) return;
      custDrillUsage = u;
      custExpand = "left";
      renderAnalytics(ctx);
    });
  });
  /* drill-down امور → شهرها */
  container.querySelectorAll(".ax-area-row").forEach(row=>{
    row.addEventListener("click", e=>{
      e.stopPropagation();
      const a = row.getAttribute("data-area");
      if(!a) return;
      custDrillArea = a;
      custDrillCity = null;
      custExpand = "right";
      renderAnalytics(ctx);
    });
  });
  /* drill-down شهر → کاربری */
  container.querySelectorAll(".ax-city-row").forEach(row=>{
    row.addEventListener("click", e=>{
      e.stopPropagation();
      const c = row.getAttribute("data-city");
      const a = row.getAttribute("data-area");
      if(!c) return;
      custDrillCity = c;
      if(a) custDrillArea = a;
      custExpand = "right";
      renderAnalytics(ctx);
    });
  });
  /* بازگشت از drill-down */
  container.querySelectorAll(".ax-drill-back").forEach(back=>{
    back.addEventListener("click", e=>{
      e.stopPropagation();
      const act = back.getAttribute("data-action");
      if(act==="back-usage"){
        custDrillUsage = null;
        custExpand = "left";
      }else if(act==="back-area"){
        custDrillArea = null;
        custDrillCity = null;
        custExpand = "right";
      }else if(act==="back-city"){
        custDrillCity = null;
        custExpand = "right";
      }
      renderAnalytics(ctx);
    });
  });

  animateBars(container);
}

/* رویدادهای پنل‌های «شاخص‌ها» (هیت‌مپ) و «نمره» */
function bindPanels(container, ctx){
  const rerender = () => { const y = window.scrollY; renderAnalytics(ctx); window.scrollTo(0,y); };
  const act = (el, fn) => {
    const h = e => { e.stopPropagation(); fn(el, e); rerender(); };
    el.addEventListener("click", h);
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); h(e); } });
  };
  container.querySelectorAll("[data-hm]").forEach(el=>act(el, ()=>{
    const k = el.getAttribute("data-hm");
    hm = hm && hm.metric===k ? null : {metric:k, dim:hm?hm.dim:"area", path:hm?hm.path:[]};
  }));
  container.querySelectorAll("[data-hmth]").forEach(el=>act(el, ()=>{ hm.metric = el.getAttribute("data-hmth"); }));
  container.querySelectorAll("[data-scopen]").forEach(el=>act(el, ()=>{ sc = sc ? null : {dim:"area", path:[]}; }));
  container.querySelectorAll(".ax-seesaw").forEach(box=>{
    const st = () => box.getAttribute("data-see")==="hm" ? hm : sc;
    box.querySelectorAll("[data-setdim]").forEach(btn=>act(btn, ()=>{ const t = st(); if(t){ t.dim = btn.getAttribute("data-setdim"); t.path = []; } }));
  });
  container.querySelectorAll("[data-panelback]").forEach(el=>act(el, ()=>{ const t = el.getAttribute("data-panelback")==="hm" ? hm : sc; if(t) t.path = t.path.slice(0,-1); }));
  container.querySelectorAll("[data-pk]").forEach(el=>act(el, ()=>{
    const scope = el.closest(".ax-sc-panel") ? sc : hm;
    if(scope) scope.path = [...scope.path, {k:el.getAttribute("data-pk"), v:el.getAttribute("data-pv")}];
  }));
}
let lastSig = "";

export function renderAnalytics(ctx){
  const container = document.getElementById("viewContainer");
  if(!container) return;
  const {rows, baseRows, activeAreas} = ctx;

  const singleArea = activeAreas.length===1 ? activeAreas[0] : null;
  const areaRows = singleArea ? baseRows.filter(r=>r.area===singleArea) : null;
  const cities = singleArea ? new Set(rows.map(r=>r.city).filter(Boolean)) : null;
  const singleCity = (singleArea && cities && cities.size===1) ? [...cities][0] : null;
  const compare = singleCity ? {label:"امور", level:"city", base:areaRows} : singleArea ? {label:"استان", level:"area", base:baseRows} : null;

  /* با تغییر فیلتر امور، مسیر drill پنل‌ها به ابتدا برمی‌گردد */
  const sig = activeAreas.join("|");
  if(sig!==lastSig){ lastSig = sig; if(hm) hm.path = []; if(sc) sc.path = []; }
  const S = {rows, baseRows, areaRows, singleArea, singleCity, activeAreas};

  container.innerHTML = `<div class="ax-root">
    <section class="ax-row1${(hm||sc)?" ax-row1--stack":""}">
      <div class="ax-left-stack">
        ${scoreCard(rows, baseRows, areaRows, activeAreas, singleArea, singleCity, S)}
        ${indicesCard(rows, areaRows, baseRows, singleArea, singleCity, S)}
      </div>
      ${customersCard(rows, compare, baseRows, areaRows, singleArea, singleCity, activeAreas)}
    </section>
    ${consumptionCard(S)}
    ${finCards(S)}
    <p class="ax-foot">${esc(scoreFormulaText())}. آستانه‌های وضعیت و وزن‌ها از منوی تنظیمات قابل تغییرند.</p>
  </div>`;

  bindCustClicks(container, ctx);
  bindConsClicks(container, ctx);
  bindPanels(container, ctx);
}
