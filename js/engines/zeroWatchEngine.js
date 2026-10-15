/* موتور «پایش صفرها» (فروش صفر / وصول صفر) — مستقل و غیرمخرب.
   ─ ورودی: خروجی analyzeFinance (res.leaves). هیچ فیلدی از رکوردها را تغییر نمی‌دهد و چیزی به problems/severity/cause/score اضافه نمی‌کند؛
     نتیجه فقط در ساختار جداگانهٔ خودش (Map) نگه‌داری می‌شود. بنابراین امتیاز، رتبه‌بندی، «موارد مهم»، علت غالب، شمارش کارت‌ها و فرمول‌های موجود دست‌نخورده می‌مانند.
   ─ تنها استثنا: کلید «zw.guardLink» (پیش‌فرض روشن) که به‌صورت اختیاری محافظ میانهٔ صفر را به تشخیص «ضعف وصول» فعلی وصل می‌کند (در financeEngine.js، فقط وقتی روشن باشد).
   ─ همهٔ تنظیم‌ها در گروه جداگانهٔ «پایش صفرها» در منوی همبرگری هستند (پیشوند zw.). مقادیر پیش‌فرض «استاندارد قانونی» نیستند.
   ─ افزودن کنترل جدید: یک مدخل به ZW_CONTROLS (با test) — تنظیم‌های روشن/خاموش و سطح نمایش آن خودکار در منو ظاهر می‌شود. */
import {registerGroup, registerSetting, get as S} from "../settings/settings.js";

const isNum = v => typeof v === "number" && Number.isFinite(v);

/* سطح نمایش: ۱ اطلاعاتی · ۲ هشدار · ۳ بحرانی */
export const ZW_LEVELS = {
  1:{id:"info", label:"اطلاعاتی", icon:"🔵"},
  2:{id:"warn", label:"هشدار",    icon:"🟡"},
  3:{id:"crit", label:"بحرانی",   icon:"🔴"}
};

/* test(l, c): l = رکورد (امور+شهر+کاربری) با شاخص‌های محاسبه‌شده؛ c = تنظیمات جاری این بخش */
export const ZW_CONTROLS = [
  {id:"salesZero",        label:"فروش صفر",                      hint:"فروش دوره = ۰",                    level:1, test:l => l.sales === 0},
  {id:"collZero",         label:"وصول صفر",                      hint:"وصول دوره = ۰ (با هر فروش)",       level:1, test:l => l.collection === 0},
  {id:"salesPosCollZero", label:"فروش مثبت + وصول صفر",          hint:"فروش > ۰ ولی هیچ وصولی نشده",      level:2, test:l => l.sales > 0 && l.collection === 0},
  {id:"salesZeroDebtPos", label:"فروش صفر + بدهی مثبت",          hint:"فروش = ۰ ولی بدهی پایان > ۰",      level:2, test:l => l.sales === 0 && l.debtEnd > 0},
  {id:"bothZero",         label:"فروش و وصول صفر",               hint:"هر دو = ۰ (با مشترک فعال)",        level:1, test:l => l.sales === 0 && l.collection === 0},
  {id:"highDebtCollZero", label:"بدهی بالا با وصول صفر",         hint:"وصول = ۰ و بدهی پایان ≥ آستانه",   level:3, test:(l,c) => l.collection === 0 && l.debtEnd >= c.highDebt},
  {id:"lowAbsorbMedianZero", label:"جذب پایین در گروه با میانهٔ صفر", hint:"درصد جذب > ۰ ولی کمتر از آستانه؛ فقط وقتی میانهٔ گروه مشابه صفر است", level:2, needsGroup:true,
    test:(l,c,g) => g && g.med === 0 && isNum(l.absorb) && l.absorb > 0 && l.absorb < c.guardWarnBelow}
];
export const ZW_BY_ID = Object.fromEntries(ZW_CONTROLS.map(x=>[x.id,x]));

/* ───────── تنظیم‌ها (گروه جدا در منوی همبرگری) ───────── */
registerGroup({id:"zerowatch", label:"پایش صفرها (فروش صفر / وصول صفر)", order:9});
const SEC_MAIN = "کلیدهای کلی";
registerSetting({id:"zw.enabled", group:"zerowatch", section:SEC_MAIN,
  sectionNote:"«پایش صفرها» یک بخش مستقل در تب تحلیل مالی است و روی امتیاز، رتبه‌بندی، فرمول‌های موجود، «موارد مهم» و علت غالب اثر ندارد (جز کلید اختیاری اتصال محافظ، پیش‌فرض روشن). مقادیر پیش‌فرض «استاندارد قانونی» نیستند.",
  label:"نمایش بخش پایش صفرها در تب مالی", type:"bool", default:true});

