/* تب «تحلیل مالی و عملکردی» — UI فقط دریافت/فیلتر نمایش/مرتب‌سازی/نمایش می‌کند؛
   هیچ فرمول آماری اینجا دوباره محاسبه نمی‌شود (همه در financeEngine.js انجام و Memoize می‌شود). */
import {
  analyzeFinance, buildFinView, optionLists, CARD_DEFS, PROBLEMS, PROBLEM_BY_ID, PROBLEM_FILTERS, FILTER_BY_ID, CAUSES, SEVERITY, SORT_OPTIONS,
  faN, pct, money, PROVINCE_LABEL
} from "../engines/financeEngine.js";
import {scopeRows, scopeButtonsHtml, ARMED, ARMED_DEFAULT, ARMED_ORDER, SETTLEMENT, SETTLEMENT_ORDER, nextOf} from "../filters/scopeFilters.js";
import {analyzeZeroWatch, buildZwView, ZW_CONTROLS, ZW_BY_ID, ZW_LEVELS} from "../engines/zeroWatchEngine.js";   /* بخش مستقل «پایش صفرها» */
import {get as getSetting, set as setSetting} from "../settings/settings.js";

const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const isN = v => typeof v === "number" && Number.isFinite(v);
const shortArea = a => String(a||"").replace(/^امور\s*/,"");
/* آیکون کارت‌ها (هم‌شکل کارت‌های تب مصرف: .an-card-ico) */
const FIN_ICO = {any:"triangle-alert", debtGrowth:"trending-up", weakCollection:"trending-down", lowSales:"chevrons-down", accumulatedDebt:"layers",
  highDebtPerCust:"users", highPeriod:"timer", good:"circle-check", debtConcentration:"target", stableLowSales:"scale", lowPrice:"tag",
  advanceToDebt:"timer", salesIncrease:"arrow-up", salesAndWeak:"percent"};
const finIco = id => `<span class="an-card-ico"><i class="ico ico-${FIN_ICO[id]||"circle"}"></i></span>`;
const EMPTY_MSG = "در این سطح موردی با این معیار شناسایی نشد.";

/* armed / settlement: کلیدهای سه‌حالتهٔ اختصاصی این تب (پیش‌فرض: بدون نیروی مسلح، شهر و روستا) · openDrop: بازشوی امور/کاربری */
let ui = {area:"", city:"", usages:[], problem:"", severity:"", sort:"severity", limit:0, openKey:null,
  armed:ARMED_DEFAULT, settlement:"all", openDrop:null,
  zwTag:"", zwLimit:0};   /* zwTag/zwLimit: فقط برای بخش «پایش صفرها» (مستقل از فیلتر نوع مشکل) */
let currentFinanceCtx = null;
let finPickBound = false;

const sevBadge = sev => sev ? `<span class="fin-sev fin-sev-${sev}">${SEVERITY[sev].icon} ${SEVERITY[sev].label}</span>` : `<span class="fin-sev fin-sev-0">—</span>`;
const chip = p => `<span class="fin-chip fin-t${p.tier>=3?3:p.tier>=2?2:1}" title="${p.tier>=3?"انحراف بسیار شدید":p.tier>=2?"انحراف شدید":"انحراف قابل توجه"}">${esc(p.id==="weakCollection"&&p.drivesDebt ? "ضعف وصول مؤثر بر رشد بدهی" : PROBLEM_BY_ID[p.id].label)}</span>`;
const moneyCell = v => `<span title="${isN(v)?esc(faN(v,0)+" ریال"):""}">${money(v)}</span>`;

const METRIC_LABEL = {
  salesPerCust:["فروش سرانهٔ مشترک", money], price:["قیمت متوسط فروش (ریال/م³)", v=>faN(v,0)], absorb:["درصد جذب", v=>pct(v,1)],
  debtPerCust:["بدهی سرانه", money], debtStartPerCust:["بدهی اول دورهٔ سرانه", money], period:["دوره وصول (روز)", v=>faN(v,0)],
  growth:["درصد رشد بدهی", v=>pct(v,0)], debtChangePerCust:["تغییر بدهی سرانه", money]
};
const GROWTH_TXT = {
  percent:"", newDebt:"ایجاد بدهی جدید", negativeStart:"بدهی اول منفی (اصلاحات) — نرخ با قدرمطلق بدهی اول",
  advanceChange:"تغییر حجم پیش‌دریافت", advanceToDebt:"استهلاک پیش‌دریافت + ایجاد بدهی جدید (افزایش ریسک وصول)", none:""
};
/* نمایش رشد بدهی: statusهای دارای نرخ درصد را هم نشان می‌دهند؛ حالت‌های پیش‌دریافت/اصلاحات با برچسب توضیحی */
function growthDisplay(x){
  const st = x.growthStatus, txt = GROWTH_TXT[st];
  if(st==="percent") return pct(x.growth,1);
  if(isN(x.growth) && (st==="negativeStart"||st==="advanceChange"||st==="advanceToDebt")) return `${pct(x.growth,0)} — ${txt}`;
  return txt || "—";
}

function selectHtml(name, label, options, cur, disabled=false){
  return `<label class="fin-f"><span>${label}</span><select data-fin="${name}" ${disabled?"disabled":""}>${
    options.map(([v,t])=>`<option value="${esc(v)}" ${String(cur)===String(v)?"selected":""}>${esc(t)}</option>`).join("")}</select></label>`;
}

function crumbs(){
  const parts = [`<button type="button" class="fin-crumb ${!ui.area?"on":""}" data-fin-crumb="province">استان ${esc(PROVINCE_LABEL)}</button>`];
  if(ui.area) parts.push(`<button type="button" class="fin-crumb ${!ui.city?"on":""}" data-fin-crumb="area">${esc(ui.area)}</button>`);
  if(ui.city) parts.push(`<button type="button" class="fin-crumb ${!ui.usages.length?"on":""}" data-fin-crumb="city">${esc(ui.city)}</button>`);
  if(ui.usages.length) parts.push(`<button type="button" class="fin-crumb on" data-fin-crumb="usage">${ui.usages.length===1?esc(ui.usages[0]):faN(ui.usages.length)+" کاربری"}</button>`);
  return `<nav class="fin-crumbs" aria-label="مسیر Drill Down">${parts.join('<i class="fin-sep">‹</i>')}</nav>`;
}

