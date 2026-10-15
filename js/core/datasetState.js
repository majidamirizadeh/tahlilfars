/* شناسهٔ نسخهٔ دادهٔ فعال؛ در کلید Cacheهای محاسباتی موتورها ترکیب می‌شود تا بعد از Update داده قدیمی نمایش داده نشود. */
let version = ""; const listeners = new Set();
export const getDatasetVersion = () => version;
export function setDatasetVersion(v){ const nv = String(v ?? ""); if(nv === version) return; version = nv; listeners.forEach(fn => { try{ fn(version); }catch(e){ console.error(e); } }); }
export const onDatasetVersionChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
