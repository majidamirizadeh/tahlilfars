export const sum=(rows,key)=>rows.reduce((a,r)=>a+(Number(r[key])||0),0);
export const avg=(rows,key)=>rows.length?sum(rows,key)/rows.length:0;
export function median(rows,key){const a=rows.map(r=>Number(r[key])||0).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
export const min=(rows,key)=>rows.length?Math.min(...rows.map(r=>Number(r[key])||0)):0;
export const max=(rows,key)=>rows.length?Math.max(...rows.map(r=>Number(r[key])||0)):0;
export function std(rows,key){if(!rows.length)return 0;const m=avg(rows,key);return Math.sqrt(avg(rows.map(r=>({[key]:(Number(r[key])||0-m)**2})),key))}
export function groupSum(rows,groupKey,valueKey){const m=new Map();for(const r of rows){const k=r[groupKey]||"نامشخص";m.set(k,(m.get(k)||0)+(Number(r[valueKey])||0))}return [...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)}
export const percent=(a,b)=>b?100*a/b:0;

export const formatNumber=n=>Math.round(n||0).toLocaleString("fa-IR");

/** فقط عدد مصرف (بدون واحد) */
export function formatConsumptionValue(n){
  const a=Math.abs(n||0);
  if(a>=1_000_000) return (n/1_000_000).toLocaleString("fa-IR",{maximumFractionDigits:2});
  return formatNumber(n);
}
/** واحد مصرف */
export function consumptionUnit(n){
  return Math.abs(n||0)>=1_000_000 ? "میلیون مترمکعب" : "مترمکعب";
}

/** فقط عدد پولی به میلیون ریال */
const moneyIsRial=n=>Math.abs(n||0)>0&&Math.abs(n)<1_000_000;
export function formatMoneyValue(n){
  return moneyIsRial(n) ? Math.round(n).toLocaleString("fa-IR") : Math.round((n||0)/1_000_000).toLocaleString("fa-IR");
}
export const moneyUnit="میلیون ریال";
/** واحد مناسب مقدار: زیر یک میلیون ریال → «ریال» */
export const moneyUnitFor=n=>moneyIsRial(n)?"ریال":moneyUnit;

/** سازگاری با کدهای قبلی (عدد + واحد چسبیده) */
export const formatConsumption=n=>{
  const a=Math.abs(n||0);
  return a>=1_000_000
    ? (n/1_000_000).toLocaleString("fa-IR",{maximumFractionDigits:2})+" میلیون مترمکعب"
    : formatNumber(n)+" مترمکعب";
};
export const formatMoney=n=>formatMoneyValue(n)+" "+moneyUnitFor(n);

export const formatRialPerCustomer=n=>(n||0).toLocaleString("fa-IR",{maximumFractionDigits:1})+" ریال";
export const formatM3PerCustomer=n=>(n||0).toLocaleString("fa-IR",{maximumFractionDigits:2})+" مترمکعب";
export const formatMonthlyLiters=n=>(n||0).toLocaleString("fa-IR",{maximumFractionDigits:0})+" لیتر";
