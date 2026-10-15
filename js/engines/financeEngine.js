/* موتور «تحلیل مالی و عملکردی» — مستقل از موتور ناهنجاری مصرف و سایر تب‌ها.
   ابزار آماری/مدیریتی است: خروجی‌ها «نیازمند بررسی» هستند، نه حکم قطعی.
   خط لولهٔ محاسبات: Excel → (فیلتر نیروی مسلح و شهر/روستا در نوار اختصاصی تب، قبل از این ماژول) → تجمیع رکورد (امور+شهر+کاربری)
   → فروش/وصول/جذب/بدهی/دوره وصول/قیمت متوسط → تشخیص مشکل‌ها (مقایسه با گروه مشابه) → علت غالب → شدت → امتیاز داخلی.
   همهٔ آستانه‌ها از رجیستری تنظیمات (گروه «تحلیل مالی و عملکردی» در منوی همبرگری) خوانده می‌شوند. */
import {registerGroup, registerSetting, get as S, reset as resetSetting} from "../settings/settings.js";
import {getDatasetVersion} from "../core/datasetState.js";

export const FIN_CONFIG_VERSION = 3;   // v3: منطق رشد بدهی usage-aware (پیش‌دریافت «آزاد و بنایی» / اصلاحات سایر کاربری‌ها) · v2: پیش‌فرض minMaterial از ۱۰۰ به ۲۰ میلیون ریال + تنظیم جدید periodExemptDays
const VERSION_KEY = "finance.analysisConfigVersion";
export const PROVINCE_LABEL = "فارس";
const ARMED_RE = /نیروهای\s*مسلح/;   // فقط برای شمارش اطلاعاتی در dq.armedRows؛ حذف/نگه‌داری را کلید نیروی مسلح تب تعیین می‌کند

/* ───────── تعریف انواع مشکل ───────── */
export const PROBLEMS = [
  {id:"debtGrowth",       label:"رشد بدهی",                      card:"رشد بدهی",        w:"wDebtChange"},
  {id:"weakCollection",   label:"ضعف وصول",                      card:"ضعف وصول",        w:"wWeak"},
  {id:"lowSales",         label:"فروش پایین",                    card:"فروش پایین",      w:"wLowSales"},
  {id:"accumulatedDebt",  label:"بدهی انباشته",                  card:"بدهی انباشته",    w:"wAccum"},
  {id:"highDebtPerCust",  label:"بدهی سرانه بالا",               card:"بدهی سرانه بالا", w:"wDebtPerCust"},
  {id:"highPeriod",       label:"دوره وصول بالا",                card:"دوره وصول بالا",  w:"wPeriod"},
  {id:"debtConcentration",label:"تمرکز بدهی روی مشترک محدود",    card:null,              w:"wDebtPerCust"},
  {id:"stableLowSales",   label:"ثبات ظاهری ناشی از فروش پایین", card:null,              w:"wLowSales"},
  {id:"lowPrice",         label:"قیمت متوسط فروش پایین",         card:null,              w:"wLowSales"}
];
export const PROBLEM_BY_ID = Object.fromEntries(PROBLEMS.map(p=>[p.id,p]));

export const CAUSES = {
  debtConcentration:"تمرکز بدهی روی تعداد محدود مشترک",
  salesAndWeak:"ترکیبی از فروش بالا و ضعف وصول",
  weakCollection:"ضعف وصول",
  accumulatedDebt:"بدهی انباشته",
  salesIncrease:"افزایش فروش",
  stableLowSales:"ثبات ظاهری ناشی از فروش پایین",
  lowSales:"فروش پایین",
  highPeriod:"دوره وصول بالا",
  highDebtPerCust:"بدهی سرانه بالا",
  debtGrowth:"رشد بدهی",
  advanceToDebt:"استهلاک پیش‌دریافت و ایجاد بدهی جدید (افزایش ریسک وصول)",
  lowPrice:"قیمت متوسط فروش پایین",
  goodControl:"کنترل مناسب بدهی"
};
/* علت‌های غالبِ مشتق (نتیجهٔ ترکیب چند مشکل): نوع مشکل مستقل نیستند ولی در «علت‌های اصلی» می‌آیند؛
   برای اینکه فیلتر «نوع مشکل» و «شمارش مشکلات» با «علت‌های اصلی» (۱۲ مورد) کاملاً یکی باشند، به‌صورت فیلتر هم تعریف می‌شوند:
   مورد = رکوردی که مشکل دارد و علت غالبش همین است. */
export const DERIVED_CAUSES = ["salesAndWeak","salesIncrease","advanceToDebt"].map(id=>({id, label:CAUSES[id], derived:true}));
/** همهٔ گزینه‌های «نوع مشکل» = مشکل‌های اصلی + علت‌های مشتق (۱۲ مورد، هم‌تراز «علت‌های اصلی مشکلات») */
export const PROBLEM_FILTERS = [...PROBLEMS, ...DERIVED_CAUSES];
export const FILTER_BY_ID = Object.fromEntries(PROBLEM_FILTERS.map(p=>[p.id,p]));
/* اولویت انتخاب علت غالب وقتی شدت چند مشکل برابر است */
const CAUSE_PRIORITY = ["weakCollection","accumulatedDebt","debtGrowth","stableLowSales","lowSales","highPeriod","highDebtPerCust","lowPrice"];

export const SEVERITY = {
  0:{id:"none", label:"—"},
  1:{id:"warn", label:"هشدار", icon:"🟡"},
  2:{id:"imp",  label:"مهم",   icon:"🟠"},
  3:{id:"crit", label:"بحرانی",icon:"🔴"}
};

/* ───────── تنظیمات ───────── */
registerGroup({id:"finance", label:"تحلیل مالی و عملکردی", order:8});
const sec = (title, note) => ({section:title, sectionNote:note});

registerSetting({id:"fin.minGroup", group:"finance", ...sec("گروه مقایسه و نمونه",
  "مقایسه با گروه مشابه (همان کاربری در همان شهر ← امور ← استان) انجام می‌شود؛ گروهی که کمتر از این تعداد نمونهٔ معتبر دارد کنار گذاشته می‌شود و به سطح بالاتر برمی‌گردیم. مقادیر پیش‌فرض «استاندارد قانونی» نیستند."),
  label:"حداقل تعداد نمونه در گروه مشابه", default:8, min:3, max:200, step:1});

registerSetting({id:"fin.pWarnHigh", group:"finance", ...sec("آستانه‌های صدکی برای شاخص‌های «بالا بد است»","بدهی سرانه، رشد بدهی، بدهی اول، دوره وصول"),
  label:"هشدار — صدک (≥)", default:75, min:50, max:100, step:1, unit:"٪"});
registerSetting({id:"fin.pImpHigh", group:"finance", section:"آستانه‌های صدکی برای شاخص‌های «بالا بد است»",
  label:"مهم — صدک (≥)", default:90, min:50, max:100, step:1, unit:"٪"});
registerSetting({id:"fin.pCritHigh", group:"finance", section:"آستانه‌های صدکی برای شاخص‌های «بالا بد است»",
  label:"بحرانی — صدک (≥)", default:95, min:50, max:100, step:1, unit:"٪"});
registerSetting({id:"fin.pWarnLow", group:"finance", ...sec("آستانه‌های صدکی برای شاخص‌های «پایین بد است»","فروش سرانه، درصد جذب، قیمت متوسط فروش"),
  label:"هشدار — صدک (≤)", default:25, min:0, max:50, step:1, unit:"٪"});
