/* تب «خروجی» — گزارش چاپی / PDF
   فیلترهای بالای صفحه (امور و کاربری) فقط برای محاسبات‌اند؛ ستون‌های جدول، ردیف‌ها، مرتب‌سازی و هشدارها از همین تب تنظیم می‌شوند.
   خروجی با چاپ مرورگر (Save as PDF) ساخته می‌شود تا متن فارسی، رنگ‌ها و شماره صفحه با کیفیت وکتور بماند. */
import {calc} from "./map.js";
import {sum} from "../engines/statistics.js";
import {structuralAnalysis, generalAlerts, healthScore, groupAlertsByArea, hasSpectrum, spectrumT, hasThreshold, thresholdSummary, scoreFormulaText, SEV_LABEL, fa} from "../engines/analyticsEngine.js";

const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const faDigits = s => String(s??"").replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]);

/* ستون‌های قابل انتخاب (ترتیب چاپ: آمار ← سرانه ← شاخص) */
const GROUPS = [
  {id:"stats", label:"آمارها", color:"#2f5f8f", tint:"rgba(205,222,246,.95)", ink:"#27466f", line:"rgba(100,130,180,.6)",
   keys:["customers","consumption","income","collection","debtEnd"]},
  {id:"percapita", label:"سرانه‌ها", color:"#0d8a6a", tint:"rgba(203,238,221,.95)", ink:"#0a6a4f", line:"rgba(70,180,135,.65)",
   keys:["perConsumption","perIncome","perCollection","perDebt","perConsumptionDay","perIncomeDay","perCollectionDay"]},
  {id:"indices", label:"شاخص‌ها", color:"#b8760f", tint:"rgba(252,232,190,.95)", ink:"#7a4e08", line:"rgba(215,170,70,.7)",
   keys:["idxPrice","idxCollection","idxCycle","debtGrowth","debtRisk"]},
  {id:"score", label:"نمره امور", color:"#6b4fa0", tint:"rgba(228,218,248,.95)", ink:"#4d3580", line:"rgba(150,120,210,.6)",
   keys:["score"]}
];
/* عنوان، واحد زیر عنوان، تعداد اعشار و مقیاس (اعداد گرد می‌شوند؛ به‌جز سرانه مصرف) */
const COL = {
  customers:{label:"تعداد مشترک", unit:"مشترک", d:0},
  consumption:{label:"مصرف", unit:"مترمکعب", d:0},
  income:{label:"درآمد", unit:"میلیون ریال", d:0, div:1e6},
  collection:{label:"وصول", unit:"میلیون ریال", d:0, div:1e6},
  debtEnd:{label:"بدهی", unit:"میلیون ریال", d:0, div:1e6},
  perConsumption:{label:"سرانه مصرف", unit:"مترمکعب/ماه", d:2},
  perIncome:{label:"سرانه درآمد", unit:"ریال/ماه", d:0},
  perCollection:{label:"سرانه وصول", unit:"ریال/ماه", d:0},
  perDebt:{label:"سرانه بدهی", unit:"ریال", d:0},
  perConsumptionDay:{label:"مصرف روزانه", unit:"مترمکعب/روز", d:0},
  perIncomeDay:{label:"درآمد روزانه", unit:"میلیون ریال/روز", d:0},
  perCollectionDay:{label:"وصول روزانه", unit:"میلیون ریال/روز", d:0},
  idxCollection:{label:"درصد وصول", unit:"٪", d:1},
  idxPrice:{label:"قیمت آب فروش رفته", unit:"ریال/مترمکعب", d:0},
  idxCycle:{label:"دوره وصول مطالبات", unit:"روز", d:1},
  debtGrowth:{label:"درصد رشد بدهی", unit:"٪", d:1},
  debtRisk:{label:"شاخص ریسک بدهی", unit:"٪", d:1},
  score:{label:"نمره", unit:"از ۱۰۰", d:0}
};
/* طیف رنگ شیشه‌ای: مقدار → ۰ (بدترین/قرمز) تا ۱ (بهترین/سبز)؛ نقاط شکست از آستانه‌های تنظیمات می‌آید (analyticsEngine.spectrumT) */
const specStyle = (m,v) => {
  const h = Math.round(125*spectrumT(m,v));
  return `background:linear-gradient(135deg,hsla(${h},82%,62%,.44),hsla(${h},82%,84%,.16));color:hsl(${h},62%,20%);font-weight:800`;
};
const BASE = {perConsumption:"customers",perIncome:"customers",perCollection:"customers",perDebt:"customers",idxCollection:"income",idxCycle:"income",idxPrice:"consumption",debtGrowth:"debtStart",debtRisk:"income"};
/* ابعاد ردیف (سه کلید قابل روشن/خاموش: امور، شهر، کاربری). ترتیب سطح‌ها همیشه ثابت است (امور ← شهر ← کاربری).
   فقط این ۶ حالت مجاز است: ۱) امور  ۲) شهر  ۳) کاربری  ۴) امور، شهر  ۵) امور، کاربری  ۶) امور، شهر، کاربری */
