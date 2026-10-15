/* «روز سپری‌شده از سال» از تاریخ پایان دوره (شمسی، YYYY/MM/DD با ارقام لاتین).
   ماه ۱–۶: day + (month−1)×31 · ماه ۷–۱۲: 186 + (month−7)×30 + day (۱ فروردین = ۱). نامعتبر → null (نمایش «—»). */
export function computeYearDay(dateStr){
  const m = /^(\d{3,4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(String(dateStr ?? "").trim());
  if(!m) return null;
  const month = Number(m[2]), day = Number(m[3]);
  if(!(month >= 1 && month <= 12 && day >= 1 && day <= (month <= 6 ? 31 : 30))) return null;
  return (month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30) + day;
}