registerSetting({id:"fin.pImpLow", group:"finance", section:"آستانه‌های صدکی برای شاخص‌های «پایین بد است»",
  label:"مهم — صدک (≤)", default:10, min:0, max:50, step:1, unit:"٪"});
registerSetting({id:"fin.pCritLow", group:"finance", section:"آستانه‌های صدکی برای شاخص‌های «پایین بد است»",
  label:"بحرانی — صدک (≤)", default:5, min:0, max:50, step:1, unit:"٪"});

registerSetting({id:"fin.minMaterial", group:"finance", ...sec("شرط‌های مطلق و حداقل‌ها",
  "این شرط‌ها جلوی هشدار برای مقادیر ناچیز یا رشدهای درصدی جعلی را می‌گیرند. جمع مانده بدهی اول/پایان در همهٔ سطوح جبری است (مثبت و منفی با هم جمع می‌شوند)؛ قدرمطلق فقط برای آستانهٔ حجم مالی به‌کار می‌رود. منطق پیش‌دریافت: در کاربری «آزاد و بنایی» مانده منفی = پیش‌دریافت است و گذار از منفی به مثبت (استهلاک پیش‌دریافت + بدهی جدید) «افزایش ریسک وصول» حساب می‌شود. منطق اصلاحات: در سایر کاربری‌ها مانده اول منفی ≈ اصلاحات صورتحساب/واریز مازاد قبلی است و نرخ رشد با قدرمطلق بدهی اول محاسبه می‌شود. این منطق بر اساس نام کاربری «آزاد و بنایی» ثابت است و سوئیچ جداگانه ندارد."),
  label:"حداقل حجم مالی برای تشخیص مشکل (بزرگ‌ترین مقدار از فروش، بدهی اول و بدهی پایان)", default:20000000, min:0, max:1e13, step:10000000, unit:"ریال"});
registerSetting({
  id: "fin.periodExemptDays",
  group: "finance",
  section: "شرط‌های مطلق و حداقل‌ها",
  label: "استثنای حجم مالی وقتی دوره وصول ≥ این مقدار باشد (روز)",
  default: 180,
  min: 60,
  max: 3650,
  step: 10,
  unit: "روز"
});
registerSetting({id:"fin.debtBaseMin", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"بدهی اول دوره «ناچیز» (زیر این مقدار رشد درصدی استاندارد اعمال نمی‌شود؛ حالت‌های پیش‌دریافت/اصلاحات همچنان نرخ دارند)", default:1000000, min:0, max:1e12, step:100000, unit:"ریال"});
registerSetting({id:"fin.debtBaseSalesPct", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"حداقل بدهی اول نسبت به فروش دوره برای محاسبهٔ درصد رشد استاندارد", default:2, min:0, max:100, step:0.5, unit:"٪"});
registerSetting({id:"fin.growthMinPct", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"حداقل درصد رشد بدهی برای هشدار «رشد بدهی» (شامل گذار پیش‌دریافت→بدهی و اصلاحات)", default:10, min:0, max:10000, step:1, unit:"٪"});
registerSetting({id:"fin.absorbWeakMax", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"«ضعف وصول» فقط وقتی درصد جذب کمتر از این مقدار باشد", default:90, min:0, max:100, step:1, unit:"٪"});
registerSetting({id:"fin.periodFloor", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"«دوره وصول بالا» فقط وقتی دوره وصول بیشتر از این مقدار باشد", default:60, min:0, max:3650, step:5, unit:"روز"});
registerSetting({id:"fin.fewCustMax", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"«مشترک کم» برای تمرکز بدهی: حداکثر تعداد مشترک (یا کمتر از صدک هشدار پایین گروه)", default:20, min:1, max:100000, step:1});
registerSetting({id:"fin.goodAbsorbMin", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"«عملکرد مطلوب»: حداقل درصد جذب", default:90, min:0, max:200, step:1, unit:"٪"});
registerSetting({id:"fin.salesHighMinTier", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"حداقل شدت «فروش بالا» برای علت‌های «افزایش فروش» و «فروش بالا + ضعف وصول» (۱=هشدار/صدک۷۵ · ۲=مهم/صدک۹۰ · ۳=بحرانی/صدک۹۵) — روی صدک‌های بدهی اثر ندارد",
  default:2, min:1, max:3, step:1});
registerSetting({id:"fin.critCount", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"تعداد گروه مشکل هم‌زمان (فروش/وصول/رشد/بدهی/دوره) برای شدت «بحرانی»", default:4, min:2, max:5, step:1});

registerSetting({id:"fin.singleWarn", group:"finance", section:"شرط‌های مطلق و حداقل‌ها",
  label:"تک‌سیگنالِ هشدار (فقط صدک ۷۵/۲۵، بدون تأیید سیگنال دوم) هم مشکل حساب شود", type:"bool", default:false});

registerSetting({id:"fin.topN", group:"finance", ...sec("خروجی",""),
  label:"تعداد موارد در «موارد مهم برای بررسی»", default:5, min:1, max:50, step:1});
registerSetting({id:"fin.tableLimit", group:"finance", section:"خروجی",
  label:"تعداد ردیف جدول در هر نوبت نمایش", default:100, min:20, max:2000, step:20});
registerSetting({id:"fin.materialWeight", group:"finance", section:"خروجی",
  label:"وزن اهمیت ریالی در اولویت موارد مهم", default:40, min:0, max:100, step:1, unit:"٪"});

registerSetting({id:"fin.wDebtPerCust", group:"finance", ...sec("وزن اجزای امتیاز داخلی مشکل",
  "امتیاز داخلی فقط برای مرتب‌سازی و انتخاب «موارد مهم» است و به کاربر نمایش داده نمی‌شود. وزن‌ها پیش‌فرض قابل‌تغییرند."),
  label:"شدت بدهی سرانه", default:20, min:0, max:100, step:1});
registerSetting({id:"fin.wDebtChange", group:"finance", section:"وزن اجزای امتیاز داخلی مشکل",
  label:"تغییر (رشد) بدهی", default:15, min:0, max:100, step:1});
registerSetting({id:"fin.wWeak", group:"finance", section:"وزن اجزای امتیاز داخلی مشکل",
  label:"ضعف وصول", default:20, min:0, max:100, step:1});
registerSetting({id:"fin.wPeriod", group:"finance", section:"وزن اجزای امتیاز داخلی مشکل",
  label:"دوره وصول", default:15, min:0, max:100, step:1});
registerSetting({id:"fin.wLowSales", group:"finance", section:"وزن اجزای امتیاز داخلی مشکل",
  label:"فروش پایین", default:10, min:0, max:100, step:1});
registerSetting({id:"fin.wAccum", group:"finance", section:"وزن اجزای امتیاز داخلی مشکل",
  label:"بدهی انباشته", default:10, min:0, max:100, step:1});
registerSetting({id:"fin.wCount", group:"finance", section:"وزن اجزای امتیاز داخلی مشکل",
  label:"تعداد مشکلات هم‌زمان", default:10, min:0, max:100, step:1});

registerSetting({id:"fin.disabledUsages", group:"finance", ...sec("دامنهٔ کاربری‌ها",
  "حذف/نگه‌داری «نیروهای مسلح» با کلید سه‌حالتهٔ بالای همین تب تعیین می‌شود (پیش‌فرض: بدون نیروی مسلح). کاربری‌های انتخاب‌شده در اینجا نیز فقط از محاسبات این تب کنار گذاشته می‌شوند؛ دادهٔ اصلی Excel تغییر نمی‌کند."),
  label:"کاربری‌های غیرفعال در این تب", type:"list", default:[]});