ZW_CONTROLS.forEach((c,i)=>registerSetting({id:`zw.on.${c.id}`, group:"zerowatch",
  ...(i===0 ? {section:"فعال/غیرفعال کردن کنترل‌ها", sectionNote:"هر کنترل مستقل روشن یا خاموش می‌شود. یک رکورد می‌تواند چند برچسب بگیرد ولی در شمارش کل یک بار حساب می‌شود."} : {section:"فعال/غیرفعال کردن کنترل‌ها"}),
  label:c.label, type:"bool", default:true}));

ZW_CONTROLS.forEach((c,i)=>registerSetting({id:`zw.level.${c.id}`, group:"zerowatch",
  ...(i===0 ? {section:"نحوهٔ نمایش هر کنترل", sectionNote:"۱ = اطلاعاتی · ۲ = هشدار · ۳ = بحرانی. سطح هر رکورد = بالاترین سطح برچسب‌هایش."} : {section:"نحوهٔ نمایش هر کنترل"}),
  label:`سطح نمایش — ${c.label} (۱ اطلاعاتی · ۲ هشدار · ۳ بحرانی)`, default:c.level, min:1, max:3, step:1}));

registerSetting({id:"zw.minCustomers", group:"zerowatch", section:"حداقل‌ها",
  sectionNote:"این حداقل‌ها فقط مخصوص همین بخش‌اند و از «حداقل حجم مالی» تشخیص مشکل (fin.minMaterial) جدا هستند؛ تغییرشان روی تشخیص فعلی اثر ندارد. بدون حداقل مشترک، رکوردهای کاملاً خالی (مشترک و مبلغ صفر) هم صفر حساب می‌شوند.",
  label:"حداقل تعداد مشترک فعال برای هشدار", default:1, min:0, max:100000, step:1});
registerSetting({id:"zw.minAmount", group:"zerowatch", section:"حداقل‌ها",
  label:"حداقل مبلغ برای هشدار (بزرگ‌ترین مقدار از |فروش|، |بدهی اول| و |بدهی پایان|) — صفر = همه", default:20000000, min:0, max:1e13, step:10000000, unit:"ریال"});
registerSetting({id:"zw.highDebt", group:"zerowatch", section:"حداقل‌ها",
  label:"آستانهٔ «بدهی بالا» برای کنترل «بدهی بالا با وصول صفر» (بدهی پایان دوره ≥)", default:1000000000, min:0, max:1e13, step:100000000, unit:"ریال"});

registerSetting({id:"zw.guardWarnBelow", group:"zerowatch", section:"محافظ میانهٔ صفر (کنترل هفتم)",
  sectionNote:"در گروه‌هایی که میانهٔ درصد جذب صفر است (مثل فضای سبز و سایر کاربری‌های خاص) مقایسه با میانه معنا ندارد و وصول صفر «عادی» حساب می‌شود. این کنترل فقط برای همین گروه‌ها از آستانهٔ مطلق درصد جذب استفاده می‌کند. گروه مشابه همان قاعدهٔ تب (کاربری در شهر ← امور ← استان، حداقل نمونه fin.minGroup) است.",
  label:"درصد جذب کمتر از این مقدار (و بیشتر از صفر) = جذب پایین", default:85, min:1, max:100, step:1, unit:"٪"});
registerSetting({id:"zw.guardLink", group:"zerowatch", section:"اتصال اختیاری محافظ به تشخیص فعلی (پیش‌فرض روشن)",
  sectionNote:"هشدار: این کلید تنها مورد این بخش است که خروجی‌های موجود را عوض می‌کند (مشکل‌ها، شدت، علت غالب و شمارش‌ها در گروه‌های با میانهٔ صفر). خاموش = هیچ اثری روی موارد موجود.",
  label:"اتصال محافظ میانهٔ صفر به تشخیص «ضعف وصول» فعلی", type:"bool", default:true});
registerSetting({id:"zw.guardCritBelow", group:"zerowatch", section:"اتصال اختیاری محافظ به تشخیص فعلی (پیش‌فرض روشن)",
  label:"فقط وقتی کلید بالا روشن است: درصد جذب کمتر از این مقدار = انحراف بسیار شدید (سطح ۳ «ضعف وصول»)", default:70, min:1, max:100, step:1, unit:"٪"});

registerSetting({id:"zw.tableLimit", group:"zerowatch", section:"نمایش",
  label:"تعداد ردیف جدول پایش صفرها در هر نوبت نمایش", default:50, min:10, max:2000, step:10});

