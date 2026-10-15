import {MAP_CONTOURS} from "../mapContours.js";
import {META,calc} from "../engines/metrics.js";
export {META,calc};   /* سازگاری: مصرف‌کنندگان قبلی همچنان از map.js import می‌کنند */

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

// ترتیب نواحی بر اساس موقعیت واقعی کانتورهای نقشه شهرستان‌های استان فارس.
// نام‌ها با تقسیمات ۳۷ شهرستانی فارس تطبیق داده شده‌اند؛ شیراز در داده‌های این داشبورد
// ردیف مستقل قابل انتخاب ندارد و به‌صورت ناحیه غیرفعال نمایش داده می‌شود.
const REGIONS=[
  ["امور آباده"],["امور اقلید"],["امور خرمبید"],["امور بوانات"],["امور رستم"],["امور سپیدان"],
  ["امور پاسارگاد"],["امور مرودشت"],["امور سرچهان"],["امور بیضا"],["امور ممسنی"],["امور ارسنجان"],
  ["امور کوه چنار"],["امور زرقان"],["امور بختگان"],["شیراز"],["امور خرامه"],["امور کازرون"],
  ["امور سروستان"],["امور کوار"],["امور نی ریز"],["امور استهبان"],["امور فسا"],["امور خفر"],
  ["امور فیروزآباد"],["امور فراشبند"],["امور جهرم"],["امور داراب"],["امور قیر و کارزین"],["امور زرین دشت"],
  ["امور جویم"],["امور خنج"],["امور اوز"],["امور لارستان"],["امور مهر"],["امور گراش"],["امور لامرد"]
];

function areaData(rows,type){
  const m=new Map();
  rows.forEach(r=>{if(!r.area)return;(m.get(r.area)||m.set(r.area,[]).get(r.area)).push(r)});
  return [...m.entries()].map(([area,rs])=>({area,value:calc(rs,type)}));
}
/* رنگ هر موضوع مطابق باکس‌های صفحه هوم (تب آمار): مشترک=آبی‌خاکستری · مصرف=آبی روشن · درآمد=کهربایی · وصول=سبز · بدهی=قرمز.
   شاخص‌های «بیشتر = بدتر» (بدهی، سرانه بدهی، دوره وصول) در طیف قرمز هستند و هرچه پررنگ‌تر، نامطلوب‌تر. */
const FAMILY={
  customers:"slate",
  consumption:"sky", perConsumption:"sky", perConsumptionDay:"sky",
  income:"amber", perIncome:"amber", perIncomeDay:"amber", idxPrice:"amber",
  collection:"green", perCollection:"green", perCollectionDay:"green", idxCollection:"green",
  debtEnd:"red", perDebt:"red", idxCycle:"red", debtGrowth:"red", debtRisk:"red"
};
const HUES={slate:{h:222,s:44},sky:{h:200,s:80},amber:{h:42,s:90},green:{h:152,s:58},red:{h:352,s:74}};
const RAMP_L=[95,81,67,53], RAMP_A=[.80,.87,.92,.96];   // روشن ← پررنگ؛ شیشه‌ای با کمی شفافیت
function rampStops(fam,i){
  const {h,s}=HUES[fam]||HUES.sky, L=RAMP_L[i], A=RAMP_A[i];
  return [`hsla(${h},${s}%,${Math.min(98,L+8)}%,${A})`,`hsla(${h},${s}%,${L-3}%,${Math.max(.6,A-.06)})`];
}
const rampCss=(fam,i)=>{const [a,b]=rampStops(fam,i);return `linear-gradient(135deg,${a},${b})`};

/* طبقه‌بندی ۴ قسمتی: شاخص‌های دارای آستانه استاندارد → همان آستانه‌ها؛ بقیه → چارک‌های داده */
function quantile(sorted,q){
  if(!sorted.length)return 0; const pos=(sorted.length-1)*q, lo=Math.floor(pos), hi=Math.ceil(pos);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);
}
function classify(vals,std){
  if(std) return {edges:std.edges,labels:std.labels,standard:true,inclusiveUp:std.direction==="higher"};
  const s=[...vals].sort((a,b)=>a-b);
  return {edges:[quantile(s,.25),quantile(s,.5),quantile(s,.75)],labels:["کمترین","پایین","بالا","بیشترین"],standard:false,inclusiveUp:false};
}
const classIndex=(v,cls)=>cls.edges.reduce((n,e)=>n+((cls.inclusiveUp?v>=e:v>e)?1:0),0);
function contourPath(points){return `M ${points.map(p=>`${p[0]} ${p[1]}`).join(" L ")} Z`}