for(const p of PROBLEMS){
  registerSetting({id:`fin.problem.${p.id}`, group:"finance",
    ...(p===PROBLEMS[0] ? sec("فعال/غیرفعال کردن انواع مشکل","") : {section:"فعال/غیرفعال کردن انواع مشکل"}),
    label:p.label, type:"bool", default:true});
}

export const FIN_SETTING_IDS = [
  "minGroup","minMaterial","singleWarn","pWarnHigh","pImpHigh","pCritHigh","pWarnLow","pImpLow","pCritLow","debtBaseMin","debtBaseSalesPct","growthMinPct",
  "absorbWeakMax","periodFloor","periodExemptDays","fewCustMax","goodAbsorbMin","salesHighMinTier","critCount","topN","tableLimit","materialWeight",
  "wDebtPerCust","wDebtChange","wWeak","wPeriod","wLowSales","wAccum","wCount","disabledUsages",
  ...PROBLEMS.map(p=>`problem.${p.id}`)
].map(k=>`fin.${k}`);
(function checkConfigVersion(){
  try{
    const saved = localStorage.getItem(VERSION_KEY);
    if(saved !== null && Number(saved) !== FIN_CONFIG_VERSION) FIN_SETTING_IDS.forEach(id=>resetSetting(id));
    localStorage.setItem(VERSION_KEY, String(FIN_CONFIG_VERSION));
  }catch{ /* localStorage در دسترس نیست → پیش‌فرض‌ها */ }
})();

/** تنها نقطهٔ خواندن آستانه‌ها */
export function readConfig(){
  const n = (id,d) => { const v = S(id); return Number.isFinite(v) ? v : d; };
  let pw = n("fin.pWarnHigh",75), pi = n("fin.pImpHigh",90), pc = n("fin.pCritHigh",95);
  pi = Math.max(pi,pw); pc = Math.max(pc,pi);
  let lw = n("fin.pWarnLow",25), li = n("fin.pImpLow",10), lc = n("fin.pCritLow",5);
  li = Math.min(li,lw); lc = Math.min(lc,li);
  const problemsOn = {};
  PROBLEMS.forEach(p=>{ problemsOn[p.id] = S(`fin.problem.${p.id}`) !== false; });
  return {
    version:FIN_CONFIG_VERSION,
    minGroup:Math.max(3,Math.round(n("fin.minGroup",8))),
    pWarnHigh:pw, pImpHigh:pi, pCritHigh:pc, pWarnLow:lw, pImpLow:li, pCritLow:lc,
    minMaterial:n("fin.minMaterial",2e7), periodExemptDays:n("fin.periodExemptDays",180), debtBaseMin:n("fin.debtBaseMin",1e6), debtBaseSalesPct:n("fin.debtBaseSalesPct",2), growthMinPct:n("fin.growthMinPct",10),
    absorbWeakMax:n("fin.absorbWeakMax",90), periodFloor:n("fin.periodFloor",60), fewCustMax:n("fin.fewCustMax",20),
    goodAbsorbMin:n("fin.goodAbsorbMin",90),
    salesHighMinTier:Math.min(3,Math.max(1,Math.round(n("fin.salesHighMinTier",2)))),
    critCount:Math.max(2,Math.round(n("fin.critCount",4))), singleWarn:S("fin.singleWarn") === true,
    topN:Math.max(1,Math.round(n("fin.topN",5))), tableLimit:Math.max(20,Math.round(n("fin.tableLimit",100))),
    materialWeight:Math.min(100,Math.max(0,n("fin.materialWeight",40))),
    w:{debtPerCust:n("fin.wDebtPerCust",20), wDebtChange:n("fin.wDebtChange",15), wWeak:n("fin.wWeak",20), wPeriod:n("fin.wPeriod",15),
       wLowSales:n("fin.wLowSales",10), wAccum:n("fin.wAccum",10), wCount:n("fin.wCount",10), wDebtPerCust:n("fin.wDebtPerCust",20)},
    disabledUsages:Array.isArray(S("fin.disabledUsages")) ? S("fin.disabledUsages") : [],
    problemsOn,
    /* اتصال اختیاری «محافظ میانهٔ صفر» (تنظیمات گروه «پایش صفرها»؛ پیش‌فرض روشن) */
    zwGuardLink:S("zw.guardLink") !== false, zwGuardWarn:n("zw.guardWarnBelow",85), zwGuardCrit:n("zw.guardCritBelow",70)
  };
}

/* ───────── قالب‌بندی نمایش (محاسبات داخلی همیشه با دقت کامل) ───────── */
const isNum = v => typeof v === "number" && Number.isFinite(v);
export const faN = (v,d=0) => !isNum(v) ? "—" : v.toLocaleString("fa-IR",{maximumFractionDigits:d, minimumFractionDigits:0});
export const pct = (v,d=1) => !isNum(v) ? "—" : faN(v,d)+"٪";
export function money(v){
  if(!isNum(v)) return "—";
  const a = Math.abs(v);
  if(a >= 1e9) return faN(v/1e9, a>=1e11?0:1)+" میلیارد";
  if(a >= 1e6) return faN(v/1e6, a>=1e8?0:1)+" میلیون";
  return faN(v,0);
}

/* ───────── ابزار آماری ───────── */
function quantile(sorted, p){
  const n = sorted.length; if(!n) return null;
  if(n === 1) return sorted[0];
  const pos = (n-1)*p/100, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi]-sorted[lo])*(pos-lo);
}
const METRICS = ["salesPerCust","price","absorb","debtPerCust","debtStartPerCust","period","growth","debtChangePerCust","customers","debtEnd"];

/* ───────── تابع مرکزی محاسبهٔ رشد بدهی (usage-aware) ─────────
   • «آزاد و بنایی»: مانده منفی = پیش‌دریافت (Advance Payment)؛ گذار منفی→مثبت = استهلاک کامل پیش‌دریافت + ایجاد بدهی جدید واقعی.
   • سایر کاربری‌ها: مانده اول منفی ≈ اصلاحات صورتحساب/واریز مازاد قبلی؛ نرخ رشد با «قدرمطلق مخرج» محاسبه می‌شود تا علامت منطقی بماند.
   • اصل عدم تهاتر: پیش‌دریافت و بدهی واقعی خنثی نمی‌شوند.
   opts (اختیاری): {minBase, relBase} برای اعمال آستانهٔ «بدهی اول ناچیز»؛ پیش‌فرض ۰ (تابع خالص). */
