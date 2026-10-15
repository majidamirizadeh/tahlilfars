/* داشبورد «تحلیل ناهنجاری، تمرکز و الگوی مصرف»
   UI فقط دریافت/فیلتر نمایش/مرتب‌سازی/نمایش می‌کند؛ هیچ فرمول آماری اینجا دوباره محاسبه نمی‌شود. */
import {
  analyzeAnomalies, buildView, fa, CARD_DEFS, PROFILE_LABEL, LEVELS, ALERT_TYPES, ALERT_BY_ID,
  DQ_LABEL, scoreBand, PROVINCE_NAME
} from "../engines/anomalyEngine.js";
import {scopeRows, scopeButtonsHtml, ARMED, ARMED_DEFAULT, ARMED_ORDER, SETTLEMENT_ORDER, nextOf} from "../filters/scopeFilters.js";

/* نگاشت شناسهٔ کارت → آیکون (نمایشی؛ جایگزین ایموجی‌های موتور) */
const CARD_ICO={needsReview:"triangle-alert",veryHighPer:"chevrons-up",veryLowPer:"chevrons-down",zero:"ban",highZeroRate:"percent",ciVeryHigh:"target",ciVeryLow:"diamond",highVolume:"package",manyCustLowUse:"users"};
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const isN = v => typeof v==="number" && Number.isFinite(v);
const pf = (v,d=1) => !isN(v) ? "—" : fa(v,d)+"٪";
const nm = (v,d=1) => !isN(v) ? "—" : fa(v,d);

let ui = {
  areas: [], cities: [], usages: [],
  card: "needsReview",
  sort: 0,                 /* 0 = از تنظیمات */
  showTop: true,
  showDetails: false,
  alertType: "", dir: "", minCust: "", minCons: "", topN: "",
  level: "province", levelManual: false,
  moreOpen: false,
  armed: ARMED_DEFAULT,    /* نیروی مسلح: with | without | only — پیش‌فرض بدون نیروی مسلح */
  settlement: "all",       /* شهر/روستا: all | city | rural */
  openKey: null,           /* recordKey ردیف بازشده */
  openDrop: null           /* "area" | "usage" | null */
};

