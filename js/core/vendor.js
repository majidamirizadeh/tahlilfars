import {VENDOR} from "./constants.js";
const inflight = new Map();
const addScript = url => new Promise((res, rej) => { const s = document.createElement("script"); s.src = url; s.async = false;
  s.onload = () => res(url); s.onerror = () => { s.remove(); rej(new Error("load failed: " + url)); }; document.head.appendChild(s); });
/** بارگذاری کتابخانهٔ global با fallback: vendor/ محلی → CDN (Memoize) */
export function loadVendor(name, globalName){
  if(globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if(inflight.has(name)) return inflight.get(name);
  const p = (async () => { let last;
    for(const url of VENDOR[name] || []){ try{ await addScript(url); if(!globalName || window[globalName]) return window[globalName]; }catch(e){ last = e; } }
    inflight.delete(name); throw last || new Error("vendor not available: " + name); })();
  inflight.set(name, p); return p;
}
