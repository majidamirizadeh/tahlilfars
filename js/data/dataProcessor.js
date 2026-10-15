import {computeYearDay} from "../core/yearDay.js";
export const ALIASES = {
  area:["نام امور","امور"],
  cityCode:["کد شهر"],
  city:["نام شهر","شهر"],
  usageCode:["کد صورت مالی"],
  usage:["عنوان صورت مالی","کاربری مالی"],
  customers:["تعداد اشتراک فعال","تعداد مشترک","مشترکین"],
  consumption:["مصرف"],
  income:["جمع درآمد آب بها (قبوض)","درآمد"],
  collection:["جمع دریافتی(وصول)","وصول","دریافتی"],
  debtStart:["مانده بدهی آب بها در اول دوره","بدهی اول دوره"],
  debtEnd:["مانده بدهی آب بها در انتهای دوره","بدهی انتهای دوره"]
};
const normalize = s => String(s??"").replace(/\u200c/g," ").replace(/\s+/g," ").trim();
function keyOf(headers, aliases){ const map=headers.map(normalize); return aliases.map(normalize).map(a=>map.findIndex(h=>h===a)).find(i=>i>=0); }
function num(v){ if(v===null||v===undefined||v==="") return 0; if(typeof v==="number") return Number.isFinite(v)?v:0; const s=String(v).replace(/,/g,"").replace(/[^\d.-]/g,""); return Number(s)||0; }

function extractPeriod(text=""){
  const m=String(text).match(/از\s*تاریخ\s*([0-9۰-۹]{4}[\/-][0-9۰-۹]{1,2}[\/-][0-9۰-۹]{1,2})\s*تا\s*تاریخ\s*([0-9۰-۹]{4}[\/-][0-9۰-۹]{1,2}[\/-][0-9۰-۹]{1,2})/i);
  if(!m) return {from:"",to:"",days:0,months:1};
  const fa=s=>s.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/-/g,"/");
  const from=fa(m[1]), to=fa(m[2]);
  const jalaliToGregorian=(jy,jm,jd)=>{
    let gy,gm,gd,days;
    jy += 1595;
    days = -355668 + (365 * jy) + Math.floor(jy/33)*8 + Math.floor(((jy%33)+3)/4) + jd + (jm < 7 ? (jm-1)*31 : ((jm-7)*30)+186);
    gy = 400 * Math.floor(days/146097); days %= 146097;
    if(days > 36524){ gy += 100 * Math.floor(--days/36524); days %= 36524; if(days >= 365) days++; }
    gy += 4 * Math.floor(days/1461); days %= 1461;
    if(days > 365){ gy += Math.floor((days-1)/365); days = (days-1)%365; }
    gd = days + 1;
    const sal=[0,31,59,90,120,151,181,212,243,273,304,334];
    for(gm=1; gm<=12 && gd > sal[gm-1] + (gm>2 && ((gy%4===0&&gy%100!==0)||gy%400===0)?1:0); gm++);
    const leap=((gy%4===0&&gy%100!==0)||gy%400===0)?1:0;
    gd -= sal[gm-1] + (gm>2?leap:0);
    return new Date(Date.UTC(gy,gm-1,gd));
  };
  const parse=s=>{const [y,m,d]=s.split("/").map(Number); return jalaliToGregorian(y,m,d)};
  const a=parse(from), b=parse(to);
  const days=Math.max(0,Math.round((b-a)/86400000));
  const yearDay=computeYearDay(to); return {from,to,days,months:Math.max(1,days/30.4375),yearDay};
}

export function processRaw(raw){
  let headerRow = raw.findIndex(row => row.some(c => ALIASES.area.includes(normalize(c))));
  if(headerRow<0) throw new Error("سطر عنوان ستون‌های مورد انتظار پیدا نشد.");
  const headers=raw[headerRow].map(normalize);
  const idx={};
  for(const [k,a] of Object.entries(ALIASES)) idx[k]=keyOf(headers,a);
  const reportTitle=normalize(raw[0]?.[0]);
  const period=extractPeriod(reportTitle);
  const rows=raw.slice(headerRow+1).map(r=>{
    const city=idx.city>=0?normalize(r[idx.city]):"";
    if(city.startsWith("جمع")) return null;
    return {
      area: idx.area>=0?normalize(r[idx.area]):"",
      cityCode: idx.cityCode>=0?r[idx.cityCode]:"",
      city,
      settlementType: city.startsWith("بخش") ? "روستا" : "شهر",
      usageCode: idx.usageCode>=0?r[idx.usageCode]:"",
      usage: idx.usage>=0?normalize(r[idx.usage]):"",
      customers:num(idx.customers>=0?r[idx.customers]:0),
      consumption:num(idx.consumption>=0?r[idx.consumption]:0),
      income:num(idx.income>=0?r[idx.income]:0),
      collection:num(idx.collection>=0?r[idx.collection]:0),
      debtStart:num(idx.debtStart>=0?r[idx.debtStart]:0),
      debtEnd:num(idx.debtEnd>=0?r[idx.debtEnd]:0)
    };
  }).filter(r=>r && (r.area||r.city||r.usage));
  return {headers,rows,idx,headerRow,reportTitle,period};
}

