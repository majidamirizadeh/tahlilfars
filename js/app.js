import {syncDataset,getCachedRecord} from "./data/dataLoader.js";
import {DATASETS} from "./data/dataRegistry.js";
import {setDatasetVersion} from "./core/datasetState.js";
import {loadVendor} from "./core/vendor.js";
import {registerPWA} from "./core/pwa.js";
import {uniqueSorted} from "./filters/filters.js";
import {render as renderProvince} from "./dashboards/overview.js";
import {renderMap} from "./dashboards/map.js";
/* داشبوردهای سنگین (رتبه/مصرف/مالی/گزارش) فقط هنگام اولین ورود به تب Load می‌شوند */
const VIEW_LOADERS={
  analytics:()=>import("./dashboards/analytics.js"),
  anomaly:()=>import("./dashboards/anomaly.js"),
  finance:()=>import("./dashboards/finance.js"),
  report:()=>import("./dashboards/report.js")
};
const viewMods={}, viewLoading={};
function loadView(name){
  if(viewMods[name]) return Promise.resolve(viewMods[name]);
  return viewLoading[name]??=VIEW_LOADERS[name]().then(m=>viewMods[name]=m).catch(e=>{delete viewLoading[name];throw e});
}
import {onChange as onSettingsChange, get as getSetting} from "./settings/settings.js";
import {thresholdClasses} from "./engines/analyticsEngine.js";
import {invalidateFinanceCache} from "./engines/financeEngine.js";
import {initSettingsMenu} from "./settings/settingsMenu.js";
import {ARMED_USAGE, ARMED, ARMED_ORDER, SETTLEMENT, SETTLEMENT_ORDER, nextOf, armedRows, settlementRows as settlementRowsBy} from "./filters/scopeFilters.js";
/* تنظیمات ناهنجاری: موتور آن هنگام ورود به تب «مصرف» یا باز شدن منوی تنظیمات Load و ثبت می‌شود */
const ensureAnomalySettings=()=>import("./engines/anomalyEngine.js");
import "./engines/financeEngine.js"; /* ثبت تنظیمات «تحلیل مالی و عملکردی» در رجیستری */
import "./engines/zeroWatchEngine.js"; /* ثبت تنظیمات گروه جدای «پایش صفرها» در رجیستری */

let state={
  rows:[],
  mode:"stats",
  loaded:false,
  view:"home",
  chartArea:"",
  selectedAreas:[],   // multi-select areas from dropdown or map
  selectedUsages:[],  // multi-select usages
  settlement:"all",   // نوع سکونتگاه: all | city | rural (فیلتر چرخشی نوار بالا)
  armedForces:"without", // نیروهای مسلح: with (عادی) | without | only (فیلتر چرخشی نوار بالا) — دیفالت بدون نیروی مسلح
  selectedCities:[],  // فیلتر شهر/بخش — فقط وقتی دقیقاً یک امور فعال است
  datasetKey:""       // شناسهٔ دادهٔ فعال (hash|version)
};
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const MODE_METRICS={
  stats:["customers","consumption","income","collection","debtEnd"],
  percapita:["perConsumption","perIncome","perCollection","perDebt","perConsumptionDay","perIncomeDay","perCollectionDay"],
  indices:["idxCollection","idxPrice","idxCycle","debtGrowth","debtRisk"]
};
window.__MAP_METRIC=MODE_METRICS.stats[0];