function statusBlock(v){
  const a = v.agg, none = !v.scopeCount;
  const chg = a.debtChange;
  const chgTxt = isN(chg) ? `${chg>0?"▲":chg<0?"▼":"■"} ${money(Math.abs(chg))}` : "—";
  const growthTxt = growthDisplay(a);
  const chgCls = !isN(chg) ? "" : chg>0 ? "fin-neg" : chg<0 ? "fin-pos" : "";
  const cell = (label, big, sub, cls="") => `<div class="fin-stat ${cls}"><small>${label}</small><b>${big}</b><em>${sub}</em></div>`;
  if(none) return `<p class="fin-empty">${EMPTY_MSG}</p>`;
  return `<div class="fin-stats">
    ${cell("فروش (ریال)", moneyCell(a.sales), `سرانه مشترک: ${money(a.salesPerCust)} · مشترک: ${faN(a.customers)}`)}
    ${cell("وصول (ریال)", moneyCell(a.collection), `درصد جذب: ${isN(a.absorb)?pct(a.absorb,1):"فاقد محاسبه"}`)}
    ${cell("بدهی پایان دوره (ریال)", moneyCell(a.debtEnd), `اول دوره: ${money(a.debtStart)} · تغییر: <span class="${chgCls}">${chgTxt}</span> · رشد: ${esc(growthTxt)}`)}
    ${cell("دوره وصول مطالبات", isN(a.period)?faN(a.period,0)+" <u>روز</u>":"فاقد محاسبه", `قیمت متوسط فروش: ${isN(a.price)?faN(a.price,0)+" ریال/م³":"فاقد محاسبه"}`)}
  </div>`;
}

function causesBlock(v){
  const bars = v.causes.length ? v.causes.map(c=>`<div class="fin-bar"><span class="fin-bar-l">${esc(c.label)}</span>
      <span class="fin-bar-t"><i style="width:${Math.max(2,c.pct).toFixed(1)}%"></i></span><span class="fin-bar-n">${pct(c.pct,0)} <small>(${faN(c.n)})</small></span></div>`).join("")
    : `<p class="fin-empty">${EMPTY_MSG}</p>`;
  return `<div class="fin-causes-only"><h4>علت غالب مشکلات</h4><div class="fin-bars">${bars}</div></div>`;
}

function topBlock(v){
  if(!v.top.length) return `<p class="fin-empty">${EMPTY_MSG}</p>`;
  return `<ol class="fin-top">${v.top.map((l,i)=>`<li class="fin-top-i" data-fin-goto="${esc(l.key)}">
    <span class="fin-rank">${faN(i+1)}</span>
    <div class="fin-top-b">
      <div class="fin-top-h"><b>${esc(l.usage)}</b><span>${esc(shortArea(l.area))} › ${esc(l.city)}</span>${sevBadge(l.severity)}</div>
      <div class="fin-top-m">علت غالب: <b>${esc(causeLabel(l.cause))}</b> · بدهی پایان ${money(l.debtEnd)} · سرانه ${money(l.debtPerCust)} · جذب ${isN(l.absorb)?pct(l.absorb,0):"—"}</div>
      <div class="fin-chips">${l.problems.map(chip).join("")}</div>
      <p class="fin-txt">${esc(l.text)}</p>
    </div></li>`).join("")}</ol>`;
}
const causeLabel = id => CAUSES[id] || id || "—";

/** متن قابل‌اشتراک کارت جزئیات (برای Web Share / کپی) */
function buildShareText(l){
  if(!l) return "";
  const sevLab = l.severity ? `${SEVERITY[l.severity].icon} ${SEVERITY[l.severity].label}` : "—";
  const probLab = l.problems?.length ? l.problems.map(p=>PROBLEM_BY_ID[p.id]?.label||p.id).join("، ") : (l.good?"عملکرد مطلوب":"—");
  return [
    `تحلیل مالی — ${l.area||""} / ${l.city||""} / ${l.usage||""}`,
    `شدت: ${sevLab}`,
    l.text ? `خلاصه: ${l.text}` : "",
    `علت غالب: ${causeLabel(l.cause)}`,
    `مشکلات: ${probLab}`,
    `مشترک: ${isN(l.customers)?faN(l.customers):"—"}`,
    `فروش: ${isN(l.sales)?faN(l.sales,0)+" ریال":"—"} · وصول: ${isN(l.collection)?faN(l.collection,0)+" ریال":"—"} · جذب: ${isN(l.absorb)?pct(l.absorb,1):"—"}`,
    `بدهی اول: ${isN(l.debtStart)?faN(l.debtStart,0)+" ریال":"—"} · بدهی پایان: ${isN(l.debtEnd)?faN(l.debtEnd,0)+" ریال":"—"} · رشد: ${growthDisplay(l)}`,
    `دوره وصول: ${isN(l.period)?faN(l.period,1)+" روز":"—"} · بدهی سرانه: ${isN(l.debtPerCust)?faN(l.debtPerCust,0)+" ریال":"—"}`
  ].filter(Boolean).join("\n");
}

function drillBlock(v){
  const lvTitle = v.level==="area" ? "تفکیک بر اساس امور" : v.level==="city" ? `شهرهای ${ui.area}` : `کاربری‌های شهر ${ui.city}`;
  const first = v.level==="area" ? "امور" : v.level==="city" ? "شهر" : "کاربری";
  const mLabel = ui.problem ? (ui.problem==="any"?"موارد مشکل‌دار":ui.problem==="good"?"عملکرد مطلوب":FILTER_BY_ID[ui.problem].label) : "موارد مشکل‌دار";
  if(!v.drill.length) return `<p class="fin-empty">${EMPTY_MSG}</p>`;
  const rows = v.drill.map(d=>{
    const causeTxt = (d.causes && d.causes.length)
      ? d.causes.map(esc).join(" · ")
      : esc(d.cause||"—");
    return `<tr data-fin-drill="${esc(d.name)}" class="fin-drow">
    <td class="fin-name">${esc(v.level==="area"?shortArea(d.name):d.name)}</td>
    <td class="fin-drill-causes">${causeTxt}</td>
    <td class="num"><b>${faN(d.matched)}</b></td>
    <td class="fin-sevmix">${d.sevCount[3]?`<i class="fin-dot fin-d3">${faN(d.sevCount[3])}</i>`:""}${d.sevCount[2]?`<i class="fin-dot fin-d2">${faN(d.sevCount[2])}</i>`:""}${d.sevCount[1]?`<i class="fin-dot fin-d1">${faN(d.sevCount[1])}</i>`:""}${d.matched?"":"—"}</td>
    <td class="num">${moneyCell(d.agg.sales)}</td><td class="num">${moneyCell(d.agg.collection)}</td>
    <td class="num">${isN(d.agg.absorb)?pct(d.agg.absorb,0):"—"}</td>
    <td class="num">${moneyCell(d.agg.debtEnd)}</td>
    <td class="num">${isN(d.agg.period)?faN(d.agg.period,0):"—"}</td>
    <td class="num">${esc(growthDisplay(d.agg))}</td></tr>`;
  }).join("");
  return `<div class="fin-tw"><table class="fin-table fin-drill-table"><thead><tr>
    <th>${first}</th><th>علت غالب</th><th>${esc(mLabel)}</th><th>شدت</th><th>فروش</th><th>وصول</th><th>جذب</th><th>بدهی پایان</th><th>دوره وصول</th><th>رشد بدهی</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="fin-hint">${esc(lvTitle)} — روی هر ردیف بزنید تا به سطح بعد بروید. در ستون علت غالب تا دو علت برتر (وزن‌دار با بدهی) نشان داده می‌شود.</p>`;
}