export function renderMap(rows,{selectedArea="",selectedAreas=[],metric="customers",mode="stats",onSelect=()=>{},standardClasses=()=>null}={}){
  const meta=META[metric]||META.customers;
  const data=areaData(rows,metric), map=new Map(data.map(x=>[x.area,x]));
  const vals=data.map(x=>x.value).filter(Number.isFinite); const max=vals.length?Math.max(...vals):0;
  const fam=FAMILY[metric]||"sky";
  const cls=classify(vals,standardClasses(metric));

  // value for the summary above map
  let summaryValue="—", summaryUnit="", summaryTitle="کل امور";
  const activeAreas = selectedAreas.length ? selectedAreas : (selectedArea ? [selectedArea] : []);
  function unitOf(v){
    return (meta.unitFor ? meta.unitFor(v) : meta.unit) || "";
  }
  if(activeAreas.length===0){
    const totalVal=calc(rows,metric);
    summaryValue=meta.format(totalVal);
    summaryUnit=unitOf(totalVal);
    summaryTitle="کل امور";
  }else if(activeAreas.length===1){
    const rec=map.get(activeAreas[0]);
    summaryValue=rec?meta.format(rec.value):"—";
    summaryUnit=rec?unitOf(rec.value):"";
    summaryTitle=activeAreas[0];
  }else{
    const subset=rows.filter(r=>activeAreas.includes(r.area));
    const totalVal=calc(subset,metric);
    summaryValue=meta.format(totalVal);
    summaryUnit=unitOf(totalVal);
    summaryTitle=activeAreas.length.toLocaleString("fa-IR")+" امر انتخاب‌شده";
  }

  const groups={
    stats:[
      ["customers","تعداد مشترک"],["consumption","مصرف"],["income","درآمد"],["collection","وصول"],["debtEnd","بدهی"]
    ],
    percapita:[
      ["perConsumption","سرانه مصرف"],["perIncome","سرانه درآمد"],["perCollection","سرانه وصول"],["perDebt","سرانه بدهی"],
      ["perConsumptionDay","مصرف روزانه"],["perIncomeDay","درآمد روزانه"],["perCollectionDay","وصول روزانه"]
    ],
    indices:[
      ["idxCollection","درصد وصول"],["idxPrice","قیمت آب فروش رفته"],["idxCycle","دوره وصول مطالبات"],["debtGrowth","درصد رشد بدهی"],["debtRisk","شاخص ریسک بدهی"]
    ]
  };
  const subTabs=(groups[mode]||groups.stats).map(([k,v])=>`<button class="map-sub-tab ${metric===k?"active":""}" data-map-metric="${k}">${v}</button>`).join("");

  const counts=[0,0,0,0]; data.forEach(x=>{ if(Number.isFinite(x.value)) counts[classIndex(x.value,cls)]++; });
  const bigUnit=meta.unitFor && max>=1e6;
  const isMoney=["income","collection","debtEnd"].includes(metric);
  const fmtEdge=v=>isMoney?(u==="ریال"?Math.round(v).toLocaleString("fa-IR"):Math.round(v/1e6).toLocaleString("fa-IR")):bigUnit?(v/1e6).toLocaleString("fa-IR",{maximumFractionDigits:2}):(Math.abs(v)>=100&&metric!=="perConsumption"?Math.round(v).toLocaleString("fa-IR"):meta.format(v));
  const u=meta.unitFor?meta.unitFor(max):meta.unit, uSuffix=u==="٪"?"٪":"";
  const rangeText=i=>{
    if(!cls.standard) return `تا ${i<3?fmtEdge(cls.edges[i]):fmtEdge(max)}${uSuffix}`;   /* چارک: فقط حد بالای هر کلاس */
    const e=cls.edges.map(fmtEdge), up=cls.inclusiveUp;
    const t=i===0?(up?`< ${e[0]}`:`≤ ${e[0]}`):i===3?(up?`≥ ${e[2]}`:`> ${e[2]}`):`${e[i-1]} – ${e[i]}`;
    return t+uSuffix;
  };
  document.getElementById("mapContainer").innerHTML=`<section class="map-dashboard card">
    <div class="map-summary-line">
      <span class="map-summary-title">${esc(summaryTitle)}</span>
      <span class="map-summary-value">${esc(summaryValue)}</span>
      <span class="map-summary-unit">${esc(summaryUnit)}</span>
      <span class="map-summary-metric">${esc(meta.label)}</span>
    </div>
    <div class="map-sub-tabs">${subTabs}</div>
    <div class="map-layout">
      <div class="fars-map-wrap">
        <img src="./assets/fars-map-base.png" alt="نقشه امور استان فارس">
        <svg class="fars-map-svg" viewBox="0 0 1536 1397" preserveAspectRatio="xMidYMid meet"></svg>
        <button type="button" class="map-clear-btn ${activeAreas.length?"active":""}" id="mapClearBtn" title="پاک کردن انتخاب امور" aria-label="پاک کردن انتخاب امور" ${activeAreas.length?"":"disabled"}><i data-lucide="eraser"></i></button>
        <div class="map-tooltip" hidden></div>
      </div>
    </div>
    <div class="map-legend fam-${fam}">
      <div class="legend-head"><span class="legend-title">${cls.standard?"طبقه‌بندی استاندارد":"طبقه‌بندی ۴ قسمتی (چارک)"}: <b>${meta.label}</b>${u&&u!=="٪"?` <em class="legend-unit">(${u})</em>`:""}</span>
</div>
      <div class="legend-classes">${cls.labels.map((lb,i)=>`<div class="lg-class"><i style="background:${rampCss(fam,i)}"></i><b>${lb}</b><small class="lg-range" dir="ltr">${esc(rangeText(i))}</small></div>`).join("")}</div>
    </div>
  </section>`;

  const svg=document.querySelector(".fars-map-svg"), tooltip=document.querySelector(".map-tooltip");
  // گرادیان شیشه‌ای هر کلاس (روشن ← پررنگ) در همان طیف موضوع
  const defs=document.createElementNS("http://www.w3.org/2000/svg","defs");
  defs.innerHTML=[0,1,2,3].map(i=>{const [a,b]=rampStops(fam,i);return `<linearGradient id="mapG${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`}).join("");
  svg.appendChild(defs);
  const labelCenters=[];
  const isSelected=(area)=> activeAreas.includes(area) || (selectedArea && area===selectedArea);

  MAP_CONTOURS.forEach((points,i)=>{
    const area=REGIONS[i]?.[0]||"";
    const p=document.createElementNS("http://www.w3.org/2000/svg","path");
    p.setAttribute("d",contourPath(points));
    const rec=map.get(area);
    const cx=points.reduce((a,q)=>a+q[0],0)/points.length, cy=points.reduce((a,q)=>a+q[1],0)/points.length;
    if(area==="شیراز" || !rec){
      p.setAttribute("fill","rgba(236,240,245,.55)");
      p.classList.add("map-disabled-region");
    }else{
      p.setAttribute("fill",`url(#mapG${classIndex(rec.value,cls)})`);
      p.classList.add("map-region");
      if(activeAreas.length>0 && !isSelected(area)) p.classList.add("map-muted-region");
      if(isSelected(area)) p.classList.add("map-selected-region");
      p.addEventListener("click",()=>onSelect(area));
      p.addEventListener("mousemove",e=>{
        tooltip.hidden=false;
        tooltip.innerHTML=`<b>${esc(area)}</b><span>${meta.label}: ${esc(meta.format(rec.value))} ${unitOf(rec.value)}</span>`;
        tooltip.style.left=`${e.offsetX+12}px`;
        tooltip.style.top=`${e.offsetY+12}px`;
      });
      p.addEventListener("mouseleave",()=>tooltip.hidden=true);
    }
    svg.appendChild(p);
    if(area!=="شیراز" && rec) labelCenters.push({area,cx,cy});
  });

  labelCenters.forEach(({area,cx,cy})=>{
    const t=document.createElementNS("http://www.w3.org/2000/svg","text");
    const label=area.replace(/^امور\s*/,"");
    t.setAttribute("x",cx); t.setAttribute("y",cy); t.setAttribute("text-anchor","middle"); t.setAttribute("dominant-baseline","middle");
    t.setAttribute("class","map-label"); t.textContent=label;
    svg.appendChild(t);
  });

  document.getElementById("mapClearBtn")?.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("map-clear-areas")));
  document.querySelectorAll(".map-sub-tab").forEach(b=>b.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("map-metric-change",{detail:{metric:b.dataset.mapMetric}}))));
}