function esc(s){return String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");}
function setRefreshState(active){const b=$("#refreshBtn");if(!b)return;b.classList.toggle("refreshing",active);b.classList.toggle("refreshed",!active&&state.loaded)}

/* نوع سکونتگاه (چرخشی): all = شهر و روستا · city = فقط شهر · rural = فقط روستا (تعریف مشترک در modules/scopeFilters.js) */
function settlementRows(rows){ return settlementRowsBy(rows,state.settlement); }
function updateSettlementBtn(){
  const b=$("#settlementBtn"); if(!b)return;
  const s=SETTLEMENT[state.settlement];
  b.dataset.state=state.settlement;
  $("#settlementLabel").textContent=s.label; $("#settlementIcon").textContent=s.icon;
}

/* فیلتر کاربری: کلید چرخشی نیروهای مسلح (با / بدون / فقط) — تعریف مشترک در modules/scopeFilters.js.
   کلید «دستگاه‌های اجرایی و فضای سبز» حذف شده است. */
function specialUsageRows(rows){ return armedRows(rows,state.armedForces); }
function updateArmedForcesBtn(){
  const b=$("#armedForcesBtn"); if(!b)return;
  const a=ARMED[state.armedForces];
  b.dataset.state=state.armedForces;
  $("#armedForcesLabel").textContent=a.label; $("#armedForcesIcon").textContent=a.icon;
}
function filteredRows(){
  let rows=settlementRows(state.rows);
  rows=specialUsageRows(rows);
  if(state.selectedUsages.length){
    rows=rows.filter(r=>state.selectedUsages.includes(r.usage));
  }
  if(state.selectedAreas.length){
    rows=rows.filter(r=>state.selectedAreas.includes(r.area));
  }else if(state.chartArea){
    rows=rows.filter(r=>r.area===state.chartArea);
  }
  if(state.selectedCities.length && activeAreas().length===1){
    rows=rows.filter(r=>state.selectedCities.includes(r.city));
  }
  return rows;
}

function chartBaseRows(){
  let rows=settlementRows(state.rows);
  rows=specialUsageRows(rows);
  if(state.selectedUsages.length){
    rows=rows.filter(r=>state.selectedUsages.includes(r.usage));
  }
  return rows;
}

function updateAreaLabel(){
  const label=$("#areaFilterLabel");
  const clearBtn=$("#areaClearBtn");
  if(!label)return;
  if(state.selectedAreas.length===0 && !state.chartArea){
    label.textContent="همه امور";
    if(clearBtn){clearBtn.disabled=true;clearBtn.classList.remove("active")}
  }else if(state.selectedAreas.length===1){
    label.textContent=state.selectedAreas[0];
    if(clearBtn){clearBtn.disabled=false;clearBtn.classList.add("active")}
  }else if(state.selectedAreas.length>1){
    label.textContent=state.selectedAreas.length.toLocaleString("fa-IR")+" امر انتخاب‌شده";
    if(clearBtn){clearBtn.disabled=false;clearBtn.classList.add("active")}
  }else if(state.chartArea){
    label.textContent=state.chartArea;
    if(clearBtn){clearBtn.disabled=false;clearBtn.classList.add("active")}
  }
}

function updateUsageLabel(){
  const label=$("#usageFilterLabel");
  const clearBtn=$("#usageClearBtn");
  if(!label)return;
  if(state.selectedUsages.length===0){
    label.textContent="فیلتر کاربری";
    if(clearBtn){clearBtn.disabled=true;clearBtn.classList.remove("active")}
  }else if(state.selectedUsages.length===1){
    label.textContent=state.selectedUsages[0];
    if(clearBtn){clearBtn.disabled=false;clearBtn.classList.add("active")}
  }else{
    label.textContent=state.selectedUsages.length.toLocaleString("fa-IR")+" کاربری";
    if(clearBtn){clearBtn.disabled=false;clearBtn.classList.add("active")}
  }

}

function fillAreaDropdown(){
  const list=$("#areaDropdownList");
  if(!list)return;
  const areas=uniqueSorted(state.rows,"area");
  list.innerHTML=areas.map(a=>{
    const checked=state.selectedAreas.includes(a) || state.chartArea===a;
    return `<button type="button" class="dropdown-item ${checked?"selected":""}" data-area="${esc(a)}">${esc(a)}</button>`;
  }).join("");
  list.querySelectorAll(".dropdown-item").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const area=btn.dataset.area;
      // multi-select possible; after any selection the list auto-closes
      const idx=state.selectedAreas.indexOf(area);
      if(idx>=0) state.selectedAreas.splice(idx,1);
      else state.selectedAreas.push(area);
      state.chartArea=""; // clear map single select when using dropdown
      updateAreaLabel();
      fillAreaDropdown();
      syncCitySubFilter();
      closeAllDropdowns();
      rerenderHome();
    });
  });
}

/* فیلتر «شهر/بخش» — فقط وقتی دقیقاً یک امور فعال است (از دراپ‌داون یا کلیک نقشه)، به‌صورت جعبه چیپ‌های
   قابل‌انتخاب درون خود نوار فیلتر (نه دراپ‌داون جدا) زیرمجموعه شهرها/بخش‌های همان امور را نشان می‌دهد */