function detailPanel(l, cfg){
  const kv = (k,val) => `<dt>${k}</dt><dd>${val}</dd>`;
  const basis = Object.entries(l.basis).map(([m,b])=>{
    const [lab, f] = METRIC_LABEL[m] || [m, v=>faN(v,1)];
    const cmp = b.dir==="high" ? "حد هشدار (صدک بالا)" : "حد هشدار (صدک پایین)";
    return `<li><b>${esc(lab)}:</b> ${f(l[m])} — میانهٔ گروه ${f(b.med)} · ${cmp} ${f(b.warn)} <small>(کاربری مشابه در ${esc(b.level)}، ${faN(b.n)} نمونه)</small></li>`;
  }).join("");
  const probs = l.problems.length ? l.problems.map(p=>`<li>${chip(p)}</li>`).join("") : `<li class="fin-none">مشکلی ثبت نشده</li>`;
  const watch = l.watch && l.watch.length ? `<p class="fin-watch">زیرنظر (سیگنال تکیِ هشدار، بدون تأیید): ${l.watch.map(id=>esc(PROBLEM_BY_ID[id].label)).join("، ")}</p>` : "";
  return `<div class="fin-detail">
    <div class="fin-detail-top"><p class="fin-txt"><b>${sevBadge(l.severity)}</b> ${esc(l.text)}</p>
      <button type="button" class="fin-share-btn" data-fin-share-key="${esc(l.key)}" title="اشتراک‌گذاری کارت">↗ شیر کارت</button></div>
    <div class="fin-dgrid">
      <dl>${kv("مشترک",faN(l.customers))}${kv("مصرف (م³)",faN(l.consumption))}${kv("فروش (ریال)",moneyCell(l.sales))}${kv("وصول (ریال)",moneyCell(l.collection))}
        ${kv("درصد جذب",isN(l.absorb)?pct(l.absorb,1):"فاقد محاسبه")}${kv("فروش سرانهٔ مشترک",money(l.salesPerCust))}${kv("قیمت متوسط فروش",isN(l.price)?faN(l.price,0)+" ریال/م³":"فاقد محاسبه")}</dl>
      <dl>${kv("بدهی اول دوره",moneyCell(l.debtStart))}${kv("بدهی پایان دوره",moneyCell(l.debtEnd))}${kv("تغییر خالص بدهی",money(l.debtChange))}
        ${kv("رشد بدهی",esc(growthDisplay(l)))}${kv("بدهی سرانه",money(l.debtPerCust))}
        ${kv("میانگین بدهی",money(l.avgDebt))}${kv("دوره وصول مطالبات",isN(l.period)?faN(l.period,1)+" روز":"فاقد محاسبه")}</dl>
      <div><h5>مشکلات</h5><ul class="fin-plist">${probs}</ul>${watch}${basis?`<h5>مبنای مقایسه</h5><ul class="fin-basis">${basis}</ul>`:""}</div>
    </div></div>`;
}

function tableBlock(v, cfg){
  if(!v.rows.length) return `<p class="fin-empty">${EMPTY_MSG}</p>`;
  const limit = ui.limit || cfg.tableLimit;
  const shown = v.rows.slice(0, limit);
  const head = ["سطح","امور","شهر","کاربری","علت غالب","مشکلات","شدت","مشترک","فروش","وصول","درصد جذب","بدهی اول","بدهی پایان","تغییر بدهی","بدهی سرانه","دوره وصول","قیمت متوسط"];
  const body = shown.map(l=>{
    const open = ui.openKey === l.key;
    const chg = l.debtChange;
    const main = `<tr class="fin-row ${open?"is-open":""} fin-rs${l.severity}" data-fin-row="${esc(l.key)}">
      <td>کاربری</td><td>${esc(shortArea(l.area))}</td><td>${esc(l.city)}</td><td>${esc(l.usage)}</td>
      <td>${esc(causeLabel(l.cause))}</td><td class="fin-chips">${l.problems.length?l.problems.map(chip).join(""):(l.good?'<span class="fin-chip fin-good">عملکرد مطلوب</span>':"—")}</td><td>${sevBadge(l.severity)}</td>
      <td class="num">${faN(l.customers)}</td><td class="num">${moneyCell(l.sales)}</td><td class="num">${moneyCell(l.collection)}</td>
      <td class="num">${isN(l.absorb)?pct(l.absorb,0):"—"}</td><td class="num">${moneyCell(l.debtStart)}</td><td class="num">${moneyCell(l.debtEnd)}</td>
      <td class="num ${isN(chg)?(chg>0?"fin-neg":chg<0?"fin-pos":""):""}">${isN(chg)?(chg>0?"▲ ":chg<0?"▼ ":"")+money(Math.abs(chg)):"—"}</td>
      <td class="num">${money(l.debtPerCust)}</td><td class="num">${isN(l.period)?faN(l.period,0):"—"}</td><td class="num">${isN(l.price)?faN(l.price,0):"—"}</td></tr>`;
    return main + (open ? `<tr class="fin-detail-row"><td colspan="${head.length}">${detailPanel(l,cfg)}</td></tr>` : "");
  }).join("");
  const more = v.rows.length > shown.length ? `<button type="button" class="fin-more" data-fin-more>نمایش ${faN(Math.min(cfg.tableLimit, v.rows.length-shown.length))} مورد بعدی (از ${faN(v.rows.length-shown.length)} مورد باقی‌مانده)</button>` : "";
  return `<div class="fin-tw"><table class="fin-table fin-main-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>${more}
    <p class="fin-hint">مبالغ به ریال (خلاصه‌شده: میلیون/میلیارد). برای دیدن جزئیات، مبنای مقایسه و توضیح هر مورد روی ردیف بزنید.</p>`;
}

/** وضعیت فیلتر فعلی این تب برای چیپ شناور سطح فیلتر */
export function getFinanceScope(){
  return {
    areas: ui.area ? [ui.area] : [],
    cities: ui.city ? [ui.city] : [],
    usages: ui.usages.slice()
  };
}
export function setFinanceScopeLevel(level){
  if(level==="province"){ ui.area=""; ui.city=""; ui.usages=[]; }
  else if(level==="area"){ ui.city=""; ui.usages=[]; }
  else if(level==="city"){ ui.usages=[]; }
  ui.openDrop=null; ui.openKey=null;
}

