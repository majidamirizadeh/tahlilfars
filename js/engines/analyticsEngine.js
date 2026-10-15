/* موتور تحلیل توصیفی و هشدارها — بدون وابستگی به DOM.
   همه آستانه‌ها، وزن‌ها و کلیدهای هشدار از رجیستری تنظیمات (settings.js) خوانده می‌شوند و از «منوی تنظیمات» قابل تغییرند.

   ── راهنمای توسعه ─────────────────────────────────────────────
   • شاخص جدید با آستانه وضعیت (خوب/هشدار/بحرانی):   registerThreshold({...})   ← پایین همین فایل نمونه‌اش هست
   • مؤلفه جدید نمره امور:                            registerScoreComponent({...})
   • هشدار جدید (ساختاری یا عمومی):                   registerAlertRule({...})
   • تنظیم دلخواه دیگر:                               registerSetting(...) از settings.js
   هر کدام خودکار در منوی تنظیمات ظاهر می‌شوند؛ نیازی به دست‌کاری رابط نیست. */
import {META, calc} from "./metrics.js";
import {sum} from "./statistics.js";
import {calculateDebtGrowth} from "./financeEngine.js";
import {registerGroup, registerSetting, get as S} from "../settings/settings.js";

registerGroup({id:"thresholds", label:"آستانه‌های استاندارد (وضعیت خوب / هشدار / بحرانی)", order:1});
registerGroup({id:"score",      label:"نمره امور (امتیاز سلامت)", order:2});
registerGroup({id:"relative",   label:"مقایسه نسبی واحدها", order:3});
registerGroup({id:"rules",      label:"هشدارها (روشن/خاموش و پارامترها)", order:4});
registerGroup({id:"usages",     label:"کاربری‌های مهم", order:5});
registerGroup({id:"display",    label:"نمایش", order:6});

/* ───────── ابزارهای عمومی ───────── */
export const SEV = {red:0, orange:1, yellow:2, green:3, none:4};
export const SEV_LABEL = {red:"بحرانی", orange:"هشدار", yellow:"نکته", green:"عالی", none:"عادی"};
export const UNIT_NOUN = {province:"امور", area:"شهر", city:"کاربری"};
export const fa = (n,d=0) => Number(n||0).toLocaleString("fa-IR",{maximumFractionDigits:d});
const short = a => String(a||"").replace(/^امور\s*/,"");
const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const pct = (a,b) => b ? 100*a/b : 0;
const mln = v => fa((v||0)/1e6);

export const interp = (pts,x) => {
  if(x<=pts[0][0]) return pts[0][1];
  for(let i=1;i<pts.length;i++) if(x<=pts[i][0]){
    const [x0,y0]=pts[i-1], [x1,y1]=pts[i];
    return x1===x0 ? y1 : y0+(y1-y0)*(x-x0)/(x1-x0);
  }
  return pts[pts.length-1][1];
};

export function levelOf(activeAreas, city){ return city ? "city" : (activeAreas.length ? "area" : "province"); }
export function fmtMetric(metric, v){
  const m = META[metric] || META.customers;
  const unit = (m.unitFor ? m.unitFor(v) : m.unit) || "";
  return {num:m.format(v), unit};
}

/* ───────── ۱) آستانه‌های استاندارد ─────────
   direction "higher": مقدار بالاتر بهتر (درصد وصول) — سطوح از بهترین به بدترین با «حداقل مقدار»
   direction "lower":  مقدار پایین‌تر بهتر (دوره وصول) — سطوح با «حداکثر مقدار»
   شناسه سطح‌ها باید از good / ok / warn باشد (برای نگاشت به نمره)؛ بعد از آخرین سطح، «بحرانی» است. */
const THRESHOLD_DEFS = [];
export function registerThreshold(def){
  THRESHOLD_DEFS.push(def);
  def.levels.forEach(l=>registerSetting({
    id:`th.${def.metric}.${l.id}`, group:"thresholds", section:def.label,
    sectionNote:"مقدارها به‌صورت خودکار مرتب می‌شوند؛ پایین‌تر از آخرین آستانه = بحرانی.",
    label:l.settingLabel, unit:def.unit, default:l.default, min:def.min??0, max:def.max??1000, step:def.step??1
  }));
}
const defOf = metric => THRESHOLD_DEFS.find(d=>d.metric===metric);
export const hasThreshold = metric => !!defOf(metric);
export const thresholdMetrics = () => THRESHOLD_DEFS.map(d=>d.metric);