let citySubArea=null;
function syncCitySubFilter(){
  const wrap=$("#citySubInline"); if(!wrap)return;
  const areas=activeAreas();
  if(areas.length!==1){
    if(state.selectedCities.length) state.selectedCities=[];
    citySubArea=null;
    wrap.hidden=true;
    return;
  }
  if(citySubArea!==areas[0]){
    citySubArea=areas[0];
    state.selectedCities=[];
  }
  wrap.hidden=false;
  $("#citySubAreaName").textContent=citySubArea;
  fillCitySubChips();
}
function fillCitySubChips(){
  const wrap=$("#citySubChips");
  if(!wrap||!citySubArea)return;
  const cities=uniqueSorted(state.rows.filter(r=>r.area===citySubArea),"city");
  wrap.innerHTML=cities.map(c=>{
    const checked=state.selectedCities.includes(c);
    return `<button type="button" class="citysub-chip ${checked?"selected":""}" data-city="${esc(c)}">${esc(c)}</button>`;
  }).join("");
  wrap.querySelectorAll(".citysub-chip").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const c=btn.dataset.city;
      const idx=state.selectedCities.indexOf(c);
      if(idx>=0) state.selectedCities.splice(idx,1);
      else state.selectedCities.push(c);
      updateCitySubClear();
      fillCitySubChips();
          rerenderHome();
    });
  });
  updateCitySubClear();
}
function updateCitySubClear(){
  const clearBtn=$("#citySubClearBtn");
  if(!clearBtn)return;
  const on=state.selectedCities.length>0;
  clearBtn.disabled=!on;
  clearBtn.classList.toggle("active",on);
}

/* پیش‌فرض «۴ کاربری»: میان‌بر برای انتخاب هم‌زمان کاربری‌های مهم (تنظیم‌پذیر در منوی تنظیمات) */

function fillUsageDropdown(){
  const grid=$("#usageDropdownGrid");
  if(!grid)return;
  const usages=uniqueSorted(state.rows,"usage").filter(u=>u!==ARMED_USAGE);   // نیروی مسلح با کلید جداگانه بالا کنترل می‌شود
  const important=(getSetting("usages.important")||[]).filter(u=>usages.includes(u));
  const presetOn=important.length>0 && important.every(u=>state.selectedUsages.includes(u));
  const presetHtml=important.length?`<button type="button" class="usage-item usage-preset ${presetOn?"selected":""}" data-preset="1">۴ کاربری</button>`:"";
  grid.innerHTML=presetHtml+usages.map(u=>{
    const checked=state.selectedUsages.includes(u);
    return `<button type="button" class="usage-item ${checked?"selected":""}" data-usage="${esc(u)}">${esc(u)}</button>`;
  }).join("");
  grid.querySelector(".usage-preset")?.addEventListener("click",()=>{
    if(presetOn) state.selectedUsages=state.selectedUsages.filter(u=>!important.includes(u));
    else state.selectedUsages=[...new Set([...state.selectedUsages,...important])];
    updateUsageLabel();
    fillUsageDropdown();
    rerenderHome();
  });
  grid.querySelectorAll(".usage-item:not(.usage-preset)").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const u=btn.dataset.usage;
      const idx=state.selectedUsages.indexOf(u);
      if(idx>=0) state.selectedUsages.splice(idx,1);
      else state.selectedUsages.push(u);
      updateUsageLabel();
      fillUsageDropdown();
      rerenderHome();
    });
  });
}

/* تب‌های اصلی آمارها/سرانه‌ها/شاخص‌ها (فقط صفحه هوم؛ در تب تحلیل این نوار مخفی است) */
function syncModeTabs(){
  $$('#mapModeTabs .map-mode-tab').forEach(x=>x.classList.toggle('active',x.dataset.mode===state.mode));
}

function activeAreas(){
  return state.selectedAreas.length ? state.selectedAreas : (state.chartArea ? [state.chartArea] : []);
}

function ensureMapMetric(){
  if(!MODE_METRICS[state.mode].includes(window.__MAP_METRIC))
    window.__MAP_METRIC=MODE_METRICS[state.mode][0];
}