/* ───────── بخش مستقل «پایش صفرها» (فروش صفر / وصول صفر) — زیر کارت‌های قبلی، با خط جداکننده ─────────
   فقط خواندن: از رکوردهای محدودهٔ انتخابی (v.scope) استفاده می‌کند و هیچ‌چیز از امتیاز/شدت/علت غالب/شمارش کارت‌های بالا را تغییر نمی‌دهد. */
function zwBlock(res, v){
  const zw = analyzeZeroWatch(res), c = zw.cfg;
  if(!c.enabled) return "";
  const act = ZW_CONTROLS.filter(x=>c.on[x.id]);
  if(ui.zwTag && !act.some(x=>x.id===ui.zwTag)) ui.zwTag = "";
  const z = buildZwView(zw, v.scope, ui.zwTag);
  const lvl = id => ZW_LEVELS[c.level[id]];
  const lvBadge = n => `<span class="zw-lv zw-lv${n}">${ZW_LEVELS[n].icon} ${ZW_LEVELS[n].label}</span>`;
  const cardsHtml = `<button type="button" class="zw-card zw-card-all ${ui.zwTag?"":"on"}" data-zw-card="" aria-pressed="${!ui.zwTag}">
      <span class="an-card-ico"><i class="ico ico-layers"></i></span><span class="zw-card-n">${faN(z.total)}</span><span class="zw-card-l">کل موارد پایش صفرها</span>
      <span class="zw-card-h">${[3,2,1].map(n=>z.levels[n]?`${ZW_LEVELS[n].icon}${faN(z.levels[n])}`:"").filter(Boolean).join(" ")||"—"}</span></button>`
    + act.map(x=>`<button type="button" class="zw-card zw-c-l${c.level[x.id]} ${ui.zwTag===x.id?"on":""}" data-zw-card="${x.id}" aria-pressed="${ui.zwTag===x.id}" title="${esc(x.hint)}">
      <span class="an-card-ico"><i class="ico ico-ban"></i></span><span class="zw-card-n">${faN(z.counts[x.id])}</span><span class="zw-card-l">${esc(x.label)}</span>
      <span class="zw-card-h">${lvl(x.id).icon} ${lvl(x.id).label}</span></button>`).join("");
  const limit = ui.zwLimit || c.tableLimit, shown = z.rows.slice(0, limit);
  const body = shown.map(it=>{
    const l = it.l;
    const chips = it.tags.map(t=>`<span class="zw-chip zw-chip-l${c.level[t]}" title="${esc(ZW_BY_ID[t].hint)}">${esc(ZW_BY_ID[t].label)}</span>`).join("");
    return `<tr class="fin-row zw-rl${it.level}" data-fin-goto="${esc(l.key)}" title="رفتن به همین مورد در جدول جزئیات">
      <td>${lvBadge(it.level)}</td><td>${esc(shortArea(l.area))}</td><td>${esc(l.city)}</td><td>${esc(l.usage)}</td>
      <td class="zw-chips">${chips}</td><td class="num">${faN(l.customers)}</td><td class="num">${moneyCell(l.sales)}</td><td class="num">${moneyCell(l.collection)}</td>
      <td class="num">${moneyCell(l.debtEnd)}</td><td class="num">${isN(l.absorb)?pct(l.absorb,1):"—"}</td></tr>`;
  }).join("");
  const more = z.rows.length > shown.length ? `<button type="button" class="fin-more" data-zw-more="${limit + c.tableLimit}">نمایش ${faN(Math.min(c.tableLimit, z.rows.length-shown.length))} مورد بعدی (از ${faN(z.rows.length-shown.length)} مورد باقی‌مانده)</button>` : "";
  const table = z.rows.length
    ? `<div class="fin-tw"><table class="fin-table zw-table"><thead><tr><th>سطح</th><th>امور</th><th>شهر</th><th>کاربری</th><th>برچسب‌ها</th><th>مشترک</th><th>فروش</th><th>وصول</th><th>بدهی پایان</th><th>درصد جذب</th></tr></thead><tbody>${body}</tbody></table></div>${more}`
    : `<p class="fin-empty">${act.length ? "در این محدوده با تنظیم‌های جاری موردی شناسایی نشد." : "همهٔ کنترل‌ها در تنظیمات خاموش‌اند."}</p>`;
  const tagTitle = ui.zwTag ? ZW_BY_ID[ui.zwTag].label : "همهٔ کنترل‌ها";
  const drilled = !!(ui.area||ui.city||ui.usages.length);
  return `<section class="fin-zw" aria-label="پایش صفرها">
    <hr class="fin-zw-line">
    <div class="fin-zw-head"><h3>پایش صفرها <small>فروش صفر · وصول صفر · مستقل از امتیاز، رتبه‌بندی و علت غالب بالا</small></h3></div>
    <div class="zw-cards">${cardsHtml}</div>
    <section class="fin-panel zw-panel"><div class="fin-panel-head"><h3>موارد پایش صفرها — ${esc(tagTitle)}</h3><div class="fin-panel-tools"><span class="fin-count">${faN(z.matched)} مورد</span>${drilled?`<button type="button" class="fin-back" data-fin-back title="بازگشت به سطح قبلی">← بازگشت</button>`:""}</div></div>
      ${table}
      <p class="fin-hint">حداقل مشترک: ${faN(c.minCustomers)} · حداقل مبلغ: ${money(c.minAmount)} ریال · آستانهٔ بدهی بالا: ${money(c.highDebt)} ریال${c.guardLink?" · اتصال محافظ میانهٔ صفر به تشخیص «ضعف وصول»: روشن":""}. سطح هر رکورد = بالاترین سطح برچسب‌هایش. روی هر ردیف بزنید تا در جدول جزئیات باز شود.</p>
    </section>
    <details class="fin-help zw-help"><summary>راهنمای پایش صفرها</summary><ul>
      <li>این بخش <b>اثری روی امتیاز، شدت، علت غالب، «موارد مهم»، رتبه‌بندی و شمارش کارت‌های بالا ندارد</b>؛ نتیجه‌اش جدا محاسبه و نمایش داده می‌شود. فقط کلید اختیاری «اتصال محافظ» (پیش‌فرض روشن) در منوی تنظیمات ← «پایش صفرها» می‌تواند تشخیص «ضعف وصول» را در گروه‌های با میانهٔ صفر تغییر دهد.</li>
      <li>رکوردهای «حجم مالی ناچیز» که تشخیص مشکل کنارشان می‌گذارد، اینجا با حداقل مبلغ مخصوص همین بخش بررسی می‌شوند.</li>
      <li><b>جذب پایین در گروه با میانهٔ صفر</b>: در گروه‌هایی که میانهٔ درصد جذب صفر است (مقایسه با میانه معنا ندارد)، رکوردی که جذبش بیشتر از صفر ولی کمتر از آستانهٔ مطلق است نشان داده می‌شود.</li>
      <li>سطح نمایش (اطلاعاتی/هشدار/بحرانی)، حداقل‌ها و روشن/خاموش‌بودن هر کنترل از منوی تنظیمات ← «پایش صفرها» قابل تغییر است. مقادیر پیش‌فرض «استاندارد قانونی» نیستند.</li>
    </ul></details>
  </section>`;
}