export const ADVANCE_USAGE_RE = /آزاد\s*و\s*بنایی/;
export const isAdvanceUsage = usage => ADVANCE_USAGE_RE.test(String(usage||"").replace(/\u200c/g," "));
export const GROWTH_TYPES = {
  NO_CHANGE:{status:"none", label:"بدون تغییر معنادار"},
  STANDARD:{status:"percent", label:"رشد درصدی استاندارد"},
  FROM_ZERO:{status:"newDebt", label:"ایجاد بدهی جدید"},
  ADJUSTMENT_TO_DEBT:{status:"negativeStart", label:"اصلاحات/مانده اول منفی ← بدهی مثبت"},
  STANDARD_GROWTH:{status:"negativeStart", label:"مانده اول منفی (نرخ با قدرمطلق)"},
  ADVANCE_PAYMENT_CHANGE:{status:"advanceChange", label:"تغییر حجم پیش‌دریافت"},
  ADVANCE_TO_DEBT:{status:"advanceToDebt", label:"استهلاک پیش‌دریافت + ایجاد بدهی جدید (افزایش ریسک وصول)"}
};
export function calculateDebtGrowth(startDebt, endDebt, usageType, opts={}){
  const d0 = Number(startDebt), d1 = Number(endDebt);
  const mk = (type, growthRate, extra) => ({growthRate, delta:d1-d0, type, label:GROWTH_TYPES[type].label, ...extra});
  if(!Number.isFinite(d0) || !Number.isFinite(d1)) return {growthRate:null, delta:null, type:"NO_CHANGE", label:GROWTH_TYPES.NO_CHANGE.label};
  const minBase = Math.max(0, Number(opts.minBase)||0), relBase = Math.max(0, Number(opts.relBase)||0);
  const rateAbs = () => (d1-d0)/Math.abs(d0)*100;     // مخرج = قدرمطلق بدهی اول
  if(d0 === 0 && d1 === 0) return mk("NO_CHANGE", null);
  if(d0 < -minBase){                                   // شروع منفی
    if(isAdvanceUsage(usageType)){
      if(d1 <= 0) return mk("ADVANCE_PAYMENT_CHANGE", rateAbs());
      return mk("ADVANCE_TO_DEBT", rateAbs(), {advanceConsumed:Math.abs(d0), newDebtAccrued:d1});
    }
    return mk(d1 > 0 ? "ADJUSTMENT_TO_DEBT" : "STANDARD_GROWTH", rateAbs());
  }
  if(d0 > Math.max(minBase, relBase)) return mk("STANDARD", (d1-d0)/d0*100);   // شروع مثبت معنادار
  return d1 > minBase ? mk("FROM_ZERO", null) : mk("NO_CHANGE", null);           // شروع صفر/ناچیز
}

/* ───────── شاخص‌های یک مجموعه (رکورد یا تجمیع) ───────── */
export function derive(t, days, cfg){
  const c = t.customers, m = t.consumption, s = t.sales, col = t.collection, d0 = t.debtStart, d1 = t.debtEnd;
  const salesOk = isNum(s) && s >= 0;
  const o = {...t};
  o.salesPerCust = (c > 0 && salesOk) ? s/c : null;
  o.price = (m > 0 && salesOk) ? s/m : null;
  o.absorb = (salesOk && s > 0 && isNum(col)) ? col/s*100 : null;
  o.debtChange = (isNum(d0) && isNum(d1)) ? d1-d0 : null;
  o.debtPerCust = (c > 0 && isNum(d1)) ? d1/c : null;
  o.debtStartPerCust = (c > 0 && isNum(d0)) ? d0/c : null;
  o.debtChangePerCust = (c > 0 && isNum(o.debtChange)) ? o.debtChange/c : null;
  o.avgDebt = (isNum(d0) && isNum(d1)) ? (d0+d1)/2 : null;
  /* دوره وصول مطالبات = ((بدهی اول + بدهی پایان) ÷ ۲ ÷ فروش) × روز دوره — فقط وقتی فروش مثبت و داده معتبر و avgDebt ≥ ۰ */
  const per = (salesOk && s > 0 && days > 0 && isNum(o.avgDebt) && o.avgDebt >= 0) ? (o.avgDebt/s)*days : null;
  o.period = (isNum(per) ? per : null);
  /* رشد بدهی: usage-aware از طریق calculateDebtGrowth (آستانه‌های «ناچیز» از تنظیمات) */
  o.growth = null; o.growthStatus = "none";
  if(isNum(d0) && isNum(d1)){
    const g = calculateDebtGrowth(d0, d1, t.usage, {minBase:cfg.debtBaseMin, relBase:(salesOk ? s : 0) * cfg.debtBaseSalesPct/100});
    o.growthStatus = GROWTH_TYPES[g.type].status;
    o.growth = isNum(g.growthRate) ? g.growthRate : null;
    o.growthType = g.type; o.growthLabel = g.label;
    if(isNum(g.advanceConsumed)) o.advanceConsumed = g.advanceConsumed;
    if(isNum(g.newDebtAccrued)) o.newDebtAccrued = g.newDebtAccrued;
  }
  return o;
}
const sumOf = (arr, k) => arr.reduce((a,x)=>a+(isNum(x[k])?x[k]:0),0);
export function aggregate(leaves, days, cfg){
  /* جمع مانده‌ها جبری است (بدون Math.abs)؛ اگر همهٔ رکوردها یک کاربری باشند منطق usage-aware همان کاربری اعمال می‌شود */
  const us = new Set(leaves.map(l=>l.usage));
  return derive({
    usage: us.size === 1 ? [...us][0] : "",
    customers:sumOf(leaves,"customers"), consumption:sumOf(leaves,"consumption"), sales:sumOf(leaves,"sales"),
    collection:sumOf(leaves,"collection"), debtStart:sumOf(leaves,"debtStart"), debtEnd:sumOf(leaves,"debtEnd")
  }, days, cfg);
}

/* ───────── آماده‌سازی: حذف نیروهای مسلح، تجمیع تکراری‌ها، کیفیت داده ───────── */
export function prepare(rawRows, cfg){
  const dq = {armedRows:0, disabledRows:0, negativeSales:0, zeroCustomers:0, negativeCollection:0, invalid:0};
  const map = new Map();
  for(const r of (rawRows||[])){
    const usage = String(r.usage||"").trim();
    if(ARMED_RE.test(usage)) dq.armedRows++;                      // فقط شمارش اطلاعاتی؛ حذف/نگه‌داری با کلید نیروی مسلح تب (قبل از ورود به این ماژول)
    if(cfg.disabledUsages.includes(usage)){ dq.disabledRows++; continue; }
    const area = String(r.area||"").trim(), city = String(r.city||"").trim();
    if(!area || !city || !usage){ dq.invalid++; continue; }
    const key = area+"|"+city+"|"+usage;
    let x = map.get(key);
    if(!x){ x = {key, area, city, usage, settlementType:r.settlementType||"", customers:0, consumption:0, sales:0, collection:0, debtStart:0, debtEnd:0}; map.set(key,x); }
    x.customers += Number(r.customers)||0; x.consumption += Number(r.consumption)||0; x.sales += Number(r.income)||0;
    x.collection += Number(r.collection)||0; x.debtStart += Number(r.debtStart)||0; x.debtEnd += Number(r.debtEnd)||0;
  }
  const leaves = [...map.values()];
  for(const l of leaves){
    if(l.sales < 0) dq.negativeSales++;
    if(l.customers <= 0) dq.zeroCustomers++;
    if(l.collection < 0) dq.negativeCollection++;
  }
  return {leaves, dq};
}

/* ───────── گروه‌های مشابه: کاربری در شهر ← کاربری در امور ← کاربری در استان ───────── */
function buildGroups(leaves){
  const maps = {city:new Map(), area:new Map(), prov:new Map()};
  const add = (m,k,l) => {
    let g = m.get(k);
    if(!g){ g = {vals:{}}; METRICS.forEach(x=>g.vals[x]=[]); m.set(k,g); }
    METRICS.forEach(x=>{ const v = l[x]; if(isNum(v)) g.vals[x].push(v); });
  };
  for(const l of leaves){
    add(maps.city, l.area+"|"+l.city+"|"+l.usage, l);
    add(maps.area, l.area+"|"+l.usage, l);
    add(maps.prov, l.usage, l);
  }
  for(const m of Object.values(maps)) for(const g of m.values()) METRICS.forEach(x=>g.vals[x].sort((a,b)=>a-b));
  return maps;
}
const LEVEL_NAMES = ["شهر","امور","استان"];