function rerenderHome(){
  if(!state.loaded)return;
  if(state.view==="analytics") return rerenderAnalytics();
  if(state.view==="anomaly") return rerenderAnomaly();
  if(state.view==="finance") return rerenderFinance();
  if(state.view==="report") return rerenderReport();
  renderHomeView();
}

/* «در حال بارگذاری» فقط وقتی ماژول تب هنوز Load نشده */
async function viewModule(name){
  if(!viewMods[name]){ const c=$("#viewContainer"); if(c) c.innerHTML=`<section class="card empty loading-state"><div class="loader"></div><h3>در حال بارگذاری…</h3></section>`; }
  try{ return await loadView(name); }
  catch(e){ console.error(e); const c=$("#viewContainer"); if(c) c.innerHTML=`<section class="card empty"><h3>بارگذاری این بخش انجام نشد</h3><p>اتصال را بررسی و دوباره تلاش کنید.</p></section>`; return null; }
}
/* تب خروجی (چاپ / PDF): همان فیلترهای جاری امور و کاربری فقط برای محاسبات */
async function rerenderReport(){
  if(!state.loaded)return;
  const m=await viewModule("report"); if(!m||state.view!=="report")return;
  m.renderReport({
    rows:filteredRows(), period:state.period, activeAreas:activeAreas(), settlement:SETTLEMENT[state.settlement].label,
    selectedUsages:state.selectedUsages, usageTotal:uniqueSorted(state.rows,"usage").length
  });
  if(window.lucide)lucide.createIcons();
}
/* تب تحلیل/رتبه: baseRows = داده کل استان با همان فیلترهای کاربری/شهروروستا ولی بدون فیلتر امور — مبنای «٪ از استان». */
async function rerenderAnalytics(){
  if(!state.loaded)return;
  const m=await viewModule("analytics"); if(!m||state.view!=="analytics")return;
  m.renderAnalytics({rows:filteredRows(), baseRows:chartBaseRows(), activeAreas:activeAreas()});
  if(window.lucide)lucide.createIcons();
}
function anomalySourceRows(){
  /* دادهٔ کامل؛ فیلتر نیروی مسلح و شهر/روستا را خود تب ناهنجاری (نوار اختصاصی) اعمال می‌کند */
  return state.rows||[];
}
async function rerenderFinance(){
  if(!state.loaded)return;
  const m=await viewModule("finance"); if(!m||state.view!=="finance")return;
  /* فیلتر نیروی مسلح و شهر/روستا را خود تب مالی (نوار اختصاصی) اعمال می‌کند */
  m.renderFinance({rows:state.rows||[], periodDays:window.__REPORT_DAYS||0});
  if(window.lucide)lucide.createIcons();
}
async function rerenderAnomaly(){
  if(!state.loaded)return;
  const m=await viewModule("anomaly"); if(!m||state.view!=="anomaly")return;
  const src=anomalySourceRows();
  m.renderAnomaly({rows:src, baseRows:src, activeAreas:[], periodDays:window.__REPORT_DAYS||0});
  if(window.lucide)lucide.createIcons();
}

function renderHomeView(){
  ensureMapMetric();
  const base=chartBaseRows();
  // for map coloring use all areas filtered only by usage
  renderMap(base,{
    selectedArea: state.chartArea || (state.selectedAreas.length===1?state.selectedAreas[0]:""),
    selectedAreas: state.selectedAreas,
    metric: window.__MAP_METRIC,
    mode: state.mode,
    standardClasses: thresholdClasses,
    onSelect: area=>{
      // map click: single select
      if(state.chartArea===area){
        state.chartArea="";
      }else{
        state.chartArea=area;
        state.selectedAreas=[]; // clear multi when map select
      }
      updateAreaLabel();
      fillAreaDropdown();
      syncCitySubFilter();
      rerenderHome();
    }
  });
  // cards for selected
  const cardRows=filteredRows();
  renderProvince(cardRows,{mode:state.mode,breakdown:"area"});
  if(window.lucide)lucide.createIcons();
}