function levelVals(d){
  const vals = d.levels.map(l=>S(`th.${d.metric}.${l.id}`)).sort((a,b)=>d.direction==="higher" ? b-a : a-b);
  return d.levels.map((l,i)=>({...l, value:vals[i]}));
}
function levelsOf(metric){
  const d = defOf(metric); if(!d) return null;
  const u = d.unit==="٪" ? "٪" : " "+d.unit, f = v => fa(v,1);
  const L = levelVals(d), hi = d.direction==="higher";
  L.forEach((l,i)=>{
    const prev = i>0 ? L[i-1].value : null;
    l.cond = hi ? (i===0 ? `بالاتر از ${f(l.value)}${u}` : `بین ${f(l.value)} تا ${f(prev)}${u}`)
                : (i===0 ? `حداکثر ${f(l.value)}${u}` : `بین ${f(prev)} تا ${f(l.value)}${u}`);
    l.range = hi ? (i===0 ? `≥ ${f(l.value)}${u}` : `${f(l.value)}–${f(prev)}${u}`)
                 : (i===0 ? `≤ ${f(l.value)}${u}` : `${f(prev)}–${f(l.value)}${u}`);
  });
  const last = L[L.length-1];
  L.push({id:"critical", statusLabel:d.criticalLabel||"بحرانی", sev:"red", value:hi?-Infinity:Infinity,
    cond: hi ? `کمتر از ${f(last.value)}${u}` : `بیش از ${f(last.value)}${u}`, range: hi ? `< ${f(last.value)}${u}` : `> ${f(last.value)}${u}`});
  return L;
}
export function absStatus(metric, v){
  const d = defOf(metric); if(!d || !Number.isFinite(v)) return null;
  const L = levelsOf(metric), hi = d.direction==="higher";
  const hit = L.find(l=>l.id==="critical" ? true : (hi ? v>=l.value : v<=l.value));
  return {sev:hit.sev, label:hit.statusLabel, cond:hit.cond, id:hit.id};
}
/** ۴ کلاس استاندارد یک شاخص دارای آستانه (برای راهنمای نقشه): لبه‌های صعودی + نام کلاس‌ها از کمترین مقدار به بیشترین.
    اگر آستانه‌ها ۴ کلاس نسازند، سمت «بحرانی» یک کلاس «بحرانی شدید» با همان فاصله آخر اضافه می‌شود. */
export function thresholdClasses(metric){
  const d = defOf(metric); if(!d) return null;
  const L = levelVals(d), hi = d.direction==="higher";
  const edges = L.map(l=>l.value).sort((a,b)=>a-b);
  const labels = hi ? ["بحرانی", ...[...L].reverse().map(l=>l.statusLabel)] : [...L.map(l=>l.statusLabel), "بحرانی"];
  while(labels.length<4){
    if(hi){ const gap = edges.length>1 ? edges[1]-edges[0] : 10; edges.unshift(edges[0]-gap); labels.splice(1,0,"بحرانی"); labels[0]="بحرانی شدید"; }
    else { const gap = edges.length>1 ? edges[edges.length-1]-edges[edges.length-2] : 30; edges.push(edges[edges.length-1]+gap); labels[labels.length-1]="بحرانی"; labels.push("بحرانی شدید"); }
  }
  return {edges:edges.slice(0,3), labels:labels.slice(0,4), direction:d.direction, unit:d.unit};
}
/** متن راهنمای آستانه‌ها، مثلاً «عالی ≥ ۹۵٪ · قابل‌قبول ۸۵–۹۵٪ · …» */
export function thresholdSummary(metric){
  const L = levelsOf(metric); return L ? L.map(l=>`${l.statusLabel} ${l.range}`).join(" · ") : "";
}

registerThreshold({metric:"idxCollection", label:"درصد وصول", direction:"higher", unit:"٪", max:200,
  levels:[
    {id:"good", statusLabel:"عالی",      sev:"green",  settingLabel:"عالی از (حداقل)",       default:95},
    {id:"ok",   statusLabel:"قابل‌قبول",  sev:"none",   settingLabel:"قابل‌قبول از (حداقل)",   default:85},
    {id:"warn", statusLabel:"هشدار",     sev:"orange", settingLabel:"هشدار از (حداقل)",      default:70}
  ]});
registerThreshold({metric:"idxCycle", label:"دوره وصول مطالبات", direction:"lower", unit:"روز", max:720,
  levels:[
    {id:"good", statusLabel:"خوب",   sev:"green",  settingLabel:"خوب تا (حداکثر)",   default:60},
    {id:"warn", statusLabel:"هشدار", sev:"orange", settingLabel:"هشدار تا (حداکثر)", default:90}
  ]});
registerThreshold({metric:"debtGrowth", label:"درصد رشد بدهی", direction:"lower", unit:"٪", min:-500, max:500,
  levels:[
    {id:"good", statusLabel:"خوب",   sev:"green",  settingLabel:"خوب تا (حداکثر رشد)",   default:0},
    {id:"warn", statusLabel:"هشدار", sev:"orange", settingLabel:"هشدار تا (حداکثر رشد)", default:30}
  ]});