const DIMS = {area:{label:"امور"}, city:{label:"شهر"}, usage:{label:"کاربری"}};
const DIM_ORDER = ["area","city","usage"];
const VALID_MODES = ["area","city","usage","area,city","area,usage","area,city,usage"];
const canon = set => DIM_ORDER.filter(d=>set.includes(d));
const isValidMode = set => VALID_MODES.includes(canon(set).join(","));
const toggled = (dims,d) => canon(dims.includes(d) ? dims.filter(x=>x!==d) : [...dims,d]);

/* تنظیمات گزارش (بین رندرها حفظ می‌شود) */
const rep = {
  sel: new Set([...GROUPS[0].keys]),
  dims: ["area"], sortKey: "", sortDir: "desc", orient: "auto", alerts: true,
  pct: false          // کلید الاکلنگی ارقام ⇄ درصد (فقط ستون‌های «آمارها»)
};
/* ستون‌های «آمارها» — تنها ستون‌هایی که در حالت درصد به «درصد از جمع سطح بالاتر» تبدیل می‌شوند */
const STAT_KEYS = GROUPS[0].keys;
const isStat = m => STAT_KEYS.includes(m);
/* درصد سهم یک ردیف از جمع «والدش» (استان برای سطح اول، سپس امور/شهر مربوطه) — از جمع مستقیم داده‌ها، نه جمع نسبت‌ها */
function pctOf(rs, base, m){
  const b = calc(base,m); if(!b) return null;
  const v = calc(rs,m);
  return Number.isFinite(v) ? 100*v/b : null;
}
const fmtPct = v => v===null ? "—" : Number(v).toLocaleString("fa-IR",{maximumFractionDigits:1});
const colUnit = m => (rep.pct && isStat(m)) ? "٪ از جمع" : COL[m].unit;

/* ───────── محاسبه ───────── */
function val(rs,m){
  if(m==="score"){ const h = healthScore(rs); return h ? h.score : null; }
  if(BASE[m] && !sum(rs,BASE[m])) return null;
  const v = calc(rs,m);
  return Number.isFinite(v) ? v : null;
}
const hasData = rs => sum(rs,"customers")>0 || sum(rs,"income")>0 || sum(rs,"consumption")>0;
function fmt(m,v){
  if(v===null) return "—";
  const c = COL[m], x = c.div ? v/c.div : v;
  return Number(x).toLocaleString("fa-IR",{maximumFractionDigits:c.d});
}
function groupBy(rows,keyFn){
  const g = new Map();
  rows.forEach(r=>{ const k=keyFn(r); if(!k) return; if(!g.has(k)) g.set(k,[]); g.get(k).push(r); });
  return g;
}
const cmp = dir => (a,b)=>{
  if(a===null && b===null) return 0; if(a===null) return 1; if(b===null) return -1;
  return dir==="desc" ? b-a : a-b;
};

/* ردیف‌های جدول به‌صورت درخت: هر بُعد انتخاب‌شده یک سطح است (به ترتیب کلیک). گره‌های هر سطح بر اساس ستون مرتب‌سازی
   مرتب می‌شوند و زیر هر گره والد (سرجمع) ردیف‌های زیرمجموعه‌اش می‌آید. */