function setView(view){
  state.view=view;
  $$('.ribbon-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  document.body.classList.toggle("map-view",view==="home");
  document.body.classList.toggle("analytics-view",view==="analytics");
  document.body.classList.toggle("anomaly-view",view==="anomaly");
  document.body.classList.toggle("finance-view",view==="finance");
  document.body.classList.toggle("report-view",view==="report");
  syncModeTabs();
  const vc=$("#viewContainer"); if(vc){ vc.onclick=null; vc.onchange=null; }   // رویداد تب‌های تحلیل/خروجی هنگام خروج آزاد می‌شود
  if(view!=="report") viewMods.report?.clearReportPageStyle();
  if(view==="home"||view==="analytics"||view==="anomaly"||view==="finance"||view==="report") rerenderHome();
}

/* ───────── داده: Cache اول (IndexedDB) → Manifest → فقط در صورت تغییر، دانلود + Worker ───────── */
const SOURCE_NAME=(DATASETS.main.file||"").split("/").pop();
function toast(msg,kind="ok",ms=3800){
  let t=$("#appToast");
  if(!t){ t=document.createElement("div"); t.id="appToast"; t.className="app-toast"; t.setAttribute("role","status"); t.setAttribute("aria-live","polite"); document.body.appendChild(t); }
  t.textContent=msg; t.dataset.kind=kind; t.classList.add("show");
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),ms);
}
function showLoadError(message){
  const c=$("#viewContainer"); if(!c)return;
  c.innerHTML=`<section class="card empty"><h3>بارگذاری فایل Excel انجام نشد</h3><p>${esc(message)}</p><p>فایل مورد انتظار: <b>${esc(DATASETS.main.file.replace("./",""))}</b></p><p class="hint">برای اجرای محلی از یک سرور ساده استفاده کنید (مثلاً <code>npx serve .</code> یا Live Server در VS Code).</p></section>`;
}
/* اعمال دادهٔ پردازش‌شده — معادل بخش دوم load() قبلی؛ منطق/محاسبات دست‌نخورده */
function applyRecord(rec){
  const key=(rec.hash||"")+"|"+rec.version;
  if(state.loaded && key===state.datasetKey) return false;
  const p=rec.processedData;
  state.datasetKey=key;
  setDatasetVersion(rec.hash||rec.version);
  invalidateFinanceCache();
  state.rows=p.rows; state.loaded=true; state.period=p.period;
  window.__REPORT_MONTHS=p.period.months||1;
  window.__REPORT_DAYS=p.period.days||0;
  $("#periodFrom").textContent=p.period.from||"—";
  $("#periodTo").textContent=p.period.to||"—";
  $("#yearDays").textContent=p.period.yearDay?Number(p.period.yearDay).toLocaleString("fa-IR"):"—";
  const sn=$("#sourceName"); if(sn) sn.textContent=SOURCE_NAME;
  /* انتخاب‌هایی که در دادهٔ جدید وجود ندارند حذف می‌شوند */
  const areas=new Set(p.rows.map(r=>r.area)), usages=new Set(p.rows.map(r=>r.usage)), cities=new Set(p.rows.map(r=>r.city));
  const before=state.selectedAreas.length+(state.chartArea?1:0)+state.selectedUsages.length+state.selectedCities.length;
  state.selectedAreas=state.selectedAreas.filter(a=>areas.has(a));
  if(state.chartArea&&!areas.has(state.chartArea)) state.chartArea="";
  state.selectedUsages=state.selectedUsages.filter(u=>usages.has(u));
  state.selectedCities=state.selectedCities.filter(c=>cities.has(c));
  const removed=before-(state.selectedAreas.length+(state.chartArea?1:0)+state.selectedUsages.length+state.selectedCities.length);
  if(removed>0) setTimeout(()=>toast(`${removed.toLocaleString("fa-IR")} انتخاب فیلتر که در داده جدید وجود ندارد برداشته شد.`,"warn",6000),0);   // فقط انتخاب فیلتر؛ هیچ داده‌ای حذف نمی‌شود
  fillAreaDropdown(); fillUsageDropdown(); updateAreaLabel(); updateUsageLabel(); updateArmedForcesBtn(); syncCitySubFilter();
  setView(state.view);
  return true;
}
let syncing=false;
async function syncData({user=false}={}){
  if(syncing)return;
  syncing=true; setRefreshState(true);
  try{
    const hadData=state.loaded;
    const res=await syncDataset("main",{force:user});
    const warn=res.warnings?.length?" ⚠ "+res.warnings[0]:"";
    if(res.record) applyRecord(res.record);
    switch(res.status){
      case "updated":
        if(hadData) toast("داده جدید دریافت و اعمال شد."+warn,"ok",5000); else if(warn) toast(warn.trim(),"warn",7000); break;
      case "unchanged":
        if(user) toast(res.downloaded?"داده تغییری نکرده است.":"داده به‌روز است؛ فایل دوباره دانلود نشد.","ok"); break;
      case "offline":
        if(user) toast("اتصال به سرور برقرار نشد؛ داده ذخیره‌شده نمایش داده می‌شود.","warn",5000); break;
      case "rejected":
        toast("فایل جدید پذیرفته نشد و داده قبلی حفظ شد: "+res.problems.join(" · "),"err",12000); break;
      case "error":
        if(state.loaded) toast(res.problems.join(" · "),"err",9000); else { state.loaded=false; showLoadError(res.problems.join(" · ")); } break;
    }
  }catch(e){
    console.error(e);
    if(!state.loaded) showLoadError(e.message||String(e)); else toast("به‌روزرسانی انجام نشد: "+(e.message||e),"err",8000);
  }finally{ syncing=false; setRefreshState(false); }
}
/* شروع: اگر Cache معتبر باشد بلافاصله از آن رندر می‌شود (بدون Excel/XLSX)، سپس در پس‌زمینه Manifest چک می‌شود */
async function boot(){
  const container=$("#viewContainer");
  const lucideReady=window.lucide?Promise.resolve():loadVendor("lucide","lucide").catch(()=>null);
  let cached=null;
  try{ cached=await getCachedRecord("main"); }catch(e){ console.warn("cache read failed",e); }
  if(!cached&&container) container.innerHTML=`<section class="card empty loading-state"><div class="loader"></div><h3>در حال بارگذاری داده…</h3><p>فایل <b>${esc(SOURCE_NAME)}</b></p></section>`;
  await Promise.race([lucideReady,new Promise(r=>setTimeout(r,2500))]);
  if(cached) applyRecord(cached);
  lucideReady.then(()=>window.lucide&&lucide.createIcons());
  await syncData({user:false});
}

