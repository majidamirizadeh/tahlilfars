import {
  sum, percent, formatNumber,
  formatConsumptionValue, consumptionUnit,
  formatMoneyValue, moneyUnit, moneyUnitFor,
  formatConsumption, formatMoney
} from "../engines/statistics.js";

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
let openMetric="";

/* ===== Stats (آمار) ===== */
const STATS=[
  ["customers","تعداد مشترک",'<i class="ico ico-users"></i>',"metric-customers","مشترک"],
  ["consumption","مصرف",'<i class="ico ico-droplet"></i>',"metric-consumption",null],
  ["income","درآمد",'<i class="ico ico-banknote"></i>',"metric-income",moneyUnit],
  ["collection","وصول",'<i class="ico ico-circle-check"></i>',"metric-collection",moneyUnit],
  ["debtEnd","بدهی",'<i class="ico ico-triangle-alert"></i>',"metric-debt",moneyUnit]
];

const moneyKeys=new Set(["income","collection","debtEnd"]);

function displayValue(key,n){
  if(key==="consumption") return formatConsumptionValue(n);
  if(moneyKeys.has(key)) return formatMoneyValue(n);
  return formatNumber(n);
}
function displayUnit(key,n){
  if(key==="consumption") return consumptionUnit(n);
  if(moneyKeys.has(key)) return moneyUnitFor(n);
  if(key==="customers") return "مشترک";
  return "";
}
/** برای جزئیات و split که هنوز رشته کامل می‌خواهند */
function display(key,n){
  if(key==="consumption") return formatConsumption(n);
  if(moneyKeys.has(key)) return formatMoney(n);
  return formatNumber(n);
}
/** فقط عدد بدون واحد (برای شهر/روستا در باکس‌های آمار) */
function displayNum(key,n){
  if(key==="consumption") return formatConsumptionValue(n);
  if(moneyKeys.has(key)) return formatMoneyValue(n);
  return formatNumber(n);
}