/* ───────── تحلیل کامل ───────── */
let cache = {key:"", result:null};
export function invalidateFinanceCache(){ cache = {key:"", result:null}; }
export function analyzeFinance(rawRows, opts={}){
  const days = Number(opts.days)>0 ? Number(opts.days) : 0;
  const cfg = readConfig();
  let sig = 0; const rr = rawRows||[];
  for(const r of rr){ sig += (Number(r.income)||0) + (Number(r.debtEnd)||0)*3 + (Number(r.collection)||0)*7 + (Number(r.customers)||0); }
  const key = JSON.stringify(cfg)+"|"+days+"|"+rr.length+"|"+sig+"|"+(opts.tag||"")+"|ds:"+getDatasetVersion();   // نسخهٔ Dataset: بعد از Update هرگز نتیجهٔ قدیمی برنمی‌گردد
  if(cache.key === key && cache.result) return cache.result;   // Memoize: با تغییر فیلتر نمایش، محاسبات سنگین تکرار نمی‌شود

  const errors = [];
  let result;
  try{
    result = compute(rr, days, cfg);
  }catch(e){
    console.error(e);
    errors.push({code:"CALCULATION_ERROR", severity:"error", message:"محاسبهٔ تحلیل مالی با خطا روبه‌رو شد.", details:String(e&&e.message||e)});
    result = {cfg, days, leaves:[], dq:{}, errors, groupsInfo:{}};
  }
  cache = {key, result};
  return result;
}