// Mode tabs (فقط صفحه هوم؛ در تب تحلیل مخفی است)
$$('#mapModeTabs .map-mode-tab').forEach(b=>{
  b.addEventListener('click',()=>{
    state.mode=b.dataset.mode;
    syncModeTabs();
    ensureMapMetric();
    rerenderHome();
  });
});

// Dropdown toggles — با موقعیت‌دهی پویا (fixed) تا همیشه روی صفحه و کامل دیده شود، بدون افتادن پشت چیز دیگری و بدون نیاز به اسکرول جداگانه
function closeAllDropdowns(){
  $("#areaDropdown")?.classList.add("hidden");
  $("#usageDropdown")?.classList.add("hidden");
  $("#areaFilterBtn")?.setAttribute("aria-expanded","false");
  $("#usageFilterBtn")?.setAttribute("aria-expanded","false");
}
function positionDropdown(btn,dd){
  if(dd.parentElement!==document.body) document.body.appendChild(dd);   // خروج از هر ancestor که ممکن است containing-block را عوض کند
  const r=btn.getBoundingClientRect();
  const vw=innerWidth, vh=innerHeight, margin=8;
  dd.style.maxHeight=Math.min(360,vh-margin*2)+"px";
  let dw=Math.min(dd.scrollWidth||320, vw-margin*2);
  dd.style.width=dw+"px";
  let left=r.right-dw;               // لبه راست دراپ‌داون هم‌تراز لبه راست دکمه (طبیعی برای راست‌به‌چپ)
  left=Math.max(margin,Math.min(left,vw-dw-margin));
  let top=r.bottom+6;
  const h=dd.offsetHeight||Math.min(360,vh-margin*2);
  if(top+h>vh-margin) top=Math.max(margin,r.top-h-6);   // اگر پایین صفحه جا نبود، بالای دکمه باز شود
  dd.style.left=left+"px";
  dd.style.top=top+"px";
}
function toggleDropdown(btn,dd){
  const open=!dd.classList.contains("hidden");
  closeAllDropdowns();
  if(!open){
    dd.classList.remove("hidden");
    positionDropdown(btn,dd);
    btn.setAttribute("aria-expanded","true");
  }
}
window.addEventListener("resize",()=>{
  const dd=$("#areaDropdown"); if(dd&&!dd.classList.contains("hidden")) positionDropdown($("#areaFilterBtn"),dd);
  const du=$("#usageDropdown"); if(du&&!du.classList.contains("hidden")) positionDropdown($("#usageFilterBtn"),du);
});