/* ریسک بدهی = بدهی پایان دوره ÷ درآمد دوره × ۱۰۰: خوب تا ۵۰٪ · هشدار تا ۷۰٪ · بالاتر از آن بحرانی */
registerThreshold({metric:"debtRisk", label:"شاخص ریسک بدهی", direction:"lower", unit:"٪", min:0, max:1000,
  levels:[
    {id:"good", statusLabel:"خوب",   sev:"green",  settingLabel:"خوب تا (حداکثر)",   default:50},
    {id:"warn", statusLabel:"هشدار", sev:"orange", settingLabel:"هشدار تا (حداکثر)", default:70}
  ]});

/* ───────── ۲) نمره امور ───────── */
const SCORE_COMPONENTS = [];
export function registerScoreComponent({metric,label,weight,span,spanLabel,spanUnit}){
  SCORE_COMPONENTS.push({metric,label});
  registerSetting({id:`score.w.${metric}`, group:"score", section:"وزن مؤلفه‌ها", label:`وزن ${label}`, unit:"", default:weight, min:0, max:100});
  registerSetting({id:`score.span.${metric}`, group:"score", section:"نگاشت به نمره", label:spanLabel, unit:spanUnit, default:span, min:1, max:1000});
}
registerSetting({id:"score.cut.good", group:"score", section:"حدود وضعیت نمره", label:"خوب از (حداقل نمره)", unit:"", default:80, min:0, max:100});
registerSetting({id:"score.cut.ok",   group:"score", section:"حدود وضعیت نمره", label:"قابل‌قبول از (حداقل نمره)", unit:"", default:60, min:0, max:100});
registerSetting({id:"score.cut.warn", group:"score", section:"حدود وضعیت نمره", label:"هشدار از (حداقل نمره)", unit:"", default:40, min:0, max:100,
  sectionNote:"آستانه‌های استاندارد هر شاخص روی همین حدود نگاشت می‌شوند (مثلاً درصد وصول ۹۵٪ ← نمره «خوب از»)."});
registerScoreComponent({metric:"idxCollection", label:"درصد وصول", weight:50, span:10, spanUnit:"٪", spanLabel:"فاصله بالاتر از آستانه «عالی» تا نمره ۱۰۰"});
registerScoreComponent({metric:"idxCycle", label:"دوره وصول مطالبات", weight:30, span:60, spanUnit:"روز", spanLabel:"فاصله بعد از آستانه «هشدار» تا نمره ۰"});
registerScoreComponent({metric:"debtRisk", label:"ریسک بدهی", weight:15, span:50, spanUnit:"٪", spanLabel:"فاصله بعد از آستانه «هشدار» ریسک بدهی تا نمره ۰"});
registerScoreComponent({metric:"debtGrowth", label:"رشد بدهی", weight:5, span:70, spanUnit:"٪", spanLabel:"فاصله بعد از آستانه «هشدار» رشد بدهی تا نمره ۰"});

const cuts = () => {
  const c = [S("score.cut.good"),S("score.cut.ok"),S("score.cut.warn")].sort((a,b)=>b-a);
  return {good:c[0], ok:c[1], warn:c[2]};
};
/* نمودار خطی «مقدار شاخص ← امتیاز» بر پایه آستانه‌ها؛ q(id) مقدار هر سطح، top/bottom مقدار انتهایی */
function curve(metric, q, top, bottom){
  const d = defOf(metric), L = levelVals(d), span = S(`score.span.${metric}`);
  if(d.direction==="higher"){
    const pts = [[0,bottom]]; [...L].reverse().forEach(l=>pts.push([l.value,q(l.id)])); pts.push([L[0].value+span,top]); return pts;
  }
  const pts = [[Math.min(0,L[0].value),top]]; L.forEach(l=>pts.push([l.value,q(l.id)])); pts.push([L[L.length-1].value+span,bottom]); return pts;
}
/* مقدار هر مؤلفهٔ نمره. رشد بدهی وقتی نرخ معنادار ندارد (بدهی ابتدای دوره صفر/ناچیز) محاسبه‌پذیر نیست و آن مؤلفه از نمره کنار می‌رود (وزن‌ها دوباره نرمال می‌شوند) */
function scoreValue(rows, metric){
  if(metric==="debtGrowth"){
    const us = new Set(rows.map(r=>r.usage));
    const g = calculateDebtGrowth(sum(rows,"debtStart"), sum(rows,"debtEnd"), us.size===1 ? [...us][0] : "");
    return Number.isFinite(g.growthRate) ? g.growthRate : NaN;
  }
  return calc(rows,metric);
}
export function healthScore(rows){
  if(!sum(rows,"income")) return null;
  const c = cuts();
  const parts = SCORE_COMPONENTS.map(comp=>{
    const value = scoreValue(rows,comp.metric), weight = S(`score.w.${comp.metric}`);
    if(!Number.isFinite(value)) return null;
    return {metric:comp.metric, label:comp.label, value, weight, status:absStatus(comp.metric,value),
            score: interp(curve(comp.metric, id=>c[id], 100, 0), value)};
  }).filter(Boolean);
  const W = parts.reduce((a,p)=>a+p.weight,0);
  if(!W) return null;
  const score = parts.reduce((a,p)=>a+p.weight*p.score,0)/W;
  const level = score>=c.good ? {sev:"green",label:"خوب"} : score>=c.ok ? {sev:"none",label:"قابل‌قبول"} : score>=c.warn ? {sev:"orange",label:"هشدار"} : {sev:"red",label:"بحرانی"};
  return {score, parts, ...level};
}
export function scoreFormulaText(){
  const c = cuts();
  const W = SCORE_COMPONENTS.reduce((a,x)=>a+S(`score.w.${x.metric}`),0) || 1;
  const comps = SCORE_COMPONENTS.map(x=>`${fa(100*S(`score.w.${x.metric}`)/W,0)}٪ ${x.label}`).join(" + ");
  return `نمره امور = ${comps} (از ۱۰۰؛ ≥ ${fa(c.good)} خوب · ${fa(c.ok)}–${fa(c.good)} قابل‌قبول · ${fa(c.warn)}–${fa(c.ok)} هشدار · < ${fa(c.warn)} بحرانی)`;
}
/* طیف رنگ: مقدار ← عدد ۰ (بدترین) تا ۱ (بهترین) */
const T_OF = {good:.8, ok:.55, warn:.3};
export const hasSpectrum = m => m==="score" || hasThreshold(m);
export function spectrumT(metric, v){
  if(metric==="score"){ const c=cuts(); return interp([[0,0],[c.warn,.3],[c.ok,.55],[c.good,.8],[100,1]],v); }
  return interp(curve(metric, id=>T_OF[id], 1, 0), v);
}

