/* رجیستری تنظیمات — همه آستانه‌ها، وزن‌ها و کلیدهای هشدار از اینجا خوانده می‌شوند.
   ─ افزودن تنظیم جدید:  registerSetting({id, group, label, default, ...})  → خودکار در منوی تنظیمات ظاهر می‌شود.
   ─ افزودن گروه جدید:   registerGroup({id, label, order})
   ─ فقط مقادیر تغییر‌داده‌شده در localStorage ذخیره می‌شوند؛ بقیه همیشه از مقدار پیش‌فرض کد خوانده می‌شوند. */
const KEY = "dashboard.settings.v1";
const defs = new Map();      // id → تعریف
const groups = new Map();    // id → {id,label,order}
const listeners = new Set();
let over = load();

function load(){
  try{ const o = JSON.parse(localStorage.getItem(KEY)||"{}"); return (o && typeof o==="object") ? o : {}; }
  catch{ return {}; }
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(over)); }catch{} }
const notify = () => listeners.forEach(fn=>{ try{ fn(); }catch(e){ console.error(e); } });

/** type: "number" (پیش‌فرض) | "bool" | "list" (انتخاب چندتایی؛ options از getOptions می‌آید) */
export function registerSetting(def){
  defs.set(def.id, {type:"number", step:1, ...def});
}
export function registerGroup(g){ groups.set(g.id, {order:99, ...g}); }

const clampNum = (d,v) => {
  let x = Number(v); if(!Number.isFinite(x)) return d.default;
  if(d.min!==undefined) x = Math.max(d.min,x);
  if(d.max!==undefined) x = Math.min(d.max,x);
  return x;
};
export function get(id){
  const d = defs.get(id); if(!d) return undefined;
  if(!(id in over)) return d.default;
  const v = over[id];
  if(d.type==="bool") return !!v;
  if(d.type==="list") return Array.isArray(v) ? v : d.default;
  return clampNum(d,v);
}
export function set(id,value){
  const d = defs.get(id); if(!d) return;
  const v = d.type==="bool" ? !!value : d.type==="list" ? [...value] : clampNum(d,value);
  if(JSON.stringify(v)===JSON.stringify(d.default)) delete over[id]; else over[id] = v;
  save(); notify();
}
export const isModified = id => id in over;
export function reset(id){ if(id in over){ delete over[id]; save(); notify(); } }
export function resetAll(){ over = {}; save(); notify(); }
export const onChange = fn => { listeners.add(fn); return ()=>listeners.delete(fn); };
export const modifiedCount = () => Object.keys(over).filter(k=>defs.has(k)).length;

/** ساختار برای رسم منو: [{group, sections:[{title, note, items:[def]}]}] */
export function schema(){
  const gs = [...groups.values()].sort((a,b)=>a.order-b.order);
  return gs.map(g=>{
    const items = [...defs.values()].filter(d=>d.group===g.id);
    const secs = new Map();
    items.forEach(d=>{ const t=d.section||""; if(!secs.has(t)) secs.set(t,{title:t,note:d.sectionNote||"",items:[]}); secs.get(t).items.push(d); });
    return {group:g, sections:[...secs.values()]};
  }).filter(x=>x.sections.length);
}