export function renderFinance(ctx){
  currentFinanceCtx = ctx;
  /* بازشوهای منتقل‌شده به body از رندر قبلی نباید باقی بمانند. */
  document.querySelectorAll("body > [data-fin-panel]").forEach(el=>el.remove());
  const container = document.getElementById("viewContainer");
  if(!container) return;
  const days = ctx.periodDays || window.__REPORT_DAYS || 0;
  /* فیلتر نیروی مسلح و شهر/روستا (کلیدهای همین تب) پیش از تحلیل اعمال می‌شود */
  const scoped = scopeRows(ctx.rows || [], {armed:ui.armed, settlement:ui.settlement});
  const res = analyzeFinance(scoped, {days, tag:ui.armed+"|"+ui.settlement});
  const cfg = res.cfg;
  const opt = optionLists(res);
  if(ui.area && !opt.areas.includes(ui.area)){ ui.area = ""; ui.city = ""; }
  const cities = ui.area ? opt.citiesOf(ui.area) : [];
  if(ui.city && !cities.includes(ui.city)) ui.city = "";
  ui.usages = ui.usages.filter(u=>opt.usages.includes(u));

  const v = buildFinView(res, ui);
  const errBanner = res.errors && res.errors.length ? `<div class="fin-err" role="alert">${res.errors.map(e=>esc(e.message)).join(" · ")}</div>` : "";
  const dq = res.dq || {};
  const notes = [];
  if(!(days>0)) notes.push("طول دوره نامشخص است؛ دوره وصول مطالبات محاسبه نشد.");
  notes.push(`نیروی مسلح: ${ARMED[ui.armed].label}`, `نوع سکونتگاه: ${SETTLEMENT[ui.settlement].label}`);

  const mainCardIds = new Set(CARD_DEFS.map(d=>d.id));
  const cards = CARD_DEFS.map(d=>{
    const n = d.id==="any" ? v.counts.any : d.id==="good" ? v.counts.good : v.counts.by[d.id];
    const sev = d.id==="good" ? "good" : (v.counts.cardSev[d.id]||0);
    return `<button type="button" class="fin-card fin-c-${sev} ${ui.problem===d.id?"on":""}" data-fin-card="${d.id}" aria-pressed="${ui.problem===d.id}">
      ${finIco(d.id)}<span class="fin-card-n">${faN(n)}</span><span class="fin-card-l">${esc(d.label)}</span><span class="fin-card-h">${esc(d.hint||"")}</span></button>`;
  }).join("");
  const smallCards = PROBLEM_FILTERS.filter(p=>!mainCardIds.has(p.id)).map(p=>{
    const n = v.counts.by[p.id]||0;
    const sev = v.counts.cardSev[p.id]||0;
    return `<button type="button" class="fin-card fin-card-sm fin-c-${sev} ${ui.problem===p.id?"on":""}" data-fin-card="${p.id}" aria-pressed="${ui.problem===p.id}">
      ${finIco(p.id)}<span class="fin-card-n">${faN(n)}</span><span class="fin-card-l">${esc(p.label)}</span></button>`;
  }).join("");

  const problemOpts = [["","همه"],["any","دارای حداقل یک مشکل"],["good","عملکرد مطلوب"], ...PROBLEM_FILTERS.map(p=>[p.id,p.label])];
  const sevOpts = [["","همه"],["1","🟡 هشدار"],["2","🟠 مهم"],["3","🔴 بحرانی"]];
  /* نوار فیلتر: کلیدهای سه‌حالته · امور و کاربری (بازشو + پاک‌کن دقیقاً مثل هوم) · نوع مشکل و شدت · چیپ‌های شهر */
  const dropBtn = (kind, label, panelHtml, active, clearTitle) => `<div class="filter-pair">
    <div class="filter-btn-wrap"><button type="button" class="filter-dropdown-btn ${ui.openDrop===kind?"open":""}" data-fin-toggle="${kind}" aria-haspopup="listbox" aria-expanded="${ui.openDrop===kind}"><span>${esc(label)}</span><i data-lucide="chevron-down" class="chev"></i></button>
    <div class="filter-dropdown ${kind==="usage"?"usage-dropdown":""} ${ui.openDrop===kind?"":"hidden"}" data-fin-panel="${kind}" role="listbox">${panelHtml}</div></div>
    <button type="button" class="clear-btn ${active?"active":""}" data-fin-clear="${kind}" title="${clearTitle}" aria-label="${clearTitle}" ${active?"":"disabled"}><i data-lucide="eraser"></i></button>
  </div>`;
  const areaPanel = `<div class="dropdown-list">${opt.areas.map(a=>`<button type="button" class="dropdown-item ${ui.area===a?"selected":""}" data-fin-pick="area" data-v="${esc(a)}">${esc(shortArea(a))}</button>`).join("")||`<span class="fin-fempty">موردی نیست</span>`}</div>`;
  const usagePanel = `<div class="usage-grid">${opt.usages.map(u=>`<button type="button" class="usage-item ${ui.usages.includes(u)?"selected":""}" data-fin-pick="usage" data-v="${esc(u)}">${esc(u)}</button>`).join("")||`<span class="fin-fempty">موردی نیست</span>`}</div>`;
  const selPill = (name, options, cur) => `<div class="filter-pair"><select class="fin-pill" data-fin="${name}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(cur)===String(v)?"selected":""}>${esc(t)}</option>`).join("")}</select></div>`;
  const cityBox = ui.area ? `<div class="citysub-inline"><div class="citysub-head"><span>شهر و بخش‌های <b>${esc(shortArea(ui.area))}</b></span>
      <button type="button" class="clear-btn ${ui.city?"active":""}" data-fin-clear="city" title="حذف انتخاب شهر/بخش" aria-label="حذف انتخاب شهر/بخش" ${ui.city?"":"disabled"}><i data-lucide="eraser"></i></button></div>
      <div class="citysub-chips">${cities.map(c=>`<button type="button" class="citysub-chip ${ui.city===c?"selected":""}" data-fin-city="${esc(c)}">${esc(c)}</button>`).join("")||`<span class="fin-fempty">شهری نیست</span>`}</div></div>` : "";
  const filters = `<section class="map-filters-bar card fin-filterbar">
    ${scopeButtonsHtml({armed:ui.armed, settlement:ui.settlement}, "data-fin-scope")}
    <div class="filters-row filters-row-area">
      ${dropBtn("area", ui.area?shortArea(ui.area):"همه امور", areaPanel, !!ui.area, "حذف انتخاب امور")}
      ${dropBtn("usage", ui.usages.length===1?ui.usages[0]:(ui.usages.length?faN(ui.usages.length)+" کاربری":"فیلتر کاربری"), usagePanel, !!ui.usages.length, "حذف انتخاب کاربری")}
    </div>
    <div class="filters-row filters-row-area">
      ${selPill("problem", problemOpts, ui.problem)}
      ${selPill("severity", sevOpts, ui.severity)}
    </div>
    ${cityBox}
  </section>`;

  const title = ui.problem ? (ui.problem==="any"?"موارد نیازمند بررسی":ui.problem==="good"?"موارد عملکرد مطلوب":FILTER_BY_ID[ui.problem].label) : "همهٔ رکوردها";
  container.innerHTML = `<div class="fin-root">
    <header class="fin-head"><h2>تحلیل مالی و عملکردی</h2>
      <p class="fin-sub">تشخیص سریع مشکل مالی: مشکل چیست، شدت آن چقدر است و الگوی فروش/وصول/بدهی چیست. مقایسه با گروه مشابه (کاربری مشابه در شهر ← امور ← استان) است؛ موارد «نیازمند بررسی»اند و حکم قطعی نیستند. نیروهای مسلح با کلید بالای صفحه کنترل می‌شوند (پیش‌فرض: بدون نیروی مسلح).</p></header>
    ${errBanner}
    ${filters}
    <section class="fin-panel"><h3>وضعیت کلی مالی <small>${faN(v.scopeCount)} رکورد در محدودهٔ انتخابی</small></h3>${statusBlock(v)}</section>
    <div class="fin-cards">${cards}</div>
    ${smallCards?`<div class="fin-cards fin-cards-sm">${smallCards}</div>`:""}
    <div class="fin-zw-toggle"><label class="rp-switch" title="نمایش یا مخفی‌کردن بخش پایش صفرها"><input type="checkbox" data-fin-zw-enabled ${getSetting("zw.enabled")!==false?"checked":""}><span class="rp-track"></span><span class="fin-zw-toggle-lbl">نمایش پایش صفرها</span></label></div>
    ${zwBlock(res, v)}
    <section class="fin-panel"><h3>علت‌های اصلی مشکلات</h3>${causesBlock(v)}</section>
    <section class="fin-panel"><h3>${faN(cfg.topN)} مورد مهم برای بررسی <small>اولویت مدیریتی، نه قضاوت قطعی</small></h3>${topBlock(v)}</section>
    <section class="fin-panel"><div class="fin-panel-head"><h3>Drill Down <small>استان ← امور ← شهر ← کاربری</small></h3>${(ui.area||ui.city||ui.usages.length)?`<button type="button" class="fin-back" data-fin-back title="بازگشت به سطح قبلی">← بازگشت</button>`:""}</div>${drillBlock(v)}</section>
    <section class="fin-panel"><div class="fin-panel-head"><h3>جدول جزئیات — ${esc(title)}</h3><div class="fin-panel-tools"><span class="fin-count">${faN(v.matched)} مورد</span>${(ui.area||ui.city||ui.usages.length)?`<button type="button" class="fin-back" data-fin-back title="بازگشت به سطح قبلی">← بازگشت</button>`:""}</div></div>
      <div class="fin-tools"><label>مرتب‌سازی <select data-fin="sort">${SORT_OPTIONS.map(([id,t])=>`<option value="${id}" ${ui.sort===id?"selected":""}>${t}</option>`).join("")}</select></label></div>
      ${tableBlock(v,cfg)}</section>
    <details class="fin-help"><summary>راهنمای شاخص‌ها و محدودیت‌ها</summary><ul>
      <li><b>درصد جذب</b> = وصول ÷ فروش × ۱۰۰ (فروش صفر ← فاقد محاسبه).</li>
      <li><b>دوره وصول مطالبات</b> = ((بدهی اول + بدهی پایان) ÷ ۲ ÷ فروش) × روز دوره. شاخص ریسک وصول است، نه اثبات علت؛ با فروش صفر/منفی یا میانگین بدهی منفی محاسبه نمی‌شود.</li>
      <li><b>رشد بدهی</b>: جمع مانده‌ها در همهٔ سطوح جبری است (مثبت و منفی با هم). بدهی اول مثبت و معنادار ← درصد رشد استاندارد؛ بدهی اول صفر/ناچیز ← «ایجاد بدهی جدید» (بدون درصد). در کاربری «آزاد و بنایی» مانده منفی = پیش‌دریافت است: تغییر در محدودهٔ منفی = «تغییر حجم پیش‌دریافت» و گذار از منفی به مثبت = «استهلاک پیش‌دریافت + ایجاد بدهی جدید» که به‌عنوان افزایش ریسک وصول تحلیل می‌شود. در سایر کاربری‌ها مانده اول منفی ≈ اصلاحات صورتحساب/واریز مازاد قبلی است و نرخ رشد با قدرمطلق بدهی اول محاسبه می‌شود. پیش‌دریافت و بدهی واقعی با هم تهاتر نمی‌شوند.</li>
      <li><b>قیمت متوسط فروش</b> = فروش ÷ مصرف. قیمت بالا فقط اطلاع است و مشکل حساب نمی‌شود.</li>
      <li><b>آستانه‌ها</b> از توزیع گروه مشابه (P10/P25/میانه/P75/P90) گرفته می‌شود؛ گروه با نمونهٔ کم به سطح بالاتر برمی‌گردد. مقادیر پیش‌فرض «استاندارد قانونی» نیستند و از منوی تنظیمات ← «تحلیل مالی و عملکردی» قابل تغییرند.</li>
      <li><b>شدت</b>: 🟡 هشدار = چند انحراف قابل‌توجه هم‌زمان · 🟠 مهم = انحراف شدید · 🔴 بحرانی = انحراف بسیار شدید همراه با مشکل‌های دیگر یا ترکیب چند مشکل.</li>
      <li>موارد «زیرنظر» = تک‌سیگنالِ هشدار بدون تأیید؛ به‌صورت پیش‌فرض مشکل حساب نمی‌شود (قابل تغییر از تنظیمات).</li>
    </ul></details>
    <p class="fin-foot">${[
      dq.disabledRows?`ردیف کاربری‌های غیرفعال‌شده در تنظیمات: ${faN(dq.disabledRows)}`:"",
      `رکورد با مشترک صفر: ${faN(dq.zeroCustomers||0)}`, dq.negativeSales?`رکورد با فروش منفی: ${faN(dq.negativeSales)}`:"", ...notes].filter(Boolean).map(esc).join(" · ")}</p>
  </div>`;
  bind(container, ctx, v);
}

/* ───────── بازشوی امور/کاربری: fixed و زیر خود کلید؛ با کلیک بیرون / Esc بسته می‌شود ───────── */
function placeDrop(root){
  if(!ui.openDrop) return;
  const btn = root.querySelector(`[data-fin-toggle="${ui.openDrop}"]`);
  let dd = root.querySelector(`[data-fin-panel="${ui.openDrop}"]`);
  if(!btn || !dd || dd.classList.contains("hidden")) return;
  /* انتقال به body تا containing-block والد (transform/overflow) موقعیت fixed را خراب نکند */
  if(dd.parentElement !== document.body) document.body.appendChild(dd);
  const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight, m = 8, r = btn.getBoundingClientRect();
  dd.style.position = "fixed"; dd.style.width = ""; dd.style.maxHeight = "";
  const dw = Math.min(ui.openDrop==="usage" ? 320 : Math.max(r.width, 200), vw - m*2);
  dd.style.width = dw + "px";
  const left = Math.max(m, Math.min(r.right - dw, vw - dw - m));            // لبه راست بازشو هم‌تراز لبه راست دکمه (RTL)
  const spaceBelow = vh - r.bottom - m - 6, spaceAbove = r.top - m - 6;
  const natural = Math.min(dd.scrollHeight + 2, 360);
  const openUp = natural > spaceBelow && spaceAbove > spaceBelow;
  const room = Math.max(120, openUp ? spaceAbove : spaceBelow);
  dd.style.maxHeight = Math.min(360, room) + "px";
  const h = Math.min(natural, room);
  dd.style.left = left + "px"; dd.style.right = "auto";
  dd.style.top = (openUp ? Math.max(m, r.top - h - 6) : r.bottom + 6) + "px";
  dd.style.zIndex = "400";
}
function setDrop(root, kind){
  ui.openDrop = (kind && ui.openDrop!==kind) ? kind : null;
  /* پنل‌هایی که به body منتقل شده‌اند را هم پوشش بده */
  document.querySelectorAll("[data-fin-panel]").forEach(d=>{
    const on = d.getAttribute("data-fin-panel")===ui.openDrop;
    d.classList.toggle("hidden", !on);
    if(!on && d.parentElement===document.body){
      const wrap = root.querySelector(`[data-fin-toggle="${d.getAttribute("data-fin-panel")}"]`)?.closest(".filter-btn-wrap");
      if(wrap) wrap.appendChild(d);
    }
  });
  root.querySelectorAll("[data-fin-toggle]").forEach(b=>{ const on = b.getAttribute("data-fin-toggle")===ui.openDrop; b.classList.toggle("open",on); b.setAttribute("aria-expanded",String(on)); });
  placeDrop(root);
}
let finOutsideBound = false;
function bindFinOutsideOnce(){
  if(finOutsideBound) return; finOutsideBound = true;
  const inside = t => t && t.closest && (t.closest("[data-fin-panel]") || t.closest("[data-fin-toggle]"));
  const root = () => document.querySelector(".fin-root");
  const close = e => { const r = root(); if(r && ui.openDrop && document.body.classList.contains("finance-view") && !inside(e.target)) setDrop(r,null); };
  document.addEventListener("pointerdown", close, true);
  document.addEventListener("keydown", e=>{ const r = root(); if(e.key==="Escape" && r && ui.openDrop) setDrop(r,null); });
  const reposition = e => { const r = root(); if(!r || !ui.openDrop) return; if(e && e.target && e.target.closest && e.target.closest("[data-fin-panel]")) return; placeDrop(r); };
  addEventListener("resize", reposition);
  addEventListener("orientationchange", reposition);
  addEventListener("scroll", reposition, true);
}

function handleFinanceFilterPick(e){
  if(!document.body.classList.contains("finance-view") || !currentFinanceCtx) return;
  const t = e.target;
  const pk = t.closest && t.closest("[data-fin-pick]");
  const rerender = () => renderFinance(currentFinanceCtx);
  const keepScroll = fn => { const y = window.scrollY; fn(); window.scrollTo(0,y); };
  const reset = () => { ui.openKey = null; ui.limit = 0; };
  if(pk){
    const k = pk.getAttribute("data-fin-pick"), val = pk.getAttribute("data-v");
    if(k==="area"){
      /* امور: فقط یک انتخاب و بلافاصله بستن منو */
      ui.area = ui.area===val ? "" : val;
      ui.city = "";
      ui.openDrop = null;
    }else if(k==="usage"){
      /* کاربری: چندانتخابی؛ منو باز می‌ماند */
      const i = ui.usages.indexOf(val);
      if(i>=0) ui.usages.splice(i,1); else ui.usages.push(val);
    }
    reset(); return keepScroll(rerender);
  }
  const cl = t.closest && t.closest("[data-fin-clear]");
  if(cl){
    const k = cl.getAttribute("data-fin-clear");
    if(k==="area"){ ui.area = ""; ui.city = ""; }
    else if(k==="usage"){ ui.usages = []; }
    else ui[k] = "";
    ui.openDrop = null; reset(); return keepScroll(rerender);
  }
}

function bind(container, ctx, v){
  const root = container.querySelector(".fin-root");
  bindFinOutsideOnce();
  const rerender = () => renderFinance(ctx);
  const keepScroll = fn => { const y = window.scrollY; fn(); window.scrollTo(0,y); };
  const reset = () => { ui.openKey = null; ui.limit = 0; };
  root.addEventListener("change", e=>{
    const zwInp = e.target.closest("input[data-fin-zw-enabled]");
    if(zwInp){ setSetting("zw.enabled", !!zwInp.checked); return keepScroll(rerender); }
    const el = e.target.closest("[data-fin]"); if(!el) return;
    const k = el.getAttribute("data-fin");
    ui[k] = el.value;
    reset();
    keepScroll(rerender);
  });
  if(!finPickBound){
    finPickBound = true;
    document.addEventListener("click", e=>{
      if(!document.body.classList.contains("finance-view")) return;
      const r = document.querySelector(".fin-root");
      if(!r || !currentFinanceCtx) return;
      handleFinanceFilterPick(e);
    });
  }

  root.addEventListener("click", e=>{
    const t = e.target;
    /* کلیدهای سه‌حالتهٔ نیروی مسلح / شهر و روستا */
    const sc = t.closest("[data-fin-scope]");
    if(sc){
      const k = sc.getAttribute("data-fin-scope");
      if(k==="armed") ui.armed = nextOf(ARMED_ORDER, ui.armed); else ui.settlement = nextOf(SETTLEMENT_ORDER, ui.settlement);
      if(k==="area") ui.openDrop = null; reset(); return keepScroll(rerender);
    }
    const tg = t.closest("[data-fin-toggle]");
    if(tg){ e.stopPropagation(); return setDrop(root, tg.getAttribute("data-fin-toggle")); }
    const cb = t.closest("[data-fin-city]");
    if(cb){ const c = cb.getAttribute("data-fin-city"); ui.city = ui.city===c ? "" : c; reset(); return keepScroll(rerender); }
    if(t.closest("[data-fin-back]")){      /* یک سطح بالاتر: کاربری ← شهر ← امور */
      if(ui.usages.length) ui.usages = []; else if(ui.city) ui.city = ""; else if(ui.area) ui.area = "";
      reset(); return keepScroll(rerender);
    }
    /* بخش «پایش صفرها»: کارت‌ها و «نمایش بیشتر» (مستقل از فیلتر نوع مشکل) */
    const zc = t.closest("[data-zw-card]");
    if(zc){ const id = zc.getAttribute("data-zw-card"); ui.zwTag = (!id || ui.zwTag===id) ? "" : id; ui.zwLimit = 0; return keepScroll(rerender); }
    const zm = t.closest("[data-zw-more]");
    if(zm){ ui.zwLimit = Number(zm.getAttribute("data-zw-more")) || 0; return keepScroll(rerender); }
    const card = t.closest("[data-fin-card]");
    if(card){ const id = card.getAttribute("data-fin-card"); ui.problem = ui.problem===id ? "" : id; reset(); return keepScroll(rerender); }
    const pb = t.closest("[data-fin-problem]");
    if(pb){ const id = pb.getAttribute("data-fin-problem"); ui.problem = ui.problem===id ? "" : id; reset(); return keepScroll(rerender); }
    const cr = t.closest("[data-fin-crumb]");
    if(cr){
      const k = cr.getAttribute("data-fin-crumb");
      if(k==="province"){ ui.area = ""; ui.city = ""; ui.usages = []; }
      else if(k==="area"){ ui.city = ""; ui.usages = []; }
      else if(k==="city"){ ui.usages = []; }
      reset(); return keepScroll(rerender);
    }
    const dr = t.closest("[data-fin-drill]");
    if(dr){
      const name = dr.getAttribute("data-fin-drill");
      if(v.level==="area"){ ui.area = name; ui.city = ""; ui.usages = []; }
      else if(v.level==="city"){ ui.city = name; ui.usages = []; }
      else { ui.usages = [name]; const leaf = v.scope.find(l=>l.usage===name); ui.openKey = leaf ? leaf.key : null; }
      if(v.level!=="usage") ui.openKey = null;
      ui.limit = 0; return keepScroll(rerender);
    }
    const go = t.closest("[data-fin-goto]");
    if(go){
      const k = go.getAttribute("data-fin-goto"); const leaf = v.top.find(l=>l.key===k) || v.scope.find(l=>l.key===k);
      if(leaf){ ui.area = leaf.area; ui.city = leaf.city; ui.usages = [leaf.usage]; ui.openKey = leaf.key; ui.limit = 0; ui.problem = ""; ui.severity = ""; rerender(); root.ownerDocument.querySelector(".fin-main-table")?.scrollIntoView({behavior:"smooth",block:"start"}); }
      return;
    }
    if(t.closest("[data-fin-more]")){ ui.limit = (ui.limit || v.cfg.tableLimit) + v.cfg.tableLimit; return keepScroll(rerender); }
    const shareBtn = t.closest("[data-fin-share-key], [data-fin-share]");
    if(shareBtn){
      e.preventDefault();
      e.stopPropagation();
      const key = shareBtn.getAttribute("data-fin-share-key");
      const leaf = key
        ? (v.rows?.find(x=>x.key===key) || v.scope?.find(x=>x.key===key) || v.top?.find(x=>x.key===key))
        : null;
      const txt = leaf ? buildShareText(leaf) : (shareBtn.getAttribute("data-fin-share") || "");
      if(!txt) return;
      const labelShare = "↗ شیر کارت";
      const flash = msg => { shareBtn.textContent = msg; setTimeout(()=>{ shareBtn.textContent = labelShare; }, 1800); };
      const doCopy = () => {
        const done = ok => flash(ok ? "✓ کارت کپی شد" : "کپی نشد");
        if(navigator.clipboard?.writeText){
          navigator.clipboard.writeText(txt).then(()=>done(true)).catch(()=>{
            try{
              const ta = document.createElement("textarea");
              ta.value = txt; ta.setAttribute("readonly",""); ta.style.cssText="position:fixed;left:-9999px;top:0";
              document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length);
              const ok = document.execCommand("copy");
              document.body.removeChild(ta);
              done(ok);
            }catch{ done(false); }
          });
          return;
        }
        try{
          const ta = document.createElement("textarea");
          ta.value = txt; ta.setAttribute("readonly",""); ta.style.cssText="position:fixed;left:-9999px;top:0";
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length);
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          done(ok);
        }catch{ done(false); }
      };
      /* Web Share باید هم‌زمان با gesture کاربر صدا زده شود (Chrome اندروید / HTTPS) */
      if(typeof navigator!=="undefined" && typeof navigator.share==="function"){
        const data = {title:"تحلیل مالی", text:txt};
        const tryShare = () => {
          /* canShare اختیاری است؛ بعضی مرورگرها بدون آن بهتر کار می‌کنند */
          if(typeof navigator.canShare==="function"){
            try{ if(!navigator.canShare(data)){ doCopy(); return; } }catch{ /* ignore */ }
          }
          navigator.share(data).then(()=>flash("✓ ارسال شد")).catch(err=>{
            /* AbortError = کاربر منو را بست → کپی نکن */
            if(err && (err.name==="AbortError" || err.name==="NotAllowedError")) return;
            doCopy();
          });
        };
        tryShare();
      } else {
        doCopy();
      }
      return;
    }
    const row = t.closest("[data-fin-row]");
    if(row){
      const k = row.getAttribute("data-fin-row");
      ui.openKey = ui.openKey===k ? null : k;
      const w = container.querySelector(".fin-main-table")?.parentElement; const sl = w ? w.scrollLeft : 0, st = w ? w.scrollTop : 0;
      keepScroll(rerender);
      const w2 = container.querySelector(".fin-main-table")?.parentElement; if(w2){ w2.scrollLeft = sl; w2.scrollTop = st; }
    }
  });
  placeDrop(root);
}