/* ───────── ۳) تنظیمات مقایسه نسبی و کاربری‌های مهم ───────── */
registerSetting({id:"rel.crit", group:"relative", section:"شاخص‌های نسبتی بدون آستانه استاندارد (سرانه‌ها، قیمت آب فروش رفته)", label:"انحراف نامطلوب از میانگین → بحرانی", unit:"٪", default:25, min:1, max:500});
registerSetting({id:"rel.warn", group:"relative", section:"شاخص‌های نسبتی بدون آستانه استاندارد (سرانه‌ها، قیمت آب فروش رفته)", label:"انحراف نامطلوب از میانگین → هشدار", unit:"٪", default:12, min:1, max:500});
registerSetting({id:"rel.good", group:"relative", section:"شاخص‌های نسبتی بدون آستانه استاندارد (سرانه‌ها، قیمت آب فروش رفته)", label:"انحراف مطلوب از میانگین → عالی", unit:"٪", default:10, min:1, max:500});
registerSetting({id:"rel.minShare", group:"relative", section:"واحدهای کوچک", label:"حداقل سهم مشترک واحد برای ورود به هشدارها و برترین/ضعیف‌ترین", unit:"٪", default:0.5, min:0, max:50, step:0.1});

export const IMPORTANT_DEFAULT = ["مسکونی","تجاری و مراکز خدمات غیر دولتی","صنعتی","اقامتگاه غیردایمی"];
registerSetting({id:"usages.important", group:"usages", section:"کاربری‌هایی که در جدول «کاربری‌های مهم» و هشدارهای آن بررسی می‌شوند (بقیه = سایر)", label:"کاربری‌های مهم", type:"list", default:IMPORTANT_DEFAULT});
const importantList = () => S("usages.important");

/* شاخص‌های حجمی: مقایسه با «میانگین واحدها» است و قضاوت خوب/بد ندارد */
const SIZE = new Set(["customers","consumption","income","collection","debtEnd","perConsumptionDay","perIncomeDay","perCollectionDay"]);
export const isSizeMetric = m => SIZE.has(m);

/* ───────── ۴) رجیستری قوانین هشدار ─────────
   rule = { id, scope:"struct"|"general", label, description, params:[{id,label,unit,default,min,max,step}], run(ctx) → [ {sev,text,area?} ] }
   ctx.p(paramId) مقدار پارامتر را برمی‌گرداند. scope "struct": روی واحدهای شاخص انتخابی؛ scope "general": مستقل از شاخص. */
const RULES = [];
export function registerAlertRule(rule){
  registerSetting({id:`rule.${rule.id}.enabled`, group:"rules", section:rule.label, sectionNote:rule.description, label:"فعال", type:"bool", default:true});
  (rule.params||[]).forEach(p=>registerSetting({...p, id:`rule.${rule.id}.${p.id}`, group:"rules", section:rule.label}));
  RULES.push(rule);
}
const runRules = (scope, ctx) => RULES.filter(r=>r.scope===scope && S(`rule.${r.id}.enabled`))
  .flatMap(r=>r.run({...ctx, p:pid=>S(`rule.${r.id}.${pid}`)}) || []);