function group(rows,key,value){
  const map=new Map();
  rows.forEach(r=>{const k=r[key]||"نامشخص";map.set(k,(map.get(k)||0)+(Number(r[value])||0))});
  return [...map.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
}
function splitFor(rows,key){
  const total=sum(rows,key);
  const city=sum(rows.filter(r=>r.settlementType==="شهر"),key);
  const rural=sum(rows.filter(r=>r.settlementType==="روستا"),key);
  return {total,city,rural,cityPct:percent(city,total),ruralPct:percent(rural,total)};
}
function splitMarkup(rows,key){
  const s=splitFor(rows,key);
  return `<div class="info-split"><span><i class="ico ico-building"></i><b>${displayNum(key,s.city)}</b><em>${s.cityPct.toFixed(1)}٪</em></span><span><i class="ico ico-sprout"></i><b>${displayNum(key,s.rural)}</b><em>${s.ruralPct.toFixed(1)}٪</em></span><div class="split-bar" aria-hidden="true"><i class="sb-city" style="width:${s.cityPct.toFixed(1)}%"></i><i class="sb-rural" style="width:${s.ruralPct.toFixed(1)}%"></i></div></div>`;
}
function detailTitle(rows,breakdown){
  if(breakdown==="area" && new Set(rows.map(r=>r.area)).size===1) return "شهرهای این امر";
  return breakdown==="area"?"تفکیک امور":"تفکیک کاربری";
}
function detailKey(rows,breakdown){
  if(breakdown==="area" && new Set(rows.map(r=>r.area)).size===1) return "city";
  return breakdown==="area"?"area":"usage";
}
function detailRows(rows,key,valueKey){
  const groups=group(rows,valueKey,key);
  return groups.map(x=>{
    const subset=rows.filter(r=>(r[valueKey]||"نامشخص")===x.label);
    const s=splitFor(subset,key);
    return `<div class="detail-row detail-row-rich">
      <div class="detail-row-head"><span class="detail-label">${esc(x.label)}</span><b>${display(key,s.total)}</b><em>${percent(s.total,sum(rows,key)).toFixed(1)}٪</em></div>
      <div class="detail-splits"><span><i class="ico ico-building"></i><b>${displayNum(key,s.city)}</b><em>${s.cityPct.toFixed(1)}٪</em></span><span><i class="ico ico-sprout"></i><b>${displayNum(key,s.rural)}</b><em>${s.ruralPct.toFixed(1)}٪</em></span></div>
      <div class="detail-bar"><i style="width:${Math.min(100,percent(s.total,sum(rows,key)))}%"></i></div>
    </div>`;
  }).join("");
}

function card(metric,rows,breakdown){
  const [key,label,icon,cls]=metric;
  const total=sum(rows,key);
  const isOpen=openMetric===key;
  const dKey=detailKey(rows,breakdown);
  const title=detailTitle(rows,breakdown);
  const unit=displayUnit(key,total);
  return `<article class="info-box card ${cls} ${isOpen?"is-open":""}" data-metric="${key}" tabindex="0">
  <div class="info-main">
    <div class="info-name"><span class="info-icon">${icon}</span><strong>${label}</strong></div>
    <div class="info-total">
      <small>کل</small>
      <b>${displayValue(key,total)}</b>
      ${unit?`<span class="unit">${esc(unit)}</span>`:""}
    </div>
    ${splitMarkup(rows,key)}
    <span class="expand-icon">⌄</span>
  </div>
  ${isOpen?`<div class="info-detail"><div class="detail-head"><b>${title}</b><span>${group(rows,dKey,key).length.toLocaleString("fa-IR")} مورد</span></div><div class="detail-list">${detailRows(rows,key,dKey)}</div></div>`:""}
 </article>`;
}
function statsView(rows,breakdown){
  return `<section class="metric-stack">${STATS.map(m=>card(m,rows,breakdown)).join("")}</section>`;
}

/* ===== سرانه ===== */
const specsPer=[
  ["perConsumption","سرانه مصرف",'<i class="ico ico-droplet"></i>',"متر مکعب در ماه به ازای مشترک","metric-consumption",2],
  ["perIncome","سرانه درآمد",'<i class="ico ico-banknote"></i>',"ریال در ماه به ازای هر مشترک","metric-income",0],
  ["perCollection","سرانه وصول",'<i class="ico ico-circle-check"></i>',"ریال در ماه به ازای هر مشترک","metric-collection",0],
  ["perDebt","سرانه بدهی",'<i class="ico ico-triangle-alert"></i>',"ریال به ازای هر مشترک","metric-debt",0],
  ["perConsumptionDay","متوسط مصرف روزانه",'<i class="ico ico-droplet"></i>',"متر مکعب در روز","metric-consumption",2],
  ["perIncomeDay","متوسط درآمد روزانه",'<i class="ico ico-banknote"></i>',"میلیون ریال در روز","metric-income",2],
  ["perCollectionDay","متوسط وصول روزانه",'<i class="ico ico-circle-check"></i>',"میلیون ریال در روز","metric-collection",2]
];

/* ===== شاخص ===== */
const indexSpecs=[
  ["idxCollection","درصد جذب / وصول",'<i class="ico ico-percent"></i>',"درصد","metric-collection",1],
  ["idxPrice","قیمت هر متر آب فروش رفته",'<i class="ico ico-tag"></i>',"ریال بر متر مکعب","metric-income",0],
  ["idxCycle","دوره وصول مطالبات",'<i class="ico ico-timer"></i>',"روز","metric-debt",1],
  ["debtGrowth","درصد رشد بدهی",'<i class="ico ico-trending-up"></i>',"درصد","metric-debt",1],
  ["debtRisk","شاخص ریسک بدهی",'<i class="ico ico-scale"></i>',"درصد (بدهی پایان دوره ÷ درآمد)","metric-debt",1]
];

function calcDerived(rows,type){
  const c=Math.max(1,sum(rows,"customers"));
  const months=Math.max(1,window.__REPORT_MONTHS||1);
  const days=Math.max(1,window.__REPORT_DAYS||1);
  // سرانه ماهانه (به ازای هر مشترک)
  if(type==="perConsumption") return sum(rows,"consumption")/c/months;          // متر مکعب در ماه
  if(type==="perIncome") return sum(rows,"income")/c/months;                    // ریال در ماه
  if(type==="perCollection") return sum(rows,"collection")/c/months;            // ریال در ماه
  if(type==="perDebt") return sum(rows,"debtEnd")/c;                            // ریال (مانده)
  // متوسط روزانه کل (بدون تقسیم بر تعداد مشترک)
  if(type==="perConsumptionDay") return sum(rows,"consumption")/days;           // متر مکعب در روز
  if(type==="perIncomeDay") return sum(rows,"income")/days/1e6;                 // میلیون ریال در روز
  if(type==="perCollectionDay") return sum(rows,"collection")/days/1e6;         // میلیون ریال در روز
  // شاخص‌ها
  if(type==="idxCollection"){const s=sum(rows,"income");return s?100*sum(rows,"collection")/s:0}
  if(type==="idxPrice"){const csum=sum(rows,"consumption");return csum?sum(rows,"income")/csum:0}
  if(type==="debtGrowth"){const d0=sum(rows,"debtStart");return d0?100*(sum(rows,"debtEnd")-d0)/d0:0}
  if(type==="debtRisk"){const s=sum(rows,"income");return s?100*sum(rows,"debtEnd")/s:0}
  const s=sum(rows,"income");
  return s?((sum(rows,"debtStart")+sum(rows,"debtEnd"))/2/s)*days:0;
}

function formatDerived(v,decimals=0){
  return Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:decimals,minimumFractionDigits:0});
}

