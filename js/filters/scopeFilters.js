/* فیلترهای دامنهٔ مشترک بین تب‌ها: «نیروهای مسلح» (۳ حالته) و «شهر/روستا» (۳ حالته).
   هوم/تحلیل/خروجی از نوار بالای صفحه (app.js) و تب‌های مالی و ناهنجاری از نوار اختصاصی خودشان استفاده می‌کنند؛
   منطق و ظاهر کلیدها در همه‌جا یکی است. */
export const ARMED_USAGE = "نیروهای مسلح";
const isArmed = u => /نیروهای\s*مسلح/.test(String(u||""));

/* با هر کلیک حالت بعدی: با نیروی مسلح ← بدون نیروی مسلح ← فقط نیروی مسلح ← … (پیش‌فرض همه‌جا: بدون نیروی مسلح) */
export const ARMED = {
  with:{label:"با نیروی مسلح", icon:"👥"},
  without:{label:"بدون نیروی مسلح", icon:"🚫"},
  only:{label:"نیروی مسلح", icon:"🪖"}
};
export const ARMED_ORDER = ["with","without","only"];
export const ARMED_DEFAULT = "without";

/* با هر کلیک حالت بعدی: شهر/روستا (هر دو) ← شهر ← روستا ← … */
export const SETTLEMENT = {
  all:{label:"شهر/روستا", icon:"🏙️🌾"},
  city:{label:"شهر", icon:"🏙️"},
  rural:{label:"روستا", icon:"🌾"}
};
export const SETTLEMENT_ORDER = ["all","city","rural"];

export const nextOf = (order, cur) => order[(order.indexOf(cur)+1) % order.length];

export function armedRows(rows, mode){
  if(mode === "only") return rows.filter(r=>isArmed(r.usage));
  if(mode === "without") return rows.filter(r=>!isArmed(r.usage));
  return rows;
}
export function settlementRows(rows, mode){
  if(mode === "city") return rows.filter(r=>r.settlementType === "شهر");
  if(mode === "rural") return rows.filter(r=>r.settlementType === "روستا");
  return rows;
}
/** هر دو فیلتر با هم (ترتیب مهم نیست) */
export const scopeRows = (rows, {armed=ARMED_DEFAULT, settlement="all"}={}) => settlementRows(armedRows(rows, armed), settlement);

/** ردیف کلیدهای بالای نوار فیلتر (همان ظاهر نوار هوم). attr = نام صفتی که کلیک‌ها با آن شناسایی می‌شوند، مثلاً data-fin-scope */
export function scopeButtonsHtml({armed, settlement}, attr){
  const a = ARMED[armed] || ARMED[ARMED_DEFAULT], s = SETTLEMENT[settlement] || SETTLEMENT.all;
  return `<div class="filters-row filters-row-toggles">
    <button type="button" class="cycle-btn armed-btn" ${attr}="armed" data-state="${armed}" title="نیروهای مسلح: با نیروی مسلح / بدون نیروی مسلح / فقط نیروی مسلح (با هر کلیک عوض می‌شود)">
      <span class="cyc-ico">${a.icon}</span><span>${a.label}</span></button>
    <button type="button" class="settlement-btn" ${attr}="settlement" data-state="${settlement}" title="نوع سکونتگاه: شهر و روستا / فقط شهر / فقط روستا (با هر کلیک عوض می‌شود)">
      <span class="stl-ico">${s.icon}</span><span>${s.label}</span></button>
  </div>`;
}