/** تنها نقطهٔ خواندن تنظیم‌های این بخش */
export function readZwConfig(){
  const n = (id,d) => { const v = S(id); return Number.isFinite(v) ? v : d; };
  const on = {}, level = {};
  ZW_CONTROLS.forEach(c=>{
    on[c.id] = S(`zw.on.${c.id}`) !== false;
    level[c.id] = Math.min(3, Math.max(1, Math.round(n(`zw.level.${c.id}`, c.level))));
  });
  return {
    enabled: S("zw.enabled") !== false, on, level,
    minCustomers: Math.max(0, n("zw.minCustomers",1)), minAmount: Math.max(0, n("zw.minAmount",2e7)), highDebt: Math.max(0, n("zw.highDebt",1e9)),
    guardWarnBelow: n("zw.guardWarnBelow",85), guardCritBelow: n("zw.guardCritBelow",70), guardLink: S("zw.guardLink") !== false,
    tableLimit: Math.max(10, Math.round(n("zw.tableLimit",50))),
    minGroup: Math.max(3, Math.round(n("fin.minGroup",8)))          // همان حداقل نمونهٔ گروه مشابه تب مالی (فقط خواندن)
  };
}

/* ───────── گروه مشابه برای کنترل هفتم (همان قاعدهٔ financeEngine، فقط برای درصد جذب) ───────── */
function quantile(sorted, p){
  const n = sorted.length; if(!n) return null;
  if(n === 1) return sorted[0];
  const pos = (n-1)*p/100, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi]-sorted[lo])*(pos-lo);
}
const LEVEL_NAMES = ["شهر","امور","استان"];
function absorbGroups(leaves, minGroup){
  const maps = [new Map(), new Map(), new Map()];
  for(const l of leaves){
    if(l.belowMin || !isNum(l.absorb)) continue;                 // مثل buildGroups: فقط رکوردهای با حجم کافی و مقدار معتبر
    const ks = [l.area+"|"+l.city+"|"+l.usage, l.area+"|"+l.usage, l.usage];
    ks.forEach((k,i)=>{ let a = maps[i].get(k); if(!a){ a = []; maps[i].set(k,a); } a.push(l.absorb); });
  }
  maps.forEach(m=>m.forEach(a=>a.sort((x,y)=>x-y)));
  return l => {
    const ks = [l.area+"|"+l.city+"|"+l.usage, l.area+"|"+l.usage, l.usage];
    for(let i=0;i<3;i++){
      const a = maps[i].get(ks[i]);
      if(a && a.length >= minGroup) return {med:quantile(a,50), level:LEVEL_NAMES[i], n:a.length};
    }
    return null;
  };
}

/* ───────── تحلیل: Map کلید رکورد → {tags, level, group} ───────── */
const memo = new WeakMap();
export function analyzeZeroWatch(res){
  const c = readZwConfig();
  const key = JSON.stringify(c);
  const hit = memo.get(res);
  if(hit && hit.key === key) return hit.out;
  const byKey = new Map();
  const out = {cfg:c, byKey};
  if(c.enabled && res && Array.isArray(res.leaves)){
    const active = ZW_CONTROLS.filter(x=>c.on[x.id]);
    const groupOf = active.some(x=>x.needsGroup) ? absorbGroups(res.leaves, c.minGroup) : null;
    for(const l of res.leaves){
      if(!(l.customers >= c.minCustomers)) continue;
      const amount = Math.max(Math.abs(l.sales||0), Math.abs(l.debtStart||0), Math.abs(l.debtEnd||0));
      if(amount < c.minAmount) continue;
      const g = groupOf ? groupOf(l) : null;
      const tags = [];
      for(const x of active) if(x.test(l, c, g)) tags.push(x.id);
      if(!tags.length) continue;
      byKey.set(l.key, {tags, level:Math.max(...tags.map(t=>c.level[t])), group:g});
    }
  }
  memo.set(res, {key, out});
  return out;
}

/** نمای فیلترشده برای نمایش: scopeLeaves = رکوردهای محدودهٔ انتخابیِ بالای صفحه (v.scope)؛ tag = فیلتر کارت ("" = همه) */
export function buildZwView(zw, scopeLeaves, tag=""){
  const c = zw.cfg;
  const items = [];
  for(const l of scopeLeaves){ const z = zw.byKey.get(l.key); if(z) items.push({l, tags:z.tags, level:z.level, group:z.group}); }
  const counts = {}; ZW_CONTROLS.forEach(x=>counts[x.id]=0);
  const levels = {1:0,2:0,3:0};
  for(const it of items){ it.tags.forEach(t=>counts[t]++); levels[it.level]++; }
  const rows = (tag ? items.filter(it=>it.tags.includes(tag)) : items)
    .sort((a,b)=> b.level-a.level || (b.l.debtEnd||0)-(a.l.debtEnd||0));
  return {cfg:c, enabled:c.enabled, total:items.length, counts, levels, rows, matched:rows.length};
}