const KEY_OF = {area:r=>r.area, city:r=>r.area+"|"+r.city, usage:r=>r.usage};
const NAME_OF = {area:r=>r.area, city:r=>r.city, usage:r=>r.usage};
function buildRows(rows, dims, metrics, sortKey, dir){
  const c = cmp(dir), levels = dims, out = [];
  const label = (name,parent) => parent ? "سرجمع "+name : name;
  /* base = مجموعهٔ ردیف‌های «والد» (برای سطح اول کل داده) — مبنای محاسبهٔ درصد */
  const walk = (rs, depth, base) => {
    const kind = levels[depth], leaf = depth===levels.length-1;
    const nodes = [...groupBy(rs,KEY_OF[kind]).entries()].filter(([,g])=>hasData(g))
      .map(([,g])=>({name:NAME_OF[kind](g[0]), rs:g, sortVal:val(g,sortKey)})).sort((x,y)=>c(x.sortVal,y.sortVal));
    nodes.forEach(nd=>{
      out.push({type:leaf?"item":"grp", depth, kind, name:label(nd.name,!leaf), rs:nd.rs, base, vals:metrics.map(m=>val(nd.rs,m))});
      if(!leaf) walk(nd.rs, depth+1, nd.rs);
    });
  };
  if(levels.length) walk(rows,0,rows);
  out.push({type:"total", depth:0, kind:"total", name:"جمع کل", rs:rows, base:rows, vals:metrics.map(m=>val(rows,m))});
  return out;
}
const dimsText = dims => dims.map(d=>DIMS[d].label).join(" › ");

/* ───────── چیدمان صفحه ───────── */
const PAGE_MM = {portrait:{w:210,usable:192}, landscape:{w:297,usable:279}};
/* عرض ستون‌ها بر اساس طول واقعی اعداد (به‌ویژه ردیف‌های جمع که بزرگ‌ترند): «واحد نویسه» هر ستون = طولانی‌ترین عدد یا کلمه تیتر */
const MM_PT = 0.3528, DIGIT_EM = 0.65, PAD_MM = 1.9;          // میلی‌متر هر نقطه؛ عرض تقریبی رقم فارسی (نسبت به فونت)؛ حاشیه سلول
const textUnits = str => [...String(str)].reduce((a,ch)=>a+(/[٬٫,.،]/.test(ch)?0.52:1),0);
function layout(n, maxLen, colUnits){
  const U = colUnits.reduce((a,b)=>a+b,0);
  const firstOf = (fs,usable) => Math.min(usable*0.42, Math.max(22, maxLen*fs*MM_PT*0.6 + 9));   // ستون اول = بلندترین نام
  const solve = orient => {
    const usable = PAGE_MM[orient].usable;
    let fs = 8.5, first = firstOf(fs,usable);
    for(let i=0;i<4;i++){
      const avail = usable - first - n*PAD_MM;
      fs = Math.max(4.8, Math.min(8.5, avail/(U*MM_PT*DIGIT_EM)));
      first = firstOf(fs,usable);
    }
    const w = colUnits.map(u=>u*fs*MM_PT*DIGIT_EM + PAD_MM);
    const scale = (usable-first)/w.reduce((a,b)=>a+b,0);           // باقی‌مانده عرض بین ستون‌ها تقسیم می‌شود
    return {orient, usable, first, fs, cols:w.map(x=>x*scale)};
  };
  if(rep.orient!=="auto") return solve(rep.orient);
  const p = solve("portrait");
  return p.fs>=7.2 ? p : solve("landscape");                     // اگر در عمودی خواناست عمودی، وگرنه افقی
}
function applyPageStyle(orient){
  let st = document.getElementById("rpPageStyle");
  if(!st){ st=document.createElement("style"); st.id="rpPageStyle"; document.head.appendChild(st); }
  st.textContent = `@page{size:A4 ${orient};margin:11mm 9mm 15mm 9mm;
    @bottom-center{content:"صفحه " counter(page, persian) " از " counter(pages, persian);font-family:Vazirmatn,Tahoma,sans-serif;font-size:8pt;color:#4a5a6e}
    @bottom-left{content:"گزارش مدیریتی دفتر درآمد";font-family:Vazirmatn,Tahoma,sans-serif;font-size:7pt;color:#8a97a8}}`;
}
export function clearReportPageStyle(){ document.getElementById("rpPageStyle")?.remove(); }