/* گروه‌بندی واحدها: امور ← شهر ← کاربری */
function groupUnits(rows, level, multiArea){
  const keyFn = level==="province" ? r=>r.area : level==="area" ? r=>r.area+"|"+r.city : r=>r.usage;
  const groups = new Map();
  rows.forEach(r=>{ const k=keyFn(r); if(!k || k==="|") return; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); });
  const total = sum(rows,"customers");
  return [...groups.entries()].map(([key,rs])=>{
    const r0 = rs[0];
    return {key, rows:rs, area:r0.area, city: level==="area" ? r0.city : null,
      name: level==="province" ? r0.area : level==="area" ? r0.city : r0.usage,
      sub: level==="area" && multiArea ? short(r0.area) : "",
      share: pct(sum(rs,"customers"), total)};
  });
}

/* ───────── ۵) تحلیل ساختاری واحدها ───────── */
export function structuralAnalysis(rows, {level, metric, multiArea=false}){
  const meta = META[metric] || META.customers;
  const size = isSizeMetric(metric);
  const abs = hasThreshold(metric);
  const minShare = S("rel.minShare");
  const BASE = {idxCollection:"income", idxCycle:"income", idxPrice:"consumption", debtRisk:"income"};   // مبنای معتبر بودن شاخص نسبتی
  const validUnit = rs => size
    ? (sum(rs,"customers")>0 || sum(rs,"income")>0 || sum(rs,"consumption")>0)
    : (sum(rs,BASE[metric]||"customers")>0 && sum(rs,"customers")>0);

  let units = groupUnits(rows, level, multiArea)
    .filter(u=>validUnit(u.rows))
    .map(u=>({...u, value:calc(u.rows,metric)}))
    .filter(u=>Number.isFinite(u.value));

  const benchmark = size ? mean(units.map(u=>u.value)) : calc(rows, metric);
  const CRIT = S("rel.crit"), WARN = S("rel.warn"), GOOD = S("rel.good");
  units.forEach(u=>{
    u.dev = benchmark ? 100*(u.value-benchmark)/Math.abs(benchmark) : 0;
    u.goodness = meta.reverse ? -u.dev : u.dev;         // مثبت = بهتر از میانگین
    u.badDev = Math.max(0, -u.goodness);
    u.goodDev = Math.max(0, u.goodness);
    const tiny = u.share < minShare;
    if(size){ u.sev="none"; u.tagLabel="—"; }
    else if(abs){
      const s = absStatus(metric,u.value);
      u.sev = s.sev; u.tagLabel = s.label; u.cond = s.cond; u.absLabel = s.label; u.tiny = tiny;   // واحد کوچک: وضعیت در جدول می‌آید ولی هشدار نمی‌سازد
    }else{
      u.sev = tiny ? "none" : u.badDev>=CRIT ? "red" : u.badDev>=WARN ? "orange" : u.goodDev>=GOOD ? "green" : "none";
      u.tagLabel = SEV_LABEL[u.sev];
    }
  });
  units.sort((a,b)=>size ? b.value-a.value : b.goodness-a.goodness);

  // برترین/ضعیف‌ترین از میان واحدهای معنادار (سهم بسیار کوچک، نتیجه را منحرف می‌کند)
  const pool = size ? units : units.filter(u=>u.share>=minShare);
  const basePool = pool.length ? pool : units;
  const best = basePool[0]||null, worst = basePool.length>1 ? basePool[basePool.length-1] : null;
  const label = u => u.sub ? `${u.name} (${u.sub})` : u.name;
  const val = v => { const f=fmtMetric(metric,v); return `${f.num} ${f.unit}`.trim(); };
  const singleArea = new Set(rows.map(r=>r.area)).size===1;
  const areaOf = u => (level==="city" && !singleArea) ? null : u.area;   // برای دسته‌بندی هشدارها بر اساس امور
  const alerts = [];

  if(!size){
    if(abs){
      units.filter(u=>!u.tiny && (u.sev==="red"||u.sev==="orange")).forEach(u=>alerts.push({sev:u.sev,area:areaOf(u),
        text:`«${label(u)}» با ${val(u.value)} در «${meta.label}» ${u.cond} است؛ وضعیت ${u.absLabel}.`}));
    }else{
      units.filter(u=>u.sev==="red").forEach(u=>alerts.push({sev:"red",area:areaOf(u),
        text:`«${label(u)}» در شاخص «${meta.label}» با مقدار ${val(u.value)} به‌میزان ${fa(u.badDev,0)}٪ نامطلوب‌تر از میانگین (${val(benchmark)}) است؛ واحد بحرانی.`}));
      units.filter(u=>u.sev==="orange").forEach(u=>alerts.push({sev:"orange",area:areaOf(u),
        text:`«${label(u)}» در شاخص «${meta.label}» ${fa(u.badDev,0)}٪ از میانگین (${val(benchmark)}) نامطلوب‌تر است (${val(u.value)}) و نیازمند بررسی است.`}));
    }
    units.filter(u=>u.sev==="green" && !u.tiny).slice(0,2).forEach(u=>alerts.push({sev:"green",area:areaOf(u),
      text: abs ? `«${label(u)}» با ${val(u.value)} در «${meta.label}» ${u.cond} است؛ وضعیت ${u.absLabel}.`
                : `«${label(u)}» با ${val(u.value)} در «${meta.label}» ${fa(u.goodDev,0)}٪ بهتر از میانگین است؛ عملکرد عالی.`}));
  }
  alerts.push(...runRules("struct",{units,best,worst,benchmark,meta,label,val,size,abs,metric,level}));
  alerts.sort((a,b)=>SEV[a.sev]-SEV[b.sev]);
  return {units, benchmark, size, abs, best, worst, alerts, meta, label, val};
}