function compute(rawRows, days, cfg){
  const {leaves: base, dq} = prepare(rawRows, cfg);
  const leaves = base.map(l=>derive(l, days, cfg));
  /* شرط «حجم مالی ناچیز» (small): مواردی که بزرگ‌ترین مقدار از فروش/بدهی اول/بدهی پایان کمتر از fin.minMaterial باشد از تشخیص کنار می‌روند.
     استثنا: اگر دوره وصول به‌شدت بالا باشد (≥ max(۳×periodFloor, periodExemptDays))، مورد حتی با حجم مالی کوچک هم تحلیل می‌شود؛
     چون الگوی «فروش جاری بسیار پایین + بدهی گیرکرده» (مثلاً صنعتی با دوره وصول بیش از ۲۰۰۰ روز) نباید با سانسور حجم مالی پنهان شود. */
  for(const l of leaves){
    const maxAbs = Math.max(Math.abs(l.sales||0), Math.abs(l.debtStart||0), Math.abs(l.debtEnd||0));
    const extremePeriod = isNum(l.period) && l.period >= Math.max(cfg.periodFloor * 3, cfg.periodExemptDays);
    l.belowMin = maxAbs < cfg.minMaterial;
    l.small = l.belowMin && !extremePeriod;
  }
  // آمار گروه‌ها همچنان فقط از رکوردهای با حجم کافی ساخته می‌شود تا موارد ناچیزِ مستثنا آمار گروه را مخدوش نکنند
  const groups = buildGroups(leaves.filter(l=>!l.belowMin));

  const pick = (l, metric) => {
    const gs = [groups.city.get(l.area+"|"+l.city+"|"+l.usage), groups.area.get(l.area+"|"+l.usage), groups.prov.get(l.usage)];
    for(let i=0;i<3;i++){
      const g = gs[i];
      if(g && g.vals[metric].length >= cfg.minGroup) return {arr:g.vals[metric], level:LEVEL_NAMES[i], n:g.vals[metric].length};
    }
    return null;
  };
  /* dir = "high": بالا بد است · "low": پایین بد است. شرط اضافه: مقدار باید فراتر از میانه باشد (جلوگیری از هشدار در گروه‌های پر از مقدار مساوی) */
  const judge = (l, metric, dir) => {
    const v = l[metric];
    if(!isNum(v)) return {tier:0, v:null};
    const p = pick(l, metric);
    if(!p) return {tier:0, v, noGroup:true};
    const med = quantile(p.arr,50);
    /* محافظ میانهٔ صفر — فقط با کلید zw.guardLink (پیش‌فرض روشن): وقتی میانهٔ درصد جذب گروه صفر است مقایسهٔ نسبی بی‌معناست؛ آستانهٔ مطلق جایگزین می‌شود */
    if(cfg.zwGuardLink && metric === "absorb" && dir === "low" && med === 0){
      const tg = v < cfg.zwGuardCrit ? 3 : v < cfg.zwGuardWarn ? 1 : 0;
      return {tier:tg, v, med, warn:cfg.zwGuardWarn, level:p.level, n:p.n, dir};
    }
    let tier = 0, warn;
    if(dir === "high"){
      warn = quantile(p.arr, cfg.pWarnHigh);
      if(v > med){
        if(v >= quantile(p.arr,cfg.pCritHigh)) tier = 3;
        else if(v >= quantile(p.arr,cfg.pImpHigh)) tier = 2;
        else if(v >= warn) tier = 1;
      }
    }else{
      warn = quantile(p.arr, cfg.pWarnLow);
      if(v < med){
        if(v <= quantile(p.arr,cfg.pCritLow)) tier = 3;
        else if(v <= quantile(p.arr,cfg.pImpLow)) tier = 2;
        else if(v <= warn) tier = 1;
      }
    }
    return {tier, v, med, warn, level:p.level, n:p.n, dir};
  };

  const eps = cfg.debtBaseMin;
  for(const l of leaves){
    const P = [], basis = {}, notes = [];
    if(l.small){
      l.problems = P; l.notes = notes; l.basis = basis; l.watch = []; l.noGroup = false; l.salesHigh = false; l.good = false;
      l.severity = 0; l.cause = null; l.score = 0;
      l.text = l.baseText = "حجم مالی این مورد بسیار کوچک است (کمتر از حداقل تنظیم‌شده)؛ از تشخیص مشکل و آمار گروه کنار گذاشته شد.";
      continue;
    }
    const note = (metric, j) => { if(j && j.level) basis[metric] = {level:j.level, n:j.n, med:j.med, warn:j.warn, dir:j.dir}; };
    const on = id => cfg.problemsOn[id] !== false;

    const jSales = judge(l,"salesPerCust","low"), jPrice = judge(l,"price","low"), jPriceHi = judge(l,"price","high");
    const jAbs = judge(l,"absorb","low"), jDpc = judge(l,"debtPerCust","high"), jAcc = judge(l,"debtStartPerCust","high");
    const jPer = judge(l,"period","high"), jDebtEnd = judge(l,"debtEnd","high");
    const growing = isNum(l.debtChange) && l.debtChange > 0;
    let jGrow = {tier:0};
    /* statusهای دارای نرخ: percent · negativeStart (اصلاحات، نرخ با قدرمطلق) · advanceToDebt (گذار پیش‌دریافت→بدهی).
       advanceChange (تغییر حجم پیش‌دریافت در محدودهٔ منفی) رشد بدهی حساب نمی‌شود. */
    const RATE_STATUS = ["percent","negativeStart","advanceToDebt"];
    if(growing){
      if(RATE_STATUS.includes(l.growthStatus)){ jGrow = judge(l,"growth","high"); if(!isNum(l.growth) || l.growth < cfg.growthMinPct) jGrow = {tier:0}; }
      else if(l.growthStatus === "newDebt"){ jGrow = judge(l,"debtChangePerCust","high"); }
    }
    const salesHigh = judge(l,"salesPerCust","high").tier >= cfg.salesHighMinTier;

    if(jSales.tier > 0){ if(on("lowSales")) P.push({id:"lowSales", tier:jSales.tier}); note("salesPerCust", jSales); }
    if(jAbs.tier > 0 && isNum(l.absorb) && l.absorb < cfg.absorbWeakMax){
      if(on("weakCollection")) P.push({id:"weakCollection", tier:jAbs.tier, drivesDebt:growing});
      note("absorb", jAbs);
    }
    if(jGrow.tier > 0){ if(on("debtGrowth")) P.push({id:"debtGrowth", tier:jGrow.tier}); note(RATE_STATUS.includes(l.growthStatus)?"growth":"debtChangePerCust", jGrow); }
    if(jAcc.tier > 0 && l.debtStart > eps){ if(on("accumulatedDebt")) P.push({id:"accumulatedDebt", tier:jAcc.tier}); note("debtStartPerCust", jAcc); }
    if(jDpc.tier > 0 && l.debtEnd > eps){ if(on("highDebtPerCust")) P.push({id:"highDebtPerCust", tier:jDpc.tier}); note("debtPerCust", jDpc); }
    if(jPer.tier > 0 && isNum(l.period) && l.period >= cfg.periodFloor){ if(on("highPeriod")) P.push({id:"highPeriod", tier:jPer.tier}); note("period", jPer); }
    if(jPrice.tier > 0){ if(on("lowPrice") && jPrice.tier >= 2) P.push({id:"lowPrice", tier:jPrice.tier}); note("price", jPrice); }
    if(jPriceHi.tier > 0){ notes.push("highPrice"); note("price", jPriceHi); }
    if(l.growthStatus === "advanceChange") notes.push("advanceChange");   // اطلاع: تغییر حجم پیش‌دریافت؛ به‌تنهایی مشکل نیست

    /* تمرکز بدهی: مشترک کم + بدهی پایان بالا + بدهی سرانهٔ بسیار بالا */
    if(l.customers > 0 && l.debtEnd > eps && jDpc.tier >= 2 && jDebtEnd.tier >= 1){
      const pc = pick(l,"customers");
      const few = l.customers <= cfg.fewCustMax || (pc && l.customers <= quantile(pc.arr, cfg.pWarnLow));
      if(few){ if(on("debtConcentration")) P.push({id:"debtConcentration", tier:jDpc.tier}); }
    }
    /* ثبات ظاهری: بدهی رشد نکرده ولی فروش پایین است */
    const notGrowing = isNum(l.debtChange) && (l.debtChange <= 0 || (RATE_STATUS.includes(l.growthStatus) && isNum(l.growth) && l.growth < cfg.growthMinPct));
    if(notGrowing && jSales.tier > 0 && on("stableLowSales")) P.push({id:"stableLowSales", tier:jSales.tier});

    /* هشدار تکی (صدک هشدار بدون تأیید): به‌صورت پیش‌فرض «زیرنظر» است، نه مشکل — مگر اینکه سیگنال دوم از خانوادهٔ دیگر آن را تأیید کند */
    const FAM0 = {lowSales:"s", stableLowSales:"s", lowPrice:"s", weakCollection:"c", debtGrowth:"g", accumulatedDebt:"d", highDebtPerCust:"d", debtConcentration:"d", highPeriod:"p"};
    l.watch = [];
    if(!cfg.singleWarn && P.length && Math.max(...P.map(p=>p.tier)) < 2 && new Set(P.map(p=>FAM0[p.id])).size < 2){
      l.watch = P.map(p=>p.id); P.length = 0;
    }
    l.problems = P; l.notes = notes; l.basis = basis;
    l.noGroup = !!(jSales.noGroup && jAbs.noGroup && jDpc.noGroup);
    l.salesHigh = salesHigh;

    /* عملکرد مطلوب: فروش مناسب + وصول مناسب + بدهی کاهشی/کنترل‌شده + دوره وصول غیرعادی نیست + بدون مشکل */
    l.good = !P.length && isNum(l.salesPerCust) && jSales.tier === 0 && isNum(l.absorb) && l.absorb >= cfg.goodAbsorbMin
      && isNum(l.debtChange) && l.debtChange <= 0 && !(jPer.tier > 0 && l.period >= cfg.periodFloor);

    /* شدت: بر اساس فاصلهٔ آماری، تعداد «خانواده‌های» مشکل هم‌زمان (فروش/وصول/رشد/بدهی/دوره) و ترکیب‌های پرخطر */
    const FAM = {lowSales:"s", stableLowSales:"s", lowPrice:"s", weakCollection:"c", debtGrowth:"g", accumulatedDebt:"d", highDebtPerCust:"d", debtConcentration:"d", highPeriod:"p"};
    const fams = new Set(P.map(p=>FAM[p.id])).size;
    const cnt = P.length, maxTier = cnt ? Math.max(...P.map(p=>p.tier)) : 0;
    let sev = maxTier >= 2 ? 2 : 1;                    // هشدار = چند انحراف قابل‌توجه هم‌زمان · مهم = انحراف شدید
    if(maxTier >= 3 && fams >= 3) sev = 3;             // انحراف بسیار شدید همراه با دو مشکل دیگر
    if(fams >= cfg.critCount) sev = 3;                 // ترکیب چند مشکل
    const conc = P.find(p=>p.id==="debtConcentration");
    if(conc && P.some(p=>["weakCollection","debtGrowth","accumulatedDebt"].includes(p.id))) sev = 3;
    l.severity = cnt ? sev : 0;

    /* علت غالب */
    const has = id => P.find(p=>p.id===id);
    let cause = null;
    if(conc) cause = "debtConcentration";
    else if(has("weakCollection") && salesHigh) cause = "salesAndWeak";
    else if(cnt){
      let best = null;
      for(const id of CAUSE_PRIORITY){
        const p = has(id); if(!p) continue;
        if(!best || p.tier > best.tier) best = p;
      }
      cause = best ? best.id : null;
      if(cause === "debtGrowth" && l.growthStatus === "advanceToDebt") cause = "advanceToDebt";   // افزایش ریسک وصول (نه رشد معمولی)
      else if(cause === "debtGrowth" && salesHigh && !has("weakCollection")) cause = "salesIncrease";
    }else if(l.good) cause = "goodControl";
    l.cause = cause;

    /* امتیاز داخلی مشکل (فقط مرتب‌سازی) */
    const tmax = ids => Math.max(0, ...P.filter(p=>ids.includes(p.id)).map(p=>p.tier))/3;
    const W = cfg.w;
    const comps = [
      [W.wDebtPerCust, tmax(["highDebtPerCust","debtConcentration"])], [W.wDebtChange, tmax(["debtGrowth"])],
      [W.wWeak, tmax(["weakCollection"])], [W.wPeriod, tmax(["highPeriod"])],
      [W.wLowSales, tmax(["lowSales","stableLowSales","lowPrice"])], [W.wAccum, tmax(["accumulatedDebt"])],
      [W.wCount, Math.min(1, Math.max(0,cnt-1)/(cfg.critCount+1))]
    ];
    const wsum = comps.reduce((a,c)=>a+c[0],0) || 1;
    l.score = comps.reduce((a,c)=>a+c[0]*c[1],0)/wsum*100;
    l.text = l.baseText = explain(l, cfg);
  }
  return {cfg, days, leaves, dq, errors:[]};
}

