/* ثبت Service Worker (فقط روی https یا localhost). شکست ثبت هرگز برنامه را مختل نمی‌کند. */
import {appUrl} from "./constants.js";
export function registerPWA(){
  if(!("serviceWorker" in navigator)) return;
  const go = () => navigator.serviceWorker.register(appUrl("sw.js"), {scope: appUrl("./")}).catch(e => console.warn("[pwa] register failed:", e?.message || e));
  document.readyState === "complete" ? go() : window.addEventListener("load", go, {once: true});
}