/* قوانین ساختاری */
registerAlertRule({id:"gap", scope:"struct", label:"شکاف عملکردی بین بهترین و ضعیف‌ترین",
  description:"برای شاخص‌های نسبتی: اختلاف بهترین و ضعیف‌ترین واحد نسبت به میانگین.",
  params:[{id:"pct", label:"حداقل شکاف (درصد میانگین)", unit:"٪", default:50, min:1, max:1000}],
  run({size,best,worst,benchmark,meta,label,val,p}){
    if(size || !best || !worst || !benchmark) return [];
    const spread = 100*Math.abs(best.value-worst.value)/Math.abs(benchmark);
    return spread>=p("pct") ? [{sev:"yellow",
      text:`شکاف عملکردی قابل‌توجه در «${meta.label}»: بین بهترین (${label(best)}: ${val(best.value)}) و ضعیف‌ترین (${label(worst)}: ${val(worst.value)}) زیرمجموعه معادل ${fa(spread,0)}٪ میانگین اختلاف وجود دارد.`}] : [];
  }});
registerAlertRule({id:"concentration", scope:"struct", label:"تمرکز در شاخص‌های حجمی",
  description:"برای شاخص‌های حجمی: سهم یک واحد از مجموع.",
  params:[{id:"pct", label:"حداقل سهم یک واحد از مجموع", unit:"٪", default:40, min:1, max:100}],
  run({size,units,best,meta,label,p}){
    if(!size || units.length<3) return [];
    const total = sum(units,"value"); if(total<=0) return [];
    const share = pct(best.value,total);
    return share>=p("pct") ? [{sev:"yellow", text:`تمرکز بالا: «${label(best)}» به‌تنهایی ${fa(share,0)}٪ از مجموع «${meta.label}» را دارد.`}] : [];
  }});
registerAlertRule({id:"sizeRatio", scope:"struct", label:"اختلاف اندازه در شاخص‌های حجمی",
  description:"برای شاخص‌های حجمی: نسبت بزرگ‌ترین به کوچک‌ترین واحد.",
  params:[{id:"ratio", label:"حداقل نسبت بزرگ‌ترین به کوچک‌ترین", unit:"برابر", default:5, min:1.1, max:10000, step:0.5}],
  run({size,best,worst,meta,label,p}){
    if(!size || !best || !worst || worst.value<=0) return [];
    const ratio = best.value/worst.value;
    return ratio>=p("ratio") ? [{sev:"yellow", text:`اختلاف اندازه زیاد: «${label(best)}» حدود ${fa(ratio,1)} برابر «${label(worst)}» در «${meta.label}» است.`}] : [];
  }});

/* ───────── ۶) هشدارهای عمومی (مستقل از شاخص انتخابی) ───────── */
export function generalAlerts(rows, {level, multiArea=false, metric}){
  const minShare = S("rel.minShare");
  const units = groupUnits(rows, level, multiArea).filter(u=>u.share>=minShare && sum(u.rows,"income")>0);
  const label = u => u.sub ? `${u.name} (${u.sub})` : u.name;
  const singleArea = new Set(rows.map(r=>r.area)).size===1;
  const areaOf = u => (level==="city" && !singleArea) ? null : u.area;
  return runRules("general",{rows,level,multiArea,metric,units,label,areaOf,noun:UNIT_NOUN[level]});
}