function detailDerivedRows(rows,dKey,type,decimals){
  const groups=group(rows,dKey,"customers");
  return groups.map(g=>{
    const subset=rows.filter(r=>(r[dKey]||"نامشخص")===g.label);
    const v=calcDerived(subset,type);
    const city=calcDerived(subset.filter(r=>r.settlementType==="شهر"),type);
    const rural=calcDerived(subset.filter(r=>r.settlementType==="روستا"),type);
    const customerTotal=sum(subset,"customers");
    const cityCustomers=sum(subset.filter(r=>r.settlementType==="شهر"),"customers");
    const ruralCustomers=sum(subset.filter(r=>r.settlementType==="روستا"),"customers");
    return `<div class="detail-row detail-row-rich">
      <div class="detail-row-head"><span class="detail-label">${esc(g.label)}</span><b>${formatDerived(v,decimals)}</b><em>${percent(g.value,sum(rows,"customers")).toFixed(1)}٪</em></div>
      <div class="detail-splits"><span><i class="ico ico-building"></i><b>${formatDerived(city,decimals)}</b><em>${percent(cityCustomers,customerTotal).toFixed(1)}٪</em></span><span><i class="ico ico-sprout"></i><b>${formatDerived(rural,decimals)}</b><em>${percent(ruralCustomers,customerTotal).toFixed(1)}٪</em></span></div>
      <div class="detail-bar"><i style="width:${Math.min(100,percent(g.value,sum(rows,"customers")))}%"></i></div>
    </div>`;
  }).join("");
}

function expandableDerived(spec,rows,breakdown){
  const [id,label,icon,unit,cls,decimals]=spec;
  const isOpen=openMetric===id;
  const totalValue=calcDerived(rows,id);
  const dKey=detailKey(rows,breakdown);
  const title=detailTitle(rows,breakdown);
  const city=calcDerived(rows.filter(r=>r.settlementType==="شهر"),id);
  const rural=calcDerived(rows.filter(r=>r.settlementType==="روستا"),id);
  const cc=sum(rows.filter(r=>r.settlementType==="شهر"),"customers");
  const rc=sum(rows.filter(r=>r.settlementType==="روستا"),"customers");
  const ct=sum(rows,"customers");
  return `<article class="info-box card ${cls} ${isOpen?"is-open":""}" data-metric="${id}" tabindex="0">
    <div class="info-main">
      <div class="info-name"><span class="info-icon">${icon}</span><strong>${label}</strong></div>
      <div class="info-total">
        <small>کل</small>
        <b>${formatDerived(totalValue,decimals)}</b>
        <span class="unit">${esc(unit)}</span>
      </div>
      <div class="info-split">
        <span><i class="ico ico-building"></i><b>${formatDerived(city,decimals)}</b><em>${percent(cc,ct).toFixed(1)}٪</em></span>
        <span><i class="ico ico-sprout"></i><b>${formatDerived(rural,decimals)}</b><em>${percent(rc,ct).toFixed(1)}٪</em></span>
        <div class="split-bar" aria-hidden="true"><i class="sb-city" style="width:${percent(cc,ct).toFixed(1)}%"></i><i class="sb-rural" style="width:${percent(rc,ct).toFixed(1)}%"></i></div>
      </div>
      <span class="expand-icon">⌄</span>
    </div>
    ${isOpen?`<div class="info-detail">
      <div class="detail-head"><b>${title}</b><span>${group(rows,dKey,"customers").length.toLocaleString("fa-IR")} مورد</span></div>
      <div class="detail-list">${detailDerivedRows(rows,dKey,id,decimals)}</div>
    </div>`:""}
  </article>`;
}

function percapView(rows,breakdown){
  return `<section class="metric-stack">${specsPer.map(s=>expandableDerived(s,rows,breakdown)).join("")}</section>`;
}
function indicesView(rows,breakdown){
  return `<section class="metric-stack">${indexSpecs.map(s=>expandableDerived(s,rows,breakdown)).join("")}</section>`;
}

export function render(rows,{mode="stats",breakdown="area"}={}){
  const html=mode==="stats"?statsView(rows,breakdown):mode==="percapita"?percapView(rows,breakdown):indicesView(rows,breakdown);
  document.getElementById("viewContainer").innerHTML=html;
  document.querySelectorAll(".info-box[data-metric]").forEach(el=>{
    const activate=()=>{
      openMetric=openMetric===el.dataset.metric?"":el.dataset.metric;
      window.__MAP_METRIC=el.dataset.metric;
      window.dispatchEvent(new CustomEvent("map-metric-change",{detail:{metric:el.dataset.metric}}));
      render(rows,{mode,breakdown});
    };
    el.addEventListener("click",activate);
    el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate()}});
  });
  if(window.lucide) lucide.createIcons();
}