function unique(rows, key){
  return [...new Set(rows.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fa"));
}
function shortArea(a){ return String(a||"").replace(/^امور\s*/,""); }
function monthlyPer(per, days){
  if(!isN(per)) return null;
  return (per / Math.max(1, Number(days)||1)) * 30;
}
function areaLabel(){
  if(!ui.areas.length) return "همه امور";
  if(ui.areas.length===1) return shortArea(ui.areas[0]);
  return fa(ui.areas.length)+" امور";
}
function usageLabel(){
  if(!ui.usages.length) return "همه کاربری‌ها";
  if(ui.usages.length===1) return ui.usages[0];
  return fa(ui.usages.length)+" کاربری";
}
/* سطح خودکار: تا وقتی کاربر دستی انتخاب نکرده، از انتخاب امور/شهر تبعیت می‌کند */
function autoLevel(){
  if(ui.areas.length===1 && ui.cities.length===1) return "city";
  if(ui.areas.length) return "affairs";
  return "province";
}

function dropdownPanel(kind, items, selected){
  const sel = new Set(selected);
  if(kind==="usage"){
    const cells = items.map(v=>{
      const on = sel.has(v) ? "selected" : "";
      return `<button type="button" class="usage-item ${on}" data-an-chip="usage" data-v="${esc(v)}">${esc(v)}</button>`;
    }).join("");
    return `<div class="filter-dropdown usage-dropdown ${ui.openDrop===kind?"":"hidden"}" data-an-panel="usage" role="listbox">
      <div class="usage-grid">${cells||`<span class="an-fempty">موردی نیست</span>`}</div>
    </div>`;
  }
  const rows = items.map(v=>{
    const on = sel.has(v) ? "selected" : "";
    return `<button type="button" class="dropdown-item ${on}" data-an-chip="area" data-v="${esc(v)}">${esc(shortArea(v))}</button>`;
  }).join("");
  return `<div class="filter-dropdown ${ui.openDrop===kind?"":"hidden"}" data-an-panel="area" role="listbox">
    <div class="dropdown-list">${rows||`<span class="an-fempty">موردی نیست</span>`}</div>
  </div>`;
}

function cityChips(cities){
  if(!ui.areas.length) return "";
  const sel = new Set(ui.cities);
  const chips = cities.map(v=>`<button type="button" class="citysub-chip ${sel.has(v)?"selected":""}" data-an-chip="city" data-v="${esc(v)}">${esc(v)}</button>`).join("");
  const names = ui.areas.length===1 ? `<b>${esc(shortArea(ui.areas[0]))}</b>` : `<b>${fa(ui.areas.length)} امور انتخاب‌شده</b>`;
  return `<div class="citysub-inline an-city-row">
    <div class="citysub-head"><span>شهر و بخش‌های ${names}</span>
      <button type="button" class="clear-btn ${ui.cities.length?"active":""}" data-an-clear="city" title="حذف انتخاب شهر/بخش" aria-label="حذف انتخاب شهر/بخش" ${ui.cities.length?"":"disabled"}><i data-lucide="eraser"></i></button></div>
    <div class="citysub-chips">${chips||`<span class="an-fempty">شهری نیست</span>`}</div>
  </div>`;
}

/* ───────── نمودار پراکندگی: X=سرانه · Y=CI همان سطح · اندازه=مصرف کل · رنگ=هشدار ───────── */
function sevClass(a){
  if(!a) return "sev-ok";
  const t = a.alertTypes;
  if(t.includes("veryHighPer")||t.includes("ciVeryHigh")) return "sev-hi";
  if(t.some(x=>["highVolume"].includes(x))) return "sev-mid";
  if(t.length) return "sev-lo";
  return "sev-ok";
}
function buildScatter(recs, key, c, lvLabel){
  const pts = recs.filter(r=>isN(r.per) && r[key] && isN(r[key].ci));
  if(!pts.length) return `<div class="an-empty">نقطه‌ای برای رسم نیست (نیاز به سرانه و ضریب تمرکز در این سطح).</div>`;
  const w = 640, h = 320, pad = {t:24,r:16,b:40,l:48};
  const maxPer = Math.max(...pts.map(p=>p.per), 1);
  const cis = pts.map(p=>p[key].ci);
  const maxCi = Math.max(...cis, c.ciHigh*1.2, 1.5);
  const minCi = Math.min(...cis, 0);
  const maxCons = Math.max(...pts.map(p=>p.consumption), 1);
  const xScale = v => pad.l + (v/maxPer) * (w-pad.l-pad.r);
  const yScale = v => h - pad.b - ((v - minCi) / Math.max(maxCi - minCi, 0.01)) * (h-pad.t-pad.b);
  const rScale = v => 3 + Math.sqrt(v/maxCons) * 12;
  const sortedPer = pts.map(p=>p.per).sort((a,b)=>a-b);
  const medPer = sortedPer[Math.floor(sortedPer.length/2)];
  const yHi = yScale(c.ciHigh), xMed = xScale(medPer);
  const ordered = [...pts].sort((a,b)=>b.consumption-a.consumption);   /* نقطه‌های بزرگ زیر */
  const circles = ordered.map(p=>{
    const a = p[key];
    const cls = "an-pt "+sevClass(a);
    const tip = [shortArea(p.affairs), p.city, p.category,
      `مشترک: ${fa(p.customers)}`,`مصرف: ${fa(p.consumption,0)} m³`,`سرانه: ${nm(p.per,1)}`,
      `صدک استان: ${nm(p.provinceAnalysis?.percentile,1)}`,`صدک امور: ${nm(p.affairsAnalysis?.percentile,1)}`,
      `ضریب تمرکز استان: ${nm(p.provinceAnalysis?.ci,2)}`,`ضریب تمرکز امور: ${nm(p.affairsAnalysis?.ci,2)}`,`ضریب تمرکز شهر: ${nm(p.cityAnalysis?.ci,2)}`,
      `ناهنجاری: ${nm(a.anomalyScore,0)}`,`اهمیت حجمی: ${nm(a.materialityScore,0)}`,
      a.alertTypes.map(t=>ALERT_BY_ID[t].label).join("، ")||"بدون هشدار"].join(" | ");
    return `<circle class="${cls}" cx="${xScale(p.per).toFixed(1)}" cy="${yScale(a.ci).toFixed(1)}" r="${rScale(p.consumption).toFixed(1)}"><title>${esc(tip)}</title></circle>`;
  }).join("");
  return `<div class="an-scatter-wrap">
    <svg class="an-scatter" viewBox="0 0 ${w} ${h}" role="img" aria-label="نمودار پراکندگی سرانه در برابر ضریب تمرکز ${esc(lvLabel)}">
      <line x1="${pad.l}" y1="${yHi.toFixed(1)}" x2="${w-pad.r}" y2="${yHi.toFixed(1)}" class="an-ref-line"/>
      <line x1="${xMed.toFixed(1)}" y1="${pad.t}" x2="${xMed.toFixed(1)}" y2="${h-pad.b}" class="an-ref-line"/>
      <text x="${w-pad.r}" y="${(yHi-3).toFixed(1)}" class="an-axis-label" text-anchor="end">ضریب تمرکز بالا = ${fa(c.ciHigh,1)}</text>
      <text x="${w/2}" y="${h-8}" class="an-axis-label" text-anchor="middle">سرانه مصرف (m³ / مشترک) →</text>
      <text x="14" y="${h/2}" class="an-axis-label" transform="rotate(-90 14 ${h/2})" text-anchor="middle">ضریب تمرکز ${esc(lvLabel)} →</text>
      ${circles}
    </svg>
    <div class="an-scatter-legend">
      <span class="sev-hi">سرانه/تمرکز بسیار بالا</span>
      <span class="sev-mid">بالا / نسبتاً بالا</span>
      <span class="sev-lo">پایین / صفرمصرف</span>
      <span class="sev-ok">بدون هشدار</span>
      <em>اندازه نقطه ≈ مصرف کل · خط عمودی = میانهٔ سرانه</em>
    </div>
  </div>`;
}

/* ───────── جدول ───────── */
const PL = {A:"الف", B:"ب", C:"ج", D:"د"};   /* نمایش وضعیت‌های A–D به‌صورت حروف فارسی */
const rankTxt = a => (a && isN(a.rank)) ? `${fa(a.rank)}/${fa(a.rankSize)}` : "—";
const chip3 = (a, name) => {
  const st = !a || !a.available ? "na" : a.alertTypes.length ? "rv" : "ok";
  const t = st==="na" ? "بدون جامعهٔ آماری" : st==="rv" ? "نیازمند بررسی" : "عادی";
  return `<i class="an-c3 an-c3-${st}" title="${esc(name+": "+t)}">${esc(name[0])}</i>`;
};
const scoreCell = (v) => {
  if(!isN(v)) return `<td class="num">—</td>`;
  const b = scoreBand(v);
  return `<td class="num"><span class="an-sc an-sc-${b.id}" title="${esc(b.label)}">${fa(v,0)}</span></td>`;
};
function alertBadges(a){
  if(!a || !a.alertTypes.length) return "—";
  return a.alertTypes.map(t=>`<span class="an-flag an-flag-${ALERT_BY_ID[t].dir}">${esc(ALERT_BY_ID[t].label)}</span>`).join(" ");
}

function detailPanel(r, c){
  const panels = LEVELS.map(l=>{
    const a = r[l.key];
    const status = !a || !a.available ? `<b class="an-st-na">بدون جامعهٔ آماری${a&&a.reason?` — ${esc(a.reason)}`:""}</b>`
      : a.alertTypes.length ? `<b class="an-st-rv">نیازمند بررسی</b>` : `<b class="an-st-ok">عادی</b>`;
    const scope = l.id==="province" ? `همهٔ شهرهای ${esc(PROVINCE_NAME)} در «${esc(r.category)}»`
      : l.id==="affairs" ? `شهرهای ${esc(shortArea(r.affairs))||"—"} در «${esc(r.category)}»`
      : `کاربری‌های شهر ${esc(r.city)}`;
    return `<div class="an-dpanel">
      <h4>${esc(l.label)} <small>${esc(l.fa)}</small></h4>
      <p class="an-dscope">${scope} · جامعه: ${fa(a?a.populationSize:0)}</p>
      <div class="an-dstat">${status}</div>
      <dl>
        <dt>رتبه</dt><dd>${rankTxt(a)}</dd>
        <dt>صدک</dt><dd>${nm(a&&a.percentile,1)}</dd>
        <dt>ضریب تمرکز</dt><dd>${nm(a&&a.ci,2)}</dd>
        <dt>سهم مصرف</dt><dd>${a&&isN(a.shareCons)?pf(a.shareCons*100,1):"—"}</dd>
        <dt>سهم مشترک</dt><dd>${a&&isN(a.shareCust)?pf(a.shareCust*100,1):"—"}</dd>
        <dt>نرخ صفرمصرف (جامعه)</dt><dd>${pf(a&&a.groupZeroRate,1)}</dd>
        <dt>امتیاز ناهنجاری</dt><dd>${nm(a&&a.anomalyScore,0)}</dd>
        <dt>اهمیت حجمی</dt><dd>${nm(a&&a.materialityScore,0)}</dd>
        <dt>امتیاز اولویت</dt><dd>${nm(a&&a.priorityScore,0)}</dd>
        <dt>وضعیت A–D</dt><dd>${a&&a.profile?`<span class="an-prof an-prof-${a.profile}" title="${esc(PROFILE_LABEL[a.profile])}">${PL[a.profile]}</span>`:"—"}</dd>
      </dl>
      <div class="an-flags">${alertBadges(a)}</div>
    </div>`;
  }).join("");
  return `<div class="an-dgrid">${panels}</div>`;
}

function buildTable(view, days, showDetails, c){
  const key = view.key, lvId = view.level;
  const rows = view.rows || [];
  const lvOn = id => id===lvId ? " lv-on" : "";
  if(view.dq && ui.card==="quality"){
    const list = [...view.dq].sort((a,b)=>({error:0,warning:1,info:2}[a.severity]-{error:0,warning:1,info:2}[b.severity]));
    if(!list.length) return `<p class="an-empty">مورد کیفیت داده نیست.</p>`;
    return `<div class="an-table-wrap" style="display:block;overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="an-table"><thead><tr>
      <th>امور</th><th>شهر</th><th>کاربری</th><th>مشترک</th><th>مصرف</th><th>نوع</th><th>شدت</th><th>توضیح</th></tr></thead>
      <tbody>${list.map(d=>`<tr class="dq-${d.severity}">
        <td>${esc(shortArea(d.area))||"—"}</td><td>${esc(d.city)||"—"}</td><td>${esc(d.usage)||"—"}</td>
        <td class="num">${fa(d.customers)}</td><td class="num">${fa(d.consumption,0)}</td>
        <td>${esc(DQ_LABEL[d.code]||d.code)}</td>
        <td><span class="an-sev an-sev-${d.severity}">${d.severity==="error"?"خطا":d.severity==="warning"?"هشدار":"اطلاعات"}</span></td>
        <td>${esc(d.message)}${d.details?` (${esc(d.details)})`:""}</td></tr>`).join("")}</tbody></table></div>`;
  }
  if(!rows.length) return `<p class="an-empty">ردیفی با این فیلتر نیست.</p>`;

  const head = [
    ["امور",""],["شهر",""],["کاربری",""],["نوع هشدار",""],["مشترک",""],["مصرف (m³)",""],["سرانه",""],["سرانه ماه",""],["اولویت",""]
  ];
  if(showDetails) head.push(
    ["رتبه استان",lvOn("province")],["صدک استان",lvOn("province")],["ضریب تمرکز استان",lvOn("province")],
    ["رتبه امور",lvOn("affairs")],["صدک امور",lvOn("affairs")],["ضریب تمرکز امور",lvOn("affairs")],
    ["رتبه شهر",lvOn("city")],["صدک شهر",lvOn("city")],["ضریب تمرکز شهر",lvOn("city")],
    ["استان/امور/شهر",""],
    ["سهم مشترک","lv-on"],["سهم مصرف","lv-on"],
    ["صفر٪","lv-on"],["صفر٪ جامعه","lv-on"],["ناهنجاری","lv-on"],["حجم","lv-on"],["وضعیت","lv-on"]
  );
  const thead = `<tr>${head.map(([t,cl])=>`<th class="${cl.trim()}">${t}</th>`).join("")}</tr>`;

  const body = rows.map(r=>{
    const P = r.provinceAnalysis, A = r.affairsAnalysis, C = r.cityAnalysis, L = r[key];
    const mon = monthlyPer(r.per, days);
    const det = showDetails ? `
      <td class="num${lvOn("province")}">${rankTxt(P)}</td><td class="num${lvOn("province")}">${nm(P&&P.percentile,1)}</td><td class="num${lvOn("province")}">${nm(P&&P.ci,2)}</td>
      <td class="num${lvOn("affairs")}">${rankTxt(A)}</td><td class="num${lvOn("affairs")}">${nm(A&&A.percentile,1)}</td><td class="num${lvOn("affairs")}">${nm(A&&A.ci,2)}</td>
      <td class="num${lvOn("city")}">${rankTxt(C)}</td><td class="num${lvOn("city")}">${nm(C&&C.percentile,1)}</td><td class="num${lvOn("city")}">${nm(C&&C.ci,2)}</td>
      <td class="an-c3s">${chip3(P,"استان")}${chip3(A,"امور")}${chip3(C,"شهر")}</td>
      <td class="num lv-on">${L&&isN(L.shareCust)?pf(L.shareCust*100,1):"—"}</td>
      <td class="num lv-on">${L&&isN(L.shareCons)?pf(L.shareCons*100,1):"—"}</td>
      <td class="num lv-on">${pf(r.zeroRate,0)}</td>
      <td class="num lv-on">${pf(L&&L.groupZeroRate,1)}</td>
      ${scoreCell(L&&L.anomalyScore).replace('class="num"','class="num lv-on"')}
      ${scoreCell(L&&L.materialityScore).replace('class="num"','class="num lv-on"')}
      <td class="lv-on">${L&&L.profile?`<span class="an-prof an-prof-${L.profile}" title="${esc(PROFILE_LABEL[L.profile])}">${PL[L.profile]}</span>`:"—"}</td>` : "";
    const open = ui.openKey===r.recordKey;
    const main = `<tr class="an-row ${L&&L.alertTypes.length?"is-alert":""} ${open?"is-open":""}" data-an-row="${esc(r.recordKey)}">
      <td>${esc(shortArea(r.affairs))||"—"}</td><td>${esc(r.city)}</td><td>${esc(r.category)}</td>
      <td class="an-flags">${alertBadges(L)}</td>
      <td class="num">${fa(r.customers)}</td><td class="num">${fa(r.consumption,0)}</td><td class="num">${nm(r.per,1)}</td>
      <td class="num">${nm(mon,1)}</td>
      ${scoreCell(L&&L.priorityScore)}
      ${det}
    </tr>`;
    const extra = open ? `<tr class="an-detail-row"><td colspan="${head.length}">${detailPanel(r,c)}</td></tr>` : "";
    return main + extra;
  }).join("");

  const minW = Math.max(1180, head.length*74);
  return `<div class="an-table-wrap" style="display:block;overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="an-table" style="min-width:${minW}px"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
}

function summaryStrip(view, lvLabel){
  if(view.level==="province") return "";
  const s = view.provinceSummary;
  const item = (id,label) => `<span class="an-sum-i"><b>${fa(s[id])}</b> ${label}</span>`;
  return `<div class="an-prov-sum" role="note"><strong>خلاصهٔ استان (سطح استان محفوظ است):</strong>
    ${item("needsReview","نیازمند بررسی")}${item("veryHigh","سرانه بسیار بالا")}${item("high","سرانه بالا")}
    ${item("veryLow","سرانه بسیار پایین")}${item("zero","صفرمصرف")}${item("concentration","تمرکز بالا")}</div>`;
}

function sortOptions(cur){
  const opts = [[5,"ترکیبی (اولویت)"],[3,"شدت ناهنجاری"],[4,"اهمیت حجمی"],[1,"سرانه"],[2,"ضریب تمرکز"],[6,"مصرف کل"]];
  return opts.map(([v,t])=>`<option value="${v}" ${cur===v?"selected":""}>${t}</option>`).join("");
}

/** وضعیت فیلتر فعلی این تب برای چیپ شناور سطح فیلتر */
export function getAnomalyScope(){
  return {
    areas: ui.areas.slice(),
    cities: ui.cities.slice(),
    usages: ui.usages.slice()
  };
}
export function setAnomalyScopeLevel(level){
  if(level==="province"){ ui.areas=[]; ui.cities=[]; ui.usages=[]; }
  else if(level==="area"){ ui.cities=[]; ui.usages=[]; }
  else if(level==="city"){ ui.usages=[]; }
  ui.openDrop=null; ui.openKey=null; ui.levelManual=false;
}

export function renderAnomaly(ctx){
  const container = document.getElementById("viewContainer");
  if(!container) return;
  bindOutsideOnce();
  /* پنل‌های fixed روی body از رندر قبلی را پاک کن */
  document.querySelectorAll("body > [data-an-panel]").forEach(d=>d.remove());
  const keepY = window.scrollY;
  const keepDropTop = 0;
  const {rows, baseRows, periodDays} = ctx;
  /* فیلتر نیروی مسلح و شهر/روستا (کلیدهای همین تب) پیش از تحلیل اعمال می‌شود؛ سطح‌بندی و صدک‌ها روی همین دامنه محاسبه می‌شوند */
  const source = scopeRows(baseRows || rows || [], {armed:ui.armed, settlement:ui.settlement});
  const days = periodDays || window.__REPORT_DAYS || 1;

  const areas = unique(source,"area");
  const cities = ui.areas.length ? unique(source.filter(r=>ui.areas.includes(r.area)),"city") : [];
  const usages = unique(source,"usage");

  if(!ui.levelManual) ui.level = autoLevel();
  /* کاربری غیرفعال‌شده در تنظیمات از فیلتر نمایش حذف نمی‌شود؛ رکوردهایش فقط تحلیل ندارند */

  /* محاسبه: همیشه روی کل داده — فیلترها آمار را تغییر نمی‌دهند */
  const result = analyzeAnomalies(source, {filters:{level:ui.level, areas:ui.areas, cities:ui.cities, usages:ui.usages}});
  const c = result.cfg;
  const sort = ui.sort || c.sortMode;
  const topN = Math.max(1, Math.round(Number(ui.topN)||c.topN));
  const view = buildView(result, {
    level:ui.level, areas:ui.areas, cities:ui.cities, usages:ui.usages, card:ui.card,
    alertType:ui.alertType, dir:ui.dir, minCust:ui.minCust, minCons:ui.minCons,
    sort, topOnly:ui.showTop, topN
  });
  const lv = LEVELS.find(l=>l.id===ui.level);
  const isQuality = ui.card==="quality";

  const scopeNote = ui.level==="province" ? `کل استان ${PROVINCE_NAME}`
    : ui.level==="affairs" ? (ui.areas.length ? ui.areas.map(shortArea).join("، ") : "همهٔ امورها (هر شهر در امور خودش)")
    : (ui.cities.length ? ui.cities.join("، ") : "همهٔ شهرها (هر کاربری در شهر خودش)");

  const cardsHtml = CARD_DEFS.map(d=>`<button type="button" class="an-card ${ui.card===d.id?"on":""}" data-an-card="${d.id}">
      <span class="an-card-ico"><i class="ico ico-${CARD_ICO[d.id]||"circle"}"></i></span>
      <span class="an-card-n">${fa(view.cards[d.id])}</span>
      <span class="an-card-l">${esc(d.label)}</span>
    </button>`).join("");

  const levelBar = `<div class="an-levelbar" role="tablist" aria-label="سطح تحلیل">
    ${LEVELS.map(l=>`<button type="button" role="tab" aria-selected="${ui.level===l.id}" class="an-seg-btn an-lvbtn ${ui.level===l.id?"active":""}" data-an-level="${l.id}">
      <b>${l.label}</b><small>${esc(l.fa)}</small></button>`).join("")}
    ${ui.levelManual?`<button type="button" class="an-lvauto" data-an-level="auto" title="بازگشت به انتخاب خودکار سطح بر اساس فیلتر امور/شهر">خودکار</button>`:""}
  </div>`;

  const typeOpts = `<option value="">همه انواع</option>` + ALERT_TYPES.map(a=>`<option value="${a.id}" ${ui.alertType===a.id?"selected":""}>${esc(a.label)}</option>`).join("");
  const moreHtml = `<details class="an-more" data-an-more ${ui.moreOpen?"open":""}>
    <summary>فیلترهای بیشتر (نوع هشدار · جهت · حداقل‌ها · تعداد برترین‌ها)</summary>
    <div class="an-more-grid">
      <label>نوع هشدار<select data-an="alertType">${typeOpts}</select></label>
      <label>جهت<select data-an="dir">
        <option value="" ${ui.dir===""?"selected":""}>بالا و پایین</option>
        <option value="high" ${ui.dir==="high"?"selected":""}>فقط بالا</option>
        <option value="low" ${ui.dir==="low"?"selected":""}>فقط پایین</option></select></label>
      <label>حداقل مشترک<input type="number" inputmode="numeric" min="0" data-an="minCust" value="${esc(ui.minCust)}" placeholder="۰"></label>
      <label>حداقل مصرف (m³)<input type="number" inputmode="numeric" min="0" data-an="minCons" value="${esc(ui.minCons)}" placeholder="۰"></label>
      <label>تعداد برترین‌ها<input type="number" inputmode="numeric" min="1" data-an="topN" value="${esc(ui.topN)}" placeholder="${fa(c.topN)}"></label>
    </div>
  </details>`;

  const titleCard = ui.card==="quality" ? "کیفیت داده"
    : (ui.showTop ? `${fa(topN)} مورد برتر ${lv.label}` : `همهٔ هشدارها — ${lv.label}`);
  const shown = isQuality ? view.dq.length : (view.rows||[]).length;
  const totalTxt = (!isQuality && ui.showTop && view.totalMatching>shown) ? ` از ${fa(view.totalMatching)}` : "";

  const dqInfo = isQuality ? `<p class="an-dq-note">شامل ${fa(view.dq.filter(d=>d.severity==="info").length)} مورد اطلاعاتی (مثل صفرمصرف معتبر) که خطا نیستند؛ عدد کارت فقط خطا/هشدارها را می‌شمارد.</p>` : "";
  const errBanner = result.errors.length ? `<div class="an-sys-err" role="alert">${result.errors.map(e=>esc(e.message)).join(" · ")}</div>` : "";

  container.innerHTML = `<div class="an-root">
    <section class="map-filters-bar card an-filterbar">
      ${scopeButtonsHtml({armed:ui.armed, settlement:ui.settlement}, "data-an-scope")}
      <div class="filters-row filters-row-area an-top-filters">
        <div class="filter-pair">
          <div class="filter-btn-wrap">
            <button type="button" class="filter-dropdown-btn ${ui.openDrop==="area"?"open":""}" data-an-toggle="area" aria-haspopup="listbox" aria-expanded="${ui.openDrop==="area"}">
              <span>${esc(areaLabel())}</span>
              <i data-lucide="chevron-down" class="chev"></i>
            </button>
            ${dropdownPanel("area", areas, ui.areas)}
          </div>
          <button type="button" class="clear-btn ${ui.areas.length?"active":""}" data-an-clear="area" title="حذف انتخاب امور" aria-label="حذف انتخاب امور" ${ui.areas.length?"":"disabled"}>
            <i data-lucide="eraser"></i>
          </button>
        </div>
        <div class="filter-pair">
          <div class="filter-btn-wrap">
            <button type="button" class="filter-dropdown-btn ${ui.openDrop==="usage"?"open":""}" data-an-toggle="usage" aria-haspopup="listbox" aria-expanded="${ui.openDrop==="usage"}">
              <span>${esc(usageLabel())}</span>
              <i data-lucide="chevron-down" class="chev"></i>
            </button>
            ${dropdownPanel("usage", usages, ui.usages)}
          </div>
          <button type="button" class="clear-btn ${ui.usages.length?"active":""}" data-an-clear="usage" title="حذف انتخاب کاربری" aria-label="حذف انتخاب کاربری" ${ui.usages.length?"":"disabled"}>
            <i data-lucide="eraser"></i>
          </button>
        </div>
      </div>
      ${cityChips(cities)}
    </section>

    <header class="an-head">
      <div>
        <h2>تحلیل ناهنجاری، تمرکز و الگوی مصرف</h2>
        <p class="an-sub">مقایسه‌سنجی آماری — موارد «نیازمند بررسی»؛ تشخیص قطعی تخلف یا هدررفت نیست.
        سطح فعال: <b>${esc(lv.label)}</b> (${esc(lv.fa)}) · دامنه: <b>${esc(scopeNote)}</b>
        · بازه: ${fa(days)} روز · هر سه سطح هم‌زمان محاسبه و در جدول نگه‌داری می‌شوند.</p>
      </div>
    </header>
    ${errBanner}
    ${levelBar}

    <div class="an-cards">${cardsHtml}</div>
    ${summaryStrip(view, lv.label)}

    <section class="an-panel">
      <div class="an-panel-head">
        <h3>${esc(titleCard)}</h3>
        <span class="an-count">${fa(shown)}${totalTxt} ردیف</span>
      </div>
      <div class="an-table-tools">
        <label>مرتب‌سازی
          <select data-an="sort">${sortOptions(sort)}</select>
        </label>
        <label class="an-check"><input type="checkbox" data-an="showDetails" ${ui.showDetails?"checked":""}> جزئیات</label>
        <label class="an-check"><input type="checkbox" data-an="showTop" ${ui.showTop?"checked":""}> فقط ${fa(topN)} مورد برتر</label>
      </div>
      ${moreHtml}
      ${dqInfo}
      ${buildTable(view, days, ui.showDetails, c)}
      <p class="an-hint">برای دیدن هر سه تحلیل یک ردیف (استان · امور · شهر) روی ردیف بزنید.</p>
    </section>

    <details class="an-help">
      <summary>راهنمای ستون‌ها، مقیاس امتیازها و محدودیت‌های داده</summary>
      <ul>
        <li><b>سرانه:</b> مصرف ÷ مشترک معتبر (m³ به‌ازای هر مشترک، برای کل بازهٔ گزارش). اگر مشترک ۰ باشد مقدار تهی است و در «کیفیت داده» می‌آید؛ مصرف ۰ با مشترک مثبت، سرانهٔ ۰ و «صفرمصرف» معتبر است.</li>
        <li><b>صدک (Percentile، ۰ تا ۱۰۰):</b> جایگاه نسبی سرانه در جامعهٔ مرجع. استان = همان کاربری در همهٔ شهرهای استان · امور = همان کاربری در شهرهای همان امور · شهر = کاربری‌های همان شهر. سه صدک مستقل‌اند. با کمتر از ${fa(c.minPopulation)} رکورد معتبر، صدک و رتبه تهی است.</li>
        <li><b>رتبه (Rank):</b> ۱ = بالاترین سرانه در همان جامعه.</li>
        <li><b>ضریب تمرکز (Concentration Index یا CI؛ نسبت، نه امتیاز ۰–۱۰۰):</b> سهم مصرف ÷ سهم مشترک در جامعهٔ مرجع. ۱ = متناسب · بزرگ‌تر از ۱ = سهم مصرف بیشتر از سهم مشترک · کوچک‌تر از ۱ = کمتر. ضریب تمرکز به‌تنهایی اثبات مشکل نیست.</li>
        <li><b>امتیاز ناهنجاری (Anomaly Score، ۰ تا ۱۰۰):</b> شدت نسبی ناهنجاری آماری (صدک، فاصله از میانه با انحراف مطلق میانه (MAD)، ضریب تمرکز؛ بر اساس روش انتخابی در تنظیمات). ۰ = شواهد قابل‌توجهی نیست · ۱۰۰ = بیشترین شدت در همان جامعه. «احتمال تخلف یا خطا» نیست.</li>
        <li><b>اهمیت حجمی (Materiality، ۰ تا ۱۰۰):</b> ۵۰٪ جایگاه مصرف کل + ۳۰٪ جایگاه تعداد مشترک + ۲۰٪ سهم مصرف (نسبت به سقف ${pf(c.shareCap*100,0)}) در همان جامعه. مستقل از امتیاز ناهنجاری است.</li>
        <li><b>امتیاز اولویت (Priority Score، ۰ تا ۱۰۰):</b> میانگین وزنی امتیاز ناهنجاری (${fa(c.wAnomaly)}٪) و اهمیت حجمی (${fa(c.wMaterial)}٪) — وزن‌ها پیش‌فرض قابل‌تغییرند. تفسیر رنگی: پایین &lt; ${fa(c.band1)} · متوسط ${fa(c.band1)}–${fa(c.band2)} · بالا ${fa(c.band2)}–${fa(c.band3)} · بسیار بالا ≥ ${fa(c.band3)} (فقط نمایش تحلیلی).</li>
        <li><b>نرخ صفرمصرف (Zero Rate):</b> در اکسل تعداد «مشترک صفرمصرف» جدا وجود ندارد؛ لذا مشترکِ رکوردهایی با مصرف دقیقاً ۰ به‌عنوان صفرمصرف برآورد می‌شود. «صفر٪ جامعه» = سهم این مشترکین از کل مشترکین همان جامعهٔ مرجع. صفرمصرف با کم‌مصرفی یکی نیست.</li>
        <li><b>وضعیت الف تا د (Profile A–D):</b> الف: سرانه بالا + ضریب تمرکز بالا · ب: سرانه بالا + ضریب تمرکز عادی/پایین · ج: سرانه پایین + ضریب تمرکز بالا · د: سرانه پایین + ضریب تمرکز پایین/عادی — همه «نیازمند بررسی».</li>
        <li><b>نقطه‌های استان/امور/شهر:</b> قرمز = نیازمند بررسی در همان سطح · سبز = عادی · خاکستری = جامعهٔ آماری کافی نیست.</li>
        <li><b>رشد/تغییر غیرعادی (Growth):</b> چون داده دورهٔ قبل در فایل نیست، محاسبه نمی‌شود (تهی، نه ۰٪).</li>
        <li><b>سرانه ماه:</b> (سرانه دوره ÷ روزهای گزارش) × ۳۰.</li>
        <li><b>مقایسه با سه سطح (Benchmark):</b> مقایسه با کل استان (Province)، با شهرهای همان امور (Affairs) و با کاربری‌های همان شهر (City Internal) — هر سه هم‌زمان محاسبه می‌شوند.</li>
      </ul>
    </details>

    <p class="an-foot">آستانه‌ها از منوی تنظیمات ← «تحلیل مصرف و ناهنجاری» (شامل کاربری‌های فعال و انواع هشدار). مقادیر پیش‌فرض «استاندارد قانونی» نیستند. سرجمع‌ها کنار گذاشته شده‌اند؛ نیروهای مسلح و نوع سکونتگاه با کلیدهای بالای همین صفحه کنترل می‌شوند (پیش‌فرض: بدون نیروی مسلح).</p>
  </div>`;

  bind(container, ctx);
  placeOpenDropdown(container);
  const dd2 = container.querySelector("[data-an-panel]:not(.hidden)");
  if(dd2 && keepDropTop) dd2.scrollTop = keepDropTop;      /* انتخاب چند مورد پشت‌سرهم، لیست را به بالا برنمی‌گرداند */
  if(Math.abs(window.scrollY-keepY)>1) window.scrollTo(0,keepY);
}

/* ───────── بازشوی فیلترها: fixed زیر خود کلید؛ با کلیک بیرون/Esc بسته می‌شود ───────── */
function placeOpenDropdown(container){
  const root = container || document.getElementById("viewContainer");
  if(!root || !ui.openDrop) return;
  const btn = root.querySelector(`[data-an-toggle="${ui.openDrop}"]`);
  let dd  = root.querySelector(`[data-an-panel="${ui.openDrop}"]`) || document.querySelector(`body > [data-an-panel="${ui.openDrop}"]`);
  if(!btn || !dd || dd.classList.contains("hidden")) return;
  if(dd.parentElement !== document.body) document.body.appendChild(dd);
  const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight, m = 8;
  const r = btn.getBoundingClientRect();
  const keepTop = dd.scrollTop;
  dd.style.position = "fixed";
  dd.style.width = ""; dd.style.maxHeight = "";
  const want = ui.openDrop==="usage" ? 320 : Math.max(r.width, 200);
  const dw = Math.min(want, vw - m*2);
  dd.style.width = dw + "px";
  let left = r.right - dw;                       /* لبه راست بازشو هم‌تراز لبه راست دکمه (RTL) */
  left = Math.max(m, Math.min(left, vw - dw - m));
  dd.style.left = left + "px"; dd.style.right = "auto";
  const spaceBelow = vh - r.bottom - m - 6, spaceAbove = r.top - m - 6;
  const natural = Math.min(dd.scrollHeight + 2, 360);
  const openUp = natural > spaceBelow && spaceAbove > spaceBelow;
  const room = Math.max(120, openUp ? spaceAbove : spaceBelow);
  dd.style.maxHeight = Math.min(360, room) + "px";
  const h = Math.min(natural, room);
  dd.style.top = (openUp ? Math.max(m, r.top - h - 6) : r.bottom + 6) + "px";
  dd.style.zIndex = "400";
  dd.scrollTop = keepTop;
}
function closeDropdown(){
  if(!ui.openDrop) return false;
  const was = ui.openDrop;
  ui.openDrop = null;
  document.querySelectorAll("[data-an-panel]").forEach(d=>{
    d.classList.add("hidden");
    if(d.parentElement===document.body){
      const wrap = document.querySelector(`#viewContainer [data-an-toggle="${d.getAttribute("data-an-panel")}"]`)?.closest(".filter-btn-wrap");
      if(wrap) wrap.appendChild(d);
    }
  });
  document.querySelectorAll("#viewContainer [data-an-toggle]").forEach(b=>{ b.classList.remove("open"); b.setAttribute("aria-expanded","false"); });
  return true;
}
let outsideBound = false;
function bindOutsideOnce(){
  if(outsideBound) return; outsideBound = true;
  const inside = t => t && t.closest && (t.closest("[data-an-panel]") || t.closest("[data-an-toggle]"));
  const onOutside = e => { if(ui.openDrop && document.body.classList.contains("anomaly-view") && !inside(e.target)) closeDropdown(); };
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("click", onOutside, true);
  document.addEventListener("keydown", e => { if(e.key==="Escape") closeDropdown(); });
  const reposition = e => {
    if(!ui.openDrop) return;
    if(e && e.type==="scroll" && e.target && e.target.closest && e.target.closest("[data-an-panel]")) return;
    placeOpenDropdown();
  };
  addEventListener("resize", reposition);
  addEventListener("orientationchange", reposition);
  addEventListener("scroll", reposition, true);
}