registerAlertRule({id:"debtGrowth", scope:"general", label:"رشد بدهی",
  description:"مقایسه بدهی پایان دوره با ابتدای دوره (کل محدوده و واحدهای با رشد شدید). جمع مانده‌ها جبری است؛ گذار از مانده منفی (پیش‌دریافت/اصلاحات) به مثبت «افزایش ریسک وصول» گزارش می‌شود.",
  params:[
    {id:"pct", label:"رشد کل محدوده → هشدار", unit:"٪", default:30, min:1, max:1000},
    {id:"unitPct", label:"رشد هر واحد → نکته", unit:"٪", default:60, min:1, max:1000},
    {id:"topN", label:"حداکثر تعداد واحد گزارش‌شده", unit:"", default:3, min:0, max:50}
  ],
  run({rows,units,label,areaOf,p}){
    const out = [];
    const usageOf = rs => { const us = new Set(rs.map(r=>r.usage)); return us.size===1 ? [...us][0] : ""; };
    const d0 = sum(rows,"debtStart"), d1 = sum(rows,"debtEnd");
    const G = calculateDebtGrowth(d0, d1, usageOf(rows));
    if(d1>d0 && Number.isFinite(G.growthRate) && G.growthRate>=p("pct")){
      if(d0>0) out.push({sev:"orange", text:`بدهی آب‌بها در حال رشد است: از ${mln(d0)} به ${mln(d1)} میلیون ریال رسیده (رشد ${fa(G.growthRate,0)}٪ نسبت به ابتدای دوره).`});
      else if(d0<0 && d1>0) out.push({sev:"orange", text:`افزایش ریسک وصول: مانده بدهی از منفی (${mln(d0)} میلیون ریال؛ پیش‌دریافت/اصلاحات) به مثبت (${mln(d1)} میلیون ریال) رسیده است؛ پیش‌دریافت مستهلک و بدهی جدید واقعی ایجاد شده است.`});
    }
    units.map(u=>{const a=sum(u.rows,"debtStart"),b=sum(u.rows,"debtEnd");const G=calculateDebtGrowth(a,b,usageOf(u.rows));return {u,g:Number.isFinite(G.growthRate)?G.growthRate:0,a,b}})
      .filter(x=>(x.a>0 || (x.a<0 && x.b>0)) && x.g>=p("unitPct")).sort((x,y)=>y.g-x.g).slice(0,p("topN")).forEach(x=>out.push({sev:"yellow",area:areaOf(x.u),
        text: x.a<0
          ? `افزایش ریسک وصول در «${label(x.u)}»: مانده بدهی از منفی به مثبت رسیده است (${mln(x.a)} ← ${mln(x.b)} میلیون ریال).`
          : `بدهی «${label(x.u)}» ${fa(x.g,0)}٪ نسبت به ابتدای دوره رشد کرده است (${mln(x.a)} ← ${mln(x.b)} میلیون ریال).`}));
    return out;
  }});
registerAlertRule({id:"pareto", scope:"general", label:"تمرکز درآمد و بدهی (پارتو)",
  description:"سهم چند واحد برتر از کل درآمد یا کل بدهی.",
  params:[
    {id:"topN", label:"تعداد واحد برتر", unit:"", default:3, min:1, max:20},
    {id:"pct", label:"حداقل سهم آن‌ها از کل", unit:"٪", default:50, min:1, max:100},
    {id:"minUnits", label:"حداقل تعداد واحد برای بررسی", unit:"", default:6, min:2, max:100}
  ],
  run({units,label,noun,p}){
    if(units.length<p("minUnits")) return [];
    const out = [];
    [["income","کل درآمد"],["debtEnd","کل بدهی"]].forEach(([k,txt])=>{
      const tot = units.reduce((a,u)=>a+sum(u.rows,k),0);
      const top = units.map(u=>({u,v:sum(u.rows,k)})).sort((a,b)=>b.v-a.v).slice(0,p("topN"));
      const share = pct(top.reduce((a,x)=>a+x.v,0),tot);
      if(tot>0 && share>=p("pct")) out.push({sev:"yellow",
        text:`تمرکز بالا: ${fa(p("topN"))} ${noun} برتر (${top.map(x=>label(x.u)).join("، ")}) ${fa(share,0)}٪ از ${txt} را دارند.`});
    });
    return out;
  }});
