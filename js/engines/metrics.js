/* ───── شاخص‌ها و محاسبهٔ پایهٔ هر معیار (META + calc) ─────
   عیناً از dashboards/map.js منتقل شده (بدون هیچ تغییر منطقی) تا موتورها به فایل UI وابسته نباشند. */
import {sum} from "./statistics.js";
import {calculateDebtGrowth} from "./financeEngine.js";

/* مبالغ اصلی (درآمد، وصول، بدهی): گرد و بدون اعشار؛ از یک میلیون ریال به بالا «میلیون ریال»، کمتر از آن «ریال» */
const moneyRial=v=>Math.abs(v||0)>0&&Math.abs(v)<1e6;
const moneyNum=v=>moneyRial(v)?Math.round(v).toLocaleString("fa-IR"):Math.round((v||0)/1e6).toLocaleString("fa-IR");
const moneyUnitFor=v=>moneyRial(v)?"ریال":"میلیون ریال";

export const META={
  customers:{label:"تعداد مشترک",unit:"مشترک",reverse:false,format:v=>Math.round(v).toLocaleString("fa-IR")},
  consumption:{label:"مصرف",unit:"مترمکعب",reverse:false,format:v=>Math.abs(v)>=1e6?(v/1e6).toLocaleString("fa-IR",{maximumFractionDigits:2}):Math.round(v).toLocaleString("fa-IR"),unitFor:v=>Math.abs(v||0)>=1e6?"میلیون مترمکعب":"مترمکعب"},
  income:{label:"درآمد",unit:"میلیون ریال",reverse:false,format:moneyNum,unitFor:moneyUnitFor},
  collection:{label:"وصول",unit:"میلیون ریال",reverse:false,format:moneyNum,unitFor:moneyUnitFor},
  debtEnd:{label:"بدهی",unit:"میلیون ریال",reverse:true,format:moneyNum,unitFor:moneyUnitFor},
  perConsumption:{label:"سرانه مصرف",unit:"مترمکعب/ماه",reverse:false,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:2})},
  perIncome:{label:"سرانه درآمد",unit:"ریال/ماه/مشترک",reverse:false,format:v=>Math.round(v||0).toLocaleString("fa-IR")},
  perCollection:{label:"سرانه وصول",unit:"ریال/ماه/مشترک",reverse:false,format:v=>Math.round(v||0).toLocaleString("fa-IR")},
  perDebt:{label:"سرانه بدهی",unit:"ریال/مشترک",reverse:true,format:v=>Math.round(v||0).toLocaleString("fa-IR")},
  perConsumptionDay:{label:"مصرف روزانه",unit:"مترمکعب/روز",reverse:false,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:2})},
  perIncomeDay:{label:"درآمد روزانه",unit:"میلیون ریال/روز",reverse:false,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:2})},
  perCollectionDay:{label:"وصول روزانه",unit:"میلیون ریال/روز",reverse:false,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:2})},
  idxCollection:{label:"درصد وصول",unit:"٪",reverse:false,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:1})},
  idxPrice:{label:"قیمت آب فروش رفته",unit:"ریال/مترمکعب",reverse:false,format:v=>Math.round(v||0).toLocaleString("fa-IR")},
  idxCycle:{label:"دوره وصول مطالبات",unit:"روز",reverse:true,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:1})},
  debtGrowth:{label:"درصد رشد بدهی",unit:"٪",reverse:true,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:1,signDisplay:"exceptZero"})},
  debtStart:{label:"بدهی ابتدای دوره",unit:"میلیون ریال",reverse:true,format:moneyNum,unitFor:moneyUnitFor},
  debtRisk:{label:"شاخص ریسک بدهی",unit:"٪",reverse:true,format:v=>Number(v||0).toLocaleString("fa-IR",{maximumFractionDigits:1})}
};

export function calc(rows,type){
  const c=Math.max(1,sum(rows,"customers"));
  const months=Math.max(1,window.__REPORT_MONTHS||1), days=Math.max(1,window.__REPORT_DAYS||1);
  if(type==="customers")return sum(rows,"customers");
  if(type==="debtStart")return sum(rows,"debtStart");
  if(type==="consumption")return sum(rows,"consumption");
  if(type==="income")return sum(rows,"income");
  if(type==="collection")return sum(rows,"collection");
  if(type==="debtEnd")return sum(rows,"debtEnd");
  if(type==="perConsumption")return sum(rows,"consumption")/c/months;
  if(type==="perIncome")return sum(rows,"income")/c/months;
  if(type==="perCollection")return sum(rows,"collection")/c/months;
  if(type==="perDebt")return sum(rows,"debtEnd")/c;
  if(type==="perConsumptionDay")return sum(rows,"consumption")/days;
  if(type==="perIncomeDay")return sum(rows,"income")/days/1e6;
  if(type==="perCollectionDay")return sum(rows,"collection")/days/1e6;
  if(type==="idxCollection"){const s=sum(rows,"income");return s?100*sum(rows,"collection")/s:0}
  if(type==="idxPrice"){const s=sum(rows,"consumption");return s?sum(rows,"income")/s:0}
  /* رشد بدهی usage-aware: جمع جبری مانده‌ها؛ شروع منفی با قدرمطلق مخرج (پیش‌دریافت «آزاد و بنایی» / اصلاحات سایر کاربری‌ها) */
  if(type==="debtGrowth"){
    const us=new Set(rows.map(r=>r.usage)), usage=us.size===1?[...us][0]:"";
    const g=calculateDebtGrowth(sum(rows,"debtStart"),sum(rows,"debtEnd"),usage);
    return Number.isFinite(g.growthRate)?g.growthRate:0;
  }
  /* شاخص ریسک بدهی (درصد) = بدهی پایان دوره ÷ درآمد دوره × ۱۰۰ */
  if(type==="debtRisk"){const s=sum(rows,"income");return s?100*sum(rows,"debtEnd")/s:0}
  const s=sum(rows,"income"); return s?((sum(rows,"debtStart")+sum(rows,"debtEnd"))/2/s)*days:0;
}