/* ───────── توضیح متنی خودکار (بر اساس داده واقعی) ───────── */
function explain(l, cfg){
  if(l.good) return "فروش مناسب، وصول مناسب و بدهی کاهشی است؛ شاخص‌های مالی این مورد در وضعیت مطلوب قرار دارند.";
  const P = l.problems, has = id => P.find(p=>p.id===id);
  const lvl = t => t>=3 ? "بسیار بالا" : t>=2 ? "بالا" : "نسبتاً بالا";
  const parts = [], topics = [];
  const conc = has("debtConcentration"), dpc = has("highDebtPerCust");
  if(conc){ parts.push(`تعداد مشترک کم (${faN(l.customers)}) است ولی بدهی پایان دوره (${money(l.debtEnd)} ریال) روی همین تعداد محدود متمرکز شده و بدهی سرانه ${money(l.debtPerCust)} ریال است.`); topics.push("تمرکز بدهی"); }
  else if(dpc){ parts.push(`بدهی پایان دوره نسبت به تعداد مشترک ${lvl(dpc.tier)} است (سرانه ${money(l.debtPerCust)} ریال).`); topics.push("بدهی سرانه"); }
  const w = has("weakCollection");
  if(w){
    parts.push(`وصول دوره پایین بوده (درصد جذب ${pct(l.absorb,1)})${w.drivesDebt ? " و بدهی نسبت به ابتدای دوره افزایش یافته است؛ ضعف وصول بر رشد بدهی اثر دارد." : "."}`);
    topics.push("وصول");
  }
  const g = has("debtGrowth");
  if(g){
    const how = l.growthStatus==="percent" ? `${pct(l.growth,0)} نسبت به ابتدای دوره`
      : l.growthStatus==="newDebt" ? "به‌صورت ایجاد بدهی جدید (بدهی اول دوره ناچیز بوده)"
      : l.growthStatus==="advanceToDebt" ? `پیش‌دریافت ابتدای دوره (${money(l.advanceConsumed)} ریال) مستهلک شده و بدهی جدید واقعی (${money(l.newDebtAccrued)} ریال) ایجاد شده است؛ افزایش ریسک وصول`
      : `با بدهی اول دورهٔ منفی (اصلاحات/واریز مازاد قبلی؛ نرخ با قدرمطلق بدهی اول: ${pct(l.growth,0)})`;
    if(!w) parts.push(`بدهی افزایش یافته است (${how})${l.salesHigh ? " و فروش دوره بالاتر از گروه مشابه است؛ بخشی از رشد بدهی به حجم بالای فروش مربوط است." : "."}`);
    topics.push("رشد بدهی");
  }
  if(has("accumulatedDebt")){ parts.push("بدهی ابتدای دوره نسبت به گروه مشابه بالا بوده؛ مشکل اصلی بدهی انباشته است، نه صرفاً رشد دورهٔ جاری."); topics.push("بدهی انباشته"); }
  if(has("highPeriod")){ parts.push(`دوره وصول مطالبات ${faN(l.period,0)} روز است و از گروه مشابه بالاتر است (شاخص ریسک وصول، نه اثبات علت).`); topics.push("دوره وصول"); }
  if(has("stableLowSales")){ parts.push("بدهی کنترل شده است، اما فروش دوره پایین‌تر از گروه مشابه قرار دارد؛ بنابراین عدم رشد بدهی به تنهایی نشانه عملکرد مطلوب نیست."); topics.push("فروش پایین"); }
  else if(has("lowSales")){ parts.push("فروش به‌ازای هر مشترک پایین‌تر از گروه مشابه است."+(isNum(l.price)?` (قیمت متوسط فروش ${faN(l.price,0)} ریال بر مترمکعب)`:"")); topics.push("فروش پایین"); }
  if(has("lowPrice")){ parts.push("قیمت متوسط فروش هر مترمکعب پایین‌تر از گروه مشابه است."); topics.push("قیمت متوسط فروش"); }
  if(l.notes.includes("advanceChange")) parts.push("مانده بدهی در محدودهٔ منفی (پیش‌دریافت) تغییر کرده است؛ تغییر حجم پیش‌دریافت است و بدهی واقعی محسوب نمی‌شود (اصل عدم تهاتر).");
  if(l.notes.includes("highPrice")) parts.push("قیمت متوسط فروش بالاتر از گروه مشابه است (اطلاع؛ به‌تنهایی مشکل محسوب نمی‌شود).");
  if(!P.length){
    if(l.noGroup) return "گروه مشابه با نمونهٔ کافی برای مقایسهٔ آماری این مورد وجود ندارد؛ وضعیت قطعی اعلام نمی‌شود."+(parts.length?" "+parts.join(" "):"");
    return "شاخص غیرعادی نسبت به گروه مشابه دیده نشد."+(parts.length?" "+parts.join(" "):"");
  }
  return parts.join(" ")+` مورد از نظر ${[...new Set(topics)].join("، ")} نیازمند بررسی است.`;
}

/* ───────── نمای فیلترشده (بدون محاسبهٔ آماری سنگین) ───────── */
const isDerived = id => DERIVED_CAUSES.some(d=>d.id===id);
const matchProblem = (l, p) => !p ? true : p === "any" ? l.problems.length>0 : p === "good" ? l.good
  : isDerived(p) ? (l.problems.length>0 && l.cause===p) : l.problems.some(x=>x.id===p);
export const CARD_DEFS = [
  {id:"any",              label:"کل موارد نیازمند بررسی", hint:"حداقل یک مشکل"},
  {id:"debtGrowth",       label:"رشد بدهی",               hint:"رشد/ایجاد بدهی غیرعادی"},
  {id:"weakCollection",   label:"ضعف وصول",               hint:"جذب پایین نسبت به گروه"},
  {id:"lowSales",         label:"فروش پایین",             hint:"فروش سرانه/مترمکعب"},
  {id:"accumulatedDebt",  label:"بدهی انباشته",           hint:"بدهی اول دورهٔ غیرعادی"},
  {id:"highDebtPerCust",  label:"بدهی سرانه بالا",        hint:"بدهی پایان ÷ مشترک"},
  {id:"highPeriod",       label:"دوره وصول بالا",         hint:"ریسک وصول"},
  {id:"good",             label:"عملکرد مطلوب",           hint:"فروش، وصول و بدهی مناسب"}
];
const SORTS = {
  severity:{label:"شدت", fn:(a,b)=>b.severity-a.severity || b.score-a.score},
  debtEnd:{label:"بیشترین بدهی", fn:(a,b)=>nz(b.debtEnd)-nz(a.debtEnd)},
  debtPerCust:{label:"بیشترین بدهی سرانه", fn:(a,b)=>nz(b.debtPerCust)-nz(a.debtPerCust)},
  debtChange:{label:"بیشترین تغییر بدهی", fn:(a,b)=>nz(b.debtChange)-nz(a.debtChange)},
  period:{label:"بیشترین دوره وصول", fn:(a,b)=>nz(b.period)-nz(a.period)},
  absorbLow:{label:"کمترین درصد جذب", fn:(a,b)=>nzHi(a.absorb)-nzHi(b.absorb)},
  salesLow:{label:"کمترین فروش سرانه", fn:(a,b)=>nzHi(a.salesPerCust)-nzHi(b.salesPerCust)},
  problems:{label:"بیشترین تعداد مشکلات", fn:(a,b)=>b.problems.length-a.problems.length || b.severity-a.severity}
};
const nz = v => isNum(v) ? v : -Infinity;      // مقدار نامعتبر آخر لیست (نزولی)
const nzHi = v => isNum(v) ? v : Infinity;     // مقدار نامعتبر آخر لیست (صعودی)
export const SORT_OPTIONS = Object.entries(SORTS).map(([id,s])=>[id,s.label]);

function tally(list){
  const t = {total:list.length, any:0, good:0, sev:{1:0,2:0,3:0}, by:{}, cardSev:{}};
  const sv = {any:[0,0,0,0]}; PROBLEM_FILTERS.forEach(p=>{ t.by[p.id]=0; sv[p.id]=[0,0,0,0]; });
  for(const l of list){
    if(l.problems.length){
      t.any++; t.sev[l.severity]++; sv.any[l.severity]++;
      for(const p of l.problems){ t.by[p.id]++; sv[p.id][l.severity]++; }
      if(l.cause && isDerived(l.cause)){ t.by[l.cause]++; sv[l.cause][l.severity]++; }
    }
    if(l.good) t.good++;
  }
  /* رنگ کارت = شدتِ غالب (پرتکرارترین؛ در تساوی شدت بالاتر) تا رنگ‌ها همیشه قرمز نشوند */
  for(const id of Object.keys(sv)){ const a = sv[id]; let m = 0; for(let i=1;i<=3;i++) if(a[i] > 0 && a[i] >= a[m||1]) m = i; t.cardSev[id] = m; }
  t.cardSev.good = 0;
  return t;
}