$("#areaFilterBtn")?.addEventListener("click",e=>{
  e.stopPropagation();
  toggleDropdown(e.currentTarget,$("#areaDropdown"));
});

$("#usageFilterBtn")?.addEventListener("click",e=>{
  e.stopPropagation();
  toggleDropdown(e.currentTarget,$("#usageDropdown"));
});

document.addEventListener("click",()=>closeAllDropdowns());
$("#areaDropdown")?.addEventListener("click",e=>e.stopPropagation());
$("#usageDropdown")?.addEventListener("click",e=>e.stopPropagation());
$("#citySubInline")?.addEventListener("click",e=>e.stopPropagation());

// فیلتر چرخشی شهر/روستا: هر کلیک حالت بعدی؛ همه محاسبات (هوم، نقشه، تحلیل، خروجی) بر همان اساس
$("#settlementBtn")?.addEventListener("click",()=>{
  state.settlement=nextOf(SETTLEMENT_ORDER,state.settlement);
  updateSettlementBtn();
  rerenderHome();
});

// فیلتر کاربری: کلید چرخشی نیروهای مسلح
$("#armedForcesBtn")?.addEventListener("click",()=>{
  state.armedForces=nextOf(ARMED_ORDER,state.armedForces);
  updateArmedForcesBtn();
  rerenderHome();
});

// منوی همبرگری تنظیمات: با هر تغییر، تب‌های تحلیل/خروجی دوباره محاسبه می‌شوند
initSettingsMenu({
  button:$("#menuBtn"),
  beforeOpen:ensureAnomalySettings,
  getOptions:id=>(id==="usages.important"||id==="anomaly.disabledUsages"||id==="fin.disabledUsages") ? uniqueSorted(state.rows||[],"usage") : []
});
let settingsRaf=0;
onSettingsChange(()=>{
  cancelAnimationFrame(settingsRaf);
  settingsRaf=requestAnimationFrame(()=>{ if(state.view==="analytics"||state.view==="anomaly"||state.view==="finance"||state.view==="report") rerenderHome(); });
});

// کلید پاک‌کن روی کانواس نقشه (هوم): پاک کردن انتخاب امور
window.addEventListener("map-clear-areas",()=>{
  state.selectedAreas=[];
  state.chartArea="";
  updateAreaLabel();
  fillAreaDropdown();
  syncCitySubFilter();
  rerenderHome();
});

// Clear buttons
$("#areaClearBtn")?.addEventListener("click",()=>{
  state.selectedAreas=[];
  state.chartArea="";
  updateAreaLabel();
  fillAreaDropdown();
  syncCitySubFilter();
  rerenderHome();
});
$("#usageClearBtn")?.addEventListener("click",()=>{
  state.selectedUsages=[];
  updateUsageLabel();
  fillUsageDropdown();
  rerenderHome();
});
$("#citySubClearBtn")?.addEventListener("click",()=>{
  state.selectedCities=[];
  fillCitySubChips();
  rerenderHome();
});

$("#refreshBtn").addEventListener("click",()=>state.loaded?syncData({user:true}):boot());   // همان کلید «به‌روزرسانی» موجود

$$('.ribbon-item').forEach(b=>{
  b.addEventListener('click',()=>{
    if(b.disabled)return;
    const v=b.dataset.view;
    if(v==="home"||v==="analytics"||v==="anomaly"||v==="finance"||v==="report") setView(v);
  });
});

window.addEventListener("map-metric-change",e=>{
  if(state.view!=="home")return;
  window.__MAP_METRIC=e.detail.metric;
  rerenderHome();
});
window.addEventListener("map-mode-change",e=>{
  if(state.view!=="home")return;
  state.mode=e.detail.mode;
  $$('#mapModeTabs .map-mode-tab').forEach(x=>x.classList.toggle('active',x.dataset.mode===state.mode));
  ensureMapMetric();
  rerenderHome();
});

if(window.lucide)lucide.createIcons();
boot();
registerPWA();