/* ───────── هشدارها و بحران‌ها ───────── */
function alertList(rows, dims){
  // سطح هشدارهای ساختاری: اگر شهر هست → شهرها؛ وگرنه اگر امور هست → امورها؛ وگرنه کاربری‌ها
  const level = dims.includes("city") ? "area" : dims.includes("area") ? "province" : "city";
  const multiArea = level==="area";
  const list = [];
  ["idxCollection","idxCycle"].forEach(m=>structuralAnalysis(rows,{level,metric:m,multiArea}).alerts
    .filter(a=>a.sev!=="green").forEach(a=>list.push(a)));
  generalAlerts(rows,{level,multiArea,metric:"idxCollection"}).filter(a=>a.sev!=="green").forEach(a=>list.push(a));
  // هشدار/ریسک توصیفی بر پایه همان ۴ مؤلفه نمره: درصد جذب، دوره وصول، ریسک بدهی و رشد بدهی
  ["debtRisk","debtGrowth"].forEach(m=>{
    try{
      structuralAnalysis(rows,{level,metric:m,multiArea}).alerts
        .filter(a=>a.sev!=="green").forEach(a=>list.push({...a, text:`[${COL[m]?.label||m}] ${a.text}`}));
    }catch(_){}
  });
  return list;
}

/* ───────── رندر ───────── */
export function renderReport(ctx){
  const container = document.getElementById("viewContainer");
  if(!container) return;
  const {rows, period, activeAreas, selectedUsages, usageTotal, settlement="شهر/روستا"} = ctx;

  const metrics = GROUPS.flatMap(g=>g.keys.filter(k=>rep.sel.has(k)));
  if(!metrics.includes(rep.sortKey)) rep.sortKey = metrics[0] || "";
  const data = metrics.length ? buildRows(rows, rep.dims, metrics, rep.sortKey, rep.sortDir) : [];
  const maxLen = Math.max(dimsText(rep.dims).length*0.8, ...data.map(r=>r.name.length + (r.depth||0)*2.6));   // با احتساب تورفتگی سطح‌ها
  const simple = rep.dims.length===1;
  const cells = data.map(r=>r.vals.map((v,i)=>(rep.pct && isStat(metrics[i])) ? fmtPct(pctOf(r.rs,r.base,metrics[i])) : fmt(metrics[i],v)));
  const hasStatCol = metrics.some(isStat);
  const colUnits = metrics.map((m,i)=>{
    const boldCol = rep.alerts && hasSpectrum(m);                                                       // خانه‌های رنگی پررنگ‌اند
    const num = Math.max(1, ...data.map((r,k)=>textUnits(cells[k][i])*(r.type==="item"?1:1.12)*(boldCol?1.12:1)));   // ردیف‌های سرجمع/جمع هم پررنگ‌ترند
    const words = t => Math.max(...String(t).split(/\s+/).map(w=>w.length));
    const head = Math.max(words(COL[m].label)*0.9, words(colUnit(m))*0.7);
    return Math.max(num, head)*1.03;
  });
  const L = layout(Math.max(1,metrics.length), maxLen, colUnits.length?colUnits:[1]);
  applyPageStyle(L.orient);

  /* پنل تنظیمات (فقط روی صفحه) */
  const groupOn = g => g.keys.some(k=>rep.sel.has(k));
  const groupBtns = GROUPS.map(g=>`<button type="button" class="rp-group ${groupOn(g)?"on":""}" style="--gc:${g.color}" data-rp="group" data-v="${g.id}" aria-pressed="${groupOn(g)}">${g.label}</button>`).join("");
  const chipRows = GROUPS.filter(g=>groupOn(g) && g.keys.length>1).map(g=>`<div class="rp-chips" style="--gc:${g.color}"><span class="rp-chips-label">${g.label}</span>${
    g.keys.map(k=>`<button type="button" class="rp-chip ${rep.sel.has(k)?"on":""}" data-rp="metric" data-v="${k}">${COL[k].label}</button>`).join("")}</div>`).join("");
  const MODE_LABELS = {
    "area":"امور",
    "city":"شهر",
    "usage":"کاربری",
    "area,city":"امور › شهر",
    "area,usage":"امور › کاربری",
    "area,city,usage":"امور › شهر › کاربری"
  };
  const currentMode = canon(rep.dims).join(",");
  const dimBtns = VALID_MODES.map(m=>{
    const on = currentMode===m;
    return `<button type="button" class="an-seg-btn ${on?"active":""}" data-rp="dimmode" data-v="${m}" aria-pressed="${on}">${MODE_LABELS[m]}</button>`;
  }).join("");
  const sortOpts = metrics.map(m=>`<option value="${m}" ${m===rep.sortKey?"selected":""}>${COL[m].label}</option>`).join("");
  const orientBtns = [["auto","خودکار"],["portrait","عمودی"],["landscape","افقی"]].map(([k,l])=>`<button type="button" class="an-seg-btn ${rep.orient===k?"active":""}" data-rp="orient" data-v="${k}">${l}</button>`).join("");
  const controls = `<section class="card rp-controls">
    <div class="rp-sec"><span class="rp-label">ستون‌های گزارش</span>
      <div class="rp-sec-body"><div class="rp-groups">${groupBtns}</div>${chipRows}</div></div>
    <div class="rp-sec"><span class="rp-label">ردیف‌ها بر اساس</span>
      <div class="rp-sec-body"><div class="an-seg rp-seg rp-modes">${dimBtns}</div>
        <span class="rp-hint">۶ حالت مجاز. ترتیب سطح‌ها ثابت است (امور ← شهر ← کاربری). نوع سکونتگاه (شهر/روستا) را از فیلتر بالای صفحه تعیین کنید.</span></div></div>
    <div class="rp-sec"><span class="rp-label">مرتب‌سازی بر اساس</span>
      <div class="rp-sec-body rp-inline">
        <select class="rp-select" data-rp="sortkey" ${metrics.length?"":"disabled"}>${sortOpts}</select>
        <button type="button" class="an-chip" data-rp="sortdir">${rep.sortDir==="desc"?"نزولی ▾":"صعودی ▴"}</button>
        ${simple?"":`<span class="rp-hint">گروه‌های بیرونی بر اساس سرجمع خودشان مرتب می‌شوند و زیرمجموعه‌ها درون هر گروه.</span>`}</div></div>
    <div class="rp-sec"><span class="rp-label">جهت صفحه</span>
      <div class="rp-sec-body rp-inline"><div class="an-seg rp-seg rp-seg3">${orientBtns}</div>
        <span class="rp-hint">اکنون: ${L.orient==="landscape"?"افقی":"عمودی"}${rep.orient==="auto"?" (خودکار بر اساس عرض ستون‌ها)":""}</span></div></div>
    <div class="rp-sec rp-last"><span class="rp-label">هشدارها و چاپ</span>
      <div class="rp-sec-body rp-inline rp-between">
        <label class="rp-switch"><input type="checkbox" data-rp="alerts" ${rep.alerts?"checked":""}><span class="rp-track"></span><span>چاپ هشدارها و بحران‌ها</span></label>
        <div class="rp-pctbox${hasStatCol?"":" off"}" title="${hasStatCol?"آمارها به‌صورت ارقام یا درصد از جمع سطح بالاتر (استان ← امور ← شهر)":"برای استفاده، حداقل یکی از ستون‌های «آمارها» را انتخاب کنید"}">
          <span class="rp-hint">آمارها:</span>
          <div class="ax-seesaw rp-pct" data-dim="${rep.pct?"usage":"area"}" role="group" aria-label="نمایش آمارها به‌صورت ارقام یا درصد">
            <i class="ax-see-knob"></i>
            <button type="button" class="ax-see-opt${rep.pct?"":" on"}" data-rp="pct" data-v="num" aria-pressed="${!rep.pct}">ارقام</button>
            <button type="button" class="ax-see-opt${rep.pct?" on":""}" data-rp="pct" data-v="pct" aria-pressed="${rep.pct}">درصد</button>
          </div>
        </div>
        <button type="button" class="rp-print" data-rp="print" ${metrics.length?"":"disabled"}>چاپ / ذخیره PDF</button></div></div>
  </section>`;

  /* سربرگ گزارش */
  const today = new Date().toLocaleDateString("fa-IR-u-ca-persian",{year:"numeric",month:"2-digit",day:"2-digit"});
  const allUsages = !selectedUsages.length || (usageTotal && selectedUsages.length>=usageTotal);
  const usageText = allUsages ? "همه کاربری‌ها" : selectedUsages.join("، ");
  const areaText = activeAreas.length ? activeAreas.join("، ") : "همه امور";
  const sortText = metrics.length ? `${COL[rep.sortKey].label} (${rep.sortDir==="desc"?"نزولی":"صعودی"})${simple?"":" — گروه‌ها بر اساس سرجمع خودشان"}` : "—";
  const head = `<header class="rp-head">
    <div class="rp-title"><h1>گزارش مدیریتی دفتر درآمد</h1><span>به تفکیک ${dimsText(rep.dims)}</span></div>
    <dl class="rp-meta">
      <div><dt>بازه گزارش</dt><dd>${period&&period.from?`از ${faDigits(period.from)} تا ${faDigits(period.to)}`:"—"}</dd></div>
      <div><dt>تاریخ چاپ</dt><dd>${esc(today)}</dd></div>
      <div class="wide"><dt>کاربری‌ها</dt><dd>${esc(usageText)}</dd></div>
      <div class="wide"><dt>امور</dt><dd>${esc(areaText)}</dd></div>
      <div><dt>نوع سکونتگاه</dt><dd>${settlement==="شهر/روستا"?"شهر و روستا":"فقط "+esc(settlement)}</dd></div>
      <div class="wide"><dt>مرتب‌سازی</dt><dd>${esc(sortText)}</dd></div>
      ${(rep.pct && hasStatCol)?`<div class="wide"><dt>نمایش آمارها</dt><dd>درصد از جمع سطح بالاتر</dd></div>`:""}
    </dl>
  </header>`;

  /* جدول */
  let table = `<p class="rp-empty">حداقل یک ستون (آمار، سرانه یا شاخص) انتخاب کنید.</p>`;
  if(metrics.length){
    const bands = GROUPS.map(g=>({g,n:g.keys.filter(k=>rep.sel.has(k)).length})).filter(x=>x.n);
    const groupOf = m => GROUPS.find(g=>g.keys.includes(m));
    const cellStyle = (m,v) => (rep.alerts && hasSpectrum(m) && v!==null) ? ` style="${specStyle(m,v)}"` : "";
    const glass = g => `background:linear-gradient(135deg,${g.tint},rgba(255,255,255,.92));color:${g.ink};border-color:${g.line}`;
    const sortMark = m => m===rep.sortKey
      ? `<span class="rp-sortmark" style="--gc:${groupOf(m).color}" title="جدول بر اساس این ستون ${rep.sortDir==="desc"?"نزولی":"صعودی"} مرتب شده است">${rep.sortDir==="desc"?"▼":"▲"}</span>` : "";
    table = `<table class="rp-table" style="font-size:${L.fs.toFixed(2)}pt">
      <colgroup><col style="width:${L.first.toFixed(1)}mm">${L.cols.map(w=>`<col style="width:${w.toFixed(1)}mm">`).join("")}</colgroup>
      <thead>
        <tr class="rp-sortrow"><th rowspan="3" class="rp-first">${dimsText(rep.dims)}</th>${metrics.map(m=>`<th class="rp-sortcell">${sortMark(m)}</th>`).join("")}</tr>
        <tr class="rp-band">${bands.map(b=>`<th colspan="${b.n}" style="${glass(b.g)}">${b.g.label}</th>`).join("")}</tr>
        <tr class="rp-cols">${metrics.map(m=>{const g=groupOf(m);return `<th style="background:linear-gradient(180deg,rgba(255,255,255,.96),${g.tint});color:${g.ink};border-color:${g.line};border-bottom:2.5px solid ${g.line}${m===rep.sortKey?";box-shadow:inset 0 -3px 0 "+g.color:""}">${COL[m].label}<small>${colUnit(m)}</small></th>`}).join("")}</tr>
      </thead>
      <tbody>${data.map(r=>`<tr class="rp-${r.type} dep${Math.min(r.depth||0,3)}"><td class="rp-first" style="padding-inline-start:${6+(r.depth||0)*9}px">${esc(r.name)}</td>${
        r.vals.map((v,i)=>`<td${(rep.pct && isStat(metrics[i]))?"":cellStyle(metrics[i],v)}>${cells[data.indexOf(r)][i]}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
    if(rep.pct && hasStatCol){
      const chain = rep.dims.map((k,i)=>`هر ${DIMS[k].label} نسبت به ${i===0 ? "جمع کل استان (با فیلترهای فعلی)" : "جمع "+DIMS[rep.dims[i-1]].label+" مربوطه"}`).join("؛ ");
      table += `<p class="rp-legend">ستون‌های «آمارها» به‌صورت درصد از جمع سطح بالاتر نمایش داده شده‌اند: ${chain}. سرانه‌ها و شاخص‌ها بدون تغییر و به‌صورت مقدار واقعی‌اند.</p>`;
    }
    if(rep.alerts){
      const used = metrics.filter(hasSpectrum);
      table += `<p class="rp-legend">${used.length?`<i class="lg-spec"></i>طیف رنگ: قرمز (بحرانی) ← نارنجی (هشدار) ← زرد (قابل‌قبول) ← سبز (عالی / خوب) — اعمال‌شده روی ${used.map(m=>"«"+(m==="score"?"نمره امور":COL[m].label)+"»").join("، ")}. `:""}${metrics.filter(hasThreshold).map(m=>`${COL[m].label}: ${thresholdSummary(m)}`).join("؛ ")}.${metrics.includes("score")?" "+scoreFormulaText()+".":""}</p>`;
    } else if(metrics.includes("score")){
      table += `<p class="rp-legend">${scoreFormulaText()}.</p>`;
    }
  }

  /* بخش هشدارها */
  let alertsHtml = "";
  if(rep.alerts && metrics.length){
    const list = alertList(rows, rep.dims);
    const order = data.filter(r=>r.kind==="area").map(r=>r.name.replace(/^سرجمع /,""));   // ترتیب امورها مطابق جدول
    const cnt = sev => list.filter(a=>a.sev===sev).length;
    alertsHtml = `<section class="rp-alerts"><h2>هشدارها و بحران‌ها
        <small>${cnt("red")?`<b class="c-red">${fa(cnt("red"))} بحرانی</b>`:""}${cnt("orange")?`<b class="c-orange">${fa(cnt("orange"))} هشدار</b>`:""}${cnt("yellow")?`<b class="c-yellow">${fa(cnt("yellow"))} نکته</b>`:""}</small></h2>${
      list.length ? groupAlertsByArea(list, order).map(g=>`<div class="rp-agroup"><h3>${esc(g.label)} <small>${fa(g.alerts.length)} مورد</small></h3>
        <div class="rp-alert-grid">${g.alerts.map(a=>`<div class="rp-alert ${a.sev}"><em>${SEV_LABEL[a.sev]}</em>${esc(a.text)}</div>`).join("")}</div></div>`).join("")
      : `<p class="rp-empty">مورد بحرانی، هشدار یا نکته‌ای برای محدوده و فیلترهای جاری دیده نشد.</p>`}</section>`;
  }

  container.innerHTML = `<div class="rp-root">${controls}<article class="rp-sheet">${head}${table}${alertsHtml}</article></div>`;

  /* رویدادها */
  container.onclick = e=>{
    const t = e.target.closest("[data-rp]");
    if(!t || !container.contains(t)) return;
    const a = t.dataset.rp, v = t.dataset.v;
    if(a==="group"){
      const g = GROUPS.find(x=>x.id===v);
      if(groupOn(g)) g.keys.forEach(k=>rep.sel.delete(k)); else g.keys.forEach(k=>rep.sel.add(k));
    }else if(a==="metric"){ rep.sel.has(v) ? rep.sel.delete(v) : rep.sel.add(v); }
    else if(a==="dim"){
      const next = toggled(rep.dims,v);
      if(!isValidMode(next)) return;                                      // ترکیب غیرمجاز اعمال نمی‌شود
      rep.dims = next;
    }
    else if(a==="dimmode"){
      rep.dims = v.split(",");
    }
    else if(a==="sortdir") rep.sortDir = rep.sortDir==="desc" ? "asc" : "desc";
    else if(a==="pct"){ if(!hasStatCol) return; rep.pct = v==="pct"; }
    else if(a==="orient") rep.orient = v;
    else if(a==="print"){ window.print(); return; }
    else return;
    renderReport(ctx);
  };
  container.onchange = e=>{
    const t = e.target.closest("[data-rp]"); if(!t) return;
    if(t.dataset.rp==="sortkey"){ rep.sortKey = t.value; renderReport(ctx); }
    else if(t.dataset.rp==="alerts"){ rep.alerts = t.checked; renderReport(ctx); }
  };
}