/* ───────── اولویت مدیریتی = شدت الگوی آماری + اهمیت ریالی (فقط برای رتبه‌بندی «موارد مهم»؛ شدت و امتیاز اصلی تغییر نمی‌کند) ───────── */
export const MATERIAL_NOTE = "شدت به‌خاطر الگوی آماری (تمرکز بدهی/وصول ضعیف یا ترکیب شاخص‌های نامطلوب) است، نه به‌خاطر حجم ریالی بزرگ.";
const clamp = (v,lo,hi) => Math.min(hi, Math.max(lo, v));
export function materialRawOf(l){
  const pos = v => isNum(v) ? Math.max(0, v) : 0;
  return 0.50*pos(l.debtEnd) + 0.30*pos(l.debtChange) + 0.20*pos(l.sales);
}
/** ضریب حجم مالی هر رکورد نسبت به میانهٔ همان دامنه (scope). نمونهٔ مرجع: رکوردهای معتبر (غیر «ناچیز») با حجم مثبت. */
export function annotatePriority(scope, cfg){
  const ref = [];
  for(const l of scope){ if(l.small) continue; const r = materialRawOf(l); if(isNum(r) && r > 0) ref.push(r); }
  ref.sort((a,b)=>a-b);
  const med = ref.length >= 3 ? quantile(ref,50) : null;
  const valid = isNum(med) && med > 0;
  const w = clamp(cfg.materialWeight,0,100)/100;
  for(const l of scope){
    const raw = materialRawOf(l);
    const materialFactor = valid ? clamp(Math.sqrt(raw/med), 0.3, 1.5) : 1;   // نسبت ریشهٔ دوم به میانهٔ دامنه (حساس‌تر از لگاریتم)
    const severityNorm = (l.severity||0)/3, scoreNorm = clamp((l.score||0)/100,0,1);
    const patternStrength = 0.7*severityNorm + 0.3*scoreNorm;
    l.materialFactor = materialFactor;
    l.materialLabel = materialFactor < 0.7 ? "پایین" : materialFactor <= 1.15 ? "متوسط" : "بالا";
    l.priorityScore = patternStrength * (1 + w*(materialFactor-1));
    /* توضیح تکمیلی فقط برای شدت بالا + حجم ریالی کم (متن پایه دست‌نخورده در baseText می‌ماند تا با تغییر دامنه انباشته نشود) */
    l.text = (l.severity >= 2 && materialFactor < 0.7 && l.baseText) ? l.baseText+" "+MATERIAL_NOTE : l.baseText;
  }
}

/** f: {area, city, usage, problem, severity, sort} */
export function buildFinView(res, f={}){
  const cfg = res.cfg, days = res.days;
  const scope = res.leaves.filter(l=>{
    const usageOk = f.usages?.length ? f.usages.includes(l.usage) : (!f.usage || l.usage===f.usage);
    return (!f.area||l.area===f.area)&&(!f.city||l.city===f.city)&&usageOk;
  });
  const passF = l => matchProblem(l,f.problem) && (!f.severity || l.severity===Number(f.severity));
  const level = f.city ? "usage" : f.area ? "city" : "area";
  annotatePriority(scope, cfg);
  const counts = tally(scope);
  const agg = aggregate(scope, days, cfg);
  const filtered = scope.filter(passF);
  const sortFn = (SORTS[f.sort]||SORTS.severity).fn;
  const rows = [...filtered].sort(sortFn);

  /* علت غالب — از موارد مشکل‌دار همان دامنه */
  const causeMap = new Map(); let withCause = 0;
  for(const l of scope){ if(l.problems.length && l.cause){ causeMap.set(l.cause,(causeMap.get(l.cause)||0)+1); withCause++; } }
  const causes = [...causeMap.entries()].sort((a,b)=>b[1]-a[1]).map(([id,n])=>({id,label:CAUSES[id]||id,n,pct:withCause?n/withCause*100:0}));

  /* موارد مهم */
  const top = scope.filter(l=>l.problems.length).sort((a,b)=>b.priorityScore-a.priorityScore || b.severity-a.severity || b.score-a.score).slice(0,cfg.topN);

  /* Drill Down: امور ← شهر ← کاربری
     — علت غالب: فقط از برگ‌های مشکل‌دار (نه goodControl)؛ وزن با |بدهی پایان| تا برگ‌های بزرگ‌تر رأی بیشتری داشته باشند
     — matched بدون فیلتر مشکل = تعداد برگ‌های مشکل‌دار (هم‌خوان با ستون «موارد مشکل‌دار»)
     — مرتب‌سازی: شدت → بدهی پایان → تعداد مشکل‌دار (نه صرفاً تعداد کل برگ) */
  const childKey = level==="area" ? "area" : level==="city" ? "city" : "usage";
  const gm = new Map();
  for(const l of scope){ const k = l[childKey]; if(!gm.has(k)) gm.set(k,[]); gm.get(k).push(l); }
  const noProblemFilter = !f.problem;
  const drill = [...gm.entries()].map(([name,ls])=>{
    const m = ls.filter(passF);
    const a = aggregate(ls, days, cfg);
    const problemLeaves = m.filter(x=>x.problems.length>0);
    /* وقتی فیلتر «عملکرد مطلوب» است علت از برگ‌های خوب؛ وگرنه فقط مشکل‌دارها */
    const causeSrc = f.problem==="good" ? m.filter(x=>x.good && x.cause) : problemLeaves.filter(x=>x.cause);
    const cm = new Map();
    causeSrc.forEach(x=>{
      const d = isNum(x.debtEnd) ? Math.abs(x.debtEnd) : 0;
      const w = Math.max(d, 1);
      cm.set(x.cause, (cm.get(x.cause)||0)+w);
    });
    const ranked = [...cm.entries()].sort((x,y)=>y[1]-x[1]);
    const topCauses = ranked.slice(0,2).map(([id])=>CAUSES[id]||id);
    const matched = noProblemFilter || f.problem==="any" ? problemLeaves.length : m.length;
    const sevSrc = noProblemFilter || f.problem==="any" ? problemLeaves : m;
    return {name, n:ls.length, matched,
            sev:sevSrc.reduce((s,x)=>Math.max(s,x.severity||0),0),
            sevCount:{1:sevSrc.filter(x=>x.severity===1).length,2:sevSrc.filter(x=>x.severity===2).length,3:sevSrc.filter(x=>x.severity===3).length},
            agg:a, cause:topCauses[0]||null, causes:topCauses};
  }).sort((a,b)=>b.sev-a.sev || nz(b.agg.debtEnd)-nz(a.agg.debtEnd) || b.matched-a.matched);

  return {cfg, days, scope, scopeCount:scope.length, level, counts, agg, rows, matched:filtered.length, causes, causeBase:withCause, top, drill};
}

export function optionLists(res){
  const u = a => [...new Set(a)].sort((x,y)=>String(x).localeCompare(String(y),"fa"));
  const L = res.leaves||[];
  return {areas:u(L.map(l=>l.area)), usages:u(L.map(l=>l.usage)), citiesOf:a=>u(L.filter(l=>l.area===a).map(l=>l.city))};
}