function toggleIn(arr, v){
  const i = arr.indexOf(v);
  if(i>=0) arr.splice(i,1); else arr.push(v);
  return arr;
}

function bind(container, ctx){
  container.querySelectorAll("[data-an-scope]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(btn.getAttribute("data-an-scope")==="armed") ui.armed = nextOf(ARMED_ORDER, ui.armed);
      else ui.settlement = nextOf(SETTLEMENT_ORDER, ui.settlement);
      ui.openDrop = null; ui.openKey = null;
      renderAnomaly(ctx);
    });
  });
  container.querySelectorAll("[data-an-card]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      ui.card = btn.getAttribute("data-an-card");
      ui.openDrop = null; ui.openKey = null;
      renderAnomaly(ctx);
    });
  });
  container.querySelectorAll("[data-an-level]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const v = btn.getAttribute("data-an-level");
      if(v==="auto"){ ui.levelManual = false; }
      else { ui.level = v; ui.levelManual = true; }
      ui.openKey = null;
      renderAnomaly(ctx);
    });
  });
  container.querySelectorAll("[data-an-row]").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const k = tr.getAttribute("data-an-row");
      ui.openKey = ui.openKey===k ? null : k;
      const scroller = container.querySelector(".an-table-wrap");
      const sl = scroller ? scroller.scrollLeft : 0, st = scroller ? scroller.scrollTop : 0;
      renderAnomaly(ctx);
      const s2 = container.querySelector(".an-table-wrap");
      if(s2){ s2.scrollLeft = sl; s2.scrollTop = st; }
    });
  });
  const more = container.querySelector("[data-an-more]");
  if(more) more.addEventListener("toggle", ()=>{ ui.moreOpen = more.open; });
  container.querySelectorAll("[data-an-toggle]").forEach(btn=>{
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const k = btn.getAttribute("data-an-toggle");
      ui.openDrop = ui.openDrop===k ? null : k;
      renderAnomaly(ctx);
    });
  });
  container.querySelectorAll("[data-an-chip]").forEach(btn=>{
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const key = btn.getAttribute("data-an-chip");
      const v = btn.getAttribute("data-v");
      if(key==="area"){
        /* امور: فقط یک انتخاب؛ با انتخاب/تغییر، منو فوراً بسته شود */
        ui.areas = ui.areas[0]===v ? [] : [v];
        ui.cities = [];
        ui.openDrop = null;
      }else if(key==="city") toggleIn(ui.cities, v);
      else if(key==="usage"){
        toggleIn(ui.usages, v);
      }
      if(key==="area" || key==="city") ui.levelManual = false;   /* تغییر انتخاب امور/شهر ⇒ سطح دوباره خودکار */
      ui.openKey = null;
      renderAnomaly(ctx);
    });
  });
  container.querySelectorAll("[data-an-clear]").forEach(btn=>{
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const key = btn.getAttribute("data-an-clear");
      if(key==="area"){ ui.areas=[]; ui.cities=[]; }
      else if(key==="city") ui.cities=[];
      else if(key==="usage") ui.usages=[];
      if(key==="area" || key==="city") ui.levelManual = false;
      ui.openDrop = null;
      ui.openKey = null;
      renderAnomaly(ctx);
    });
  });
  container.querySelectorAll("[data-an]").forEach(el=>{
    const key = el.getAttribute("data-an");
    el.addEventListener("change", ()=>{
      if(key==="showTop") ui.showTop = el.checked;
      else if(key==="showDetails") ui.showDetails = el.checked;
      else if(key==="sort") ui.sort = Number(el.value)||0;
      else if(key==="alertType") ui.alertType = el.value;
      else if(key==="dir") ui.dir = el.value;
      else if(key==="minCust") ui.minCust = el.value;
      else if(key==="minCons") ui.minCons = el.value;
      else if(key==="topN") ui.topN = el.value;
      renderAnomaly(ctx);
    });
  });
}