registerAlertRule({id:"priceOutlier", scope:"general", label:"ناهماهنگی مصرف و درآمد (قیمت آب فروش رفته)",
  description:"واحدهایی که قیمت هر مترمکعب‌شان بسیار دور از میانگین محدوده است.",
  params:[
    {id:"z", label:"حداقل فاصله از میانگین (انحراف معیار)", unit:"σ", default:1.5, min:0.5, max:10, step:0.1},
    {id:"maxItems", label:"حداکثر تعداد گزارش", unit:"", default:2, min:0, max:50},
    {id:"minUnits", label:"حداقل تعداد واحد برای بررسی", unit:"", default:5, min:3, max:100}
  ],
  run({units,label,areaOf,p}){
    const priced = units.filter(u=>sum(u.rows,"consumption")>0).map(u=>({u,p:calc(u.rows,"idxPrice")}));
    if(priced.length<p("minUnits")) return [];
    const m = mean(priced.map(x=>x.p)), sd = Math.sqrt(mean(priced.map(x=>(x.p-m)**2)));
    if(!sd) return [];
    return priced.map(x=>({...x,z:(x.p-m)/sd})).filter(x=>Math.abs(x.z)>p("z"))
      .sort((a,b)=>Math.abs(b.z)-Math.abs(a.z)).slice(0,p("maxItems")).map(x=>({sev:"yellow",area:areaOf(x.u),
        text:`ناهماهنگی مصرف و درآمد: قیمت هر مترمکعب «${label(x.u)}» (${fa(x.p)} ریال) ${x.z>0?"بسیار بالاتر":"بسیار پایین‌تر"} از میانگین محدوده (${fa(m)} ریال) است.`}));
  }});
registerAlertRule({id:"importantUsage", scope:"general", label:"کاربری‌های مهم با وصول یا دوره وصول ضعیف",
  description:"بر اساس آستانه‌های درصد وصول و دوره وصول (در سطح شهر برای شاخص‌های دارای آستانه تکرار نمی‌شود).",
  params:[],
  run({rows,level,metric}){
    if(level==="city" && hasThreshold(metric)) return [];
    const out = [];
    importantUsages(rows).items.forEach(it=>{
      if(!it.customers) return;
      const c = absStatus("idxCollection",it.coll), d = absStatus("idxCycle",it.dso);
      if(c.sev==="red") out.push({sev:"red", text:`کاربری مهم «${it.name}» درصد وصول ضعیفی دارد: ${fa(it.coll,1)}٪ (${c.cond}).`});
      else if(c.sev==="orange") out.push({sev:"orange", text:`کاربری مهم «${it.name}» با درصد وصول ${fa(it.coll,1)}٪ در وضعیت هشدار است (${c.cond}).`});
      else if(d.sev==="red") out.push({sev:"orange", text:`کاربری مهم «${it.name}» دوره وصول مطالبات ${fa(it.dso,0)} روزه دارد (${d.cond}).`});
    });
    return out;
  }});

/* ───────── کاربری‌های مهم ───────── */
export function importantUsages(rows){
  const IMP = importantList();
  const KEYS = [["customers","customers"],["consumption","consumption"],["income","income"],["collection","collection"],["debt","debtEnd"]];
  const agg = rs => {
    const o = {customers:sum(rs,"customers"), consumption:sum(rs,"consumption"), income:sum(rs,"income"), collection:sum(rs,"collection"), debt:sum(rs,"debtEnd")};
    o.coll = calc(rs,"idxCollection"); o.dso = calc(rs,"idxCycle");
    return o;
  };
  const total = agg(rows);
  const withShares = (name,rs) => {
    const o = {name, ...agg(rs)};
    o.share = {}; KEYS.forEach(([k])=>{ o.share[k] = pct(o[k], total[k]); });
    return o;
  };
  const items = IMP.map(n=>withShares(n, rows.filter(r=>r.usage===n)));
  const imp = withShares("جمع کاربری‌های مهم", rows.filter(r=>IMP.includes(r.usage)));
  const other = withShares("سایر کاربری‌ها", rows.filter(r=>!IMP.includes(r.usage)));
  return {items, important:imp, other, total:{name:"جمع کل", ...total, share:Object.fromEntries(KEYS.map(([k])=>[k,total[k]?100:0]))}, names:IMP};
}

/* دسته‌بندی هشدارها بر اساس امور: ابتدا «کل محدوده» (هشدارهای بدون امور مشخص)، سپس هر امور با هشدارهایش
   (بحرانی ← هشدار ← نکته ← عالی). ترتیب امورها: order (اگر داده شود) وگرنه بیشترین بحران. */
export function groupAlertsByArea(alerts, order=[]){
  const map = new Map();
  alerts.forEach(a=>{ const k=a.area||""; if(!map.has(k)) map.set(k,[]); map.get(k).push(a); });
  const cnt = (list,sev) => list.filter(a=>a.sev===sev).length;
  const groups = [...map.entries()].map(([area,list])=>({area, label: area||"کل محدوده", alerts:[...list].sort((x,y)=>SEV[x.sev]-SEV[y.sev])}));
  const idx = a => { const i=order.indexOf(a); return i<0 ? 1e6 : i; };
  groups.sort((g,h)=>{
    if(!g.area) return -1; if(!h.area) return 1;
    if(order.length) return idx(g.area)-idx(h.area) || g.area.localeCompare(h.area,"fa");
    return cnt(h.alerts,"red")-cnt(g.alerts,"red") || cnt(h.alerts,"orange")-cnt(g.alerts,"orange") || g.area.localeCompare(h.area,"fa");
  });
  return groups;
}
