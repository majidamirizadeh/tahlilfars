/* Cache داده‌های پردازش‌شده در IndexedDB (نه LocalStorage). رکورد: {datasetId, version, hash, processorVersion, processedData, metadata, updatedAt}.
   put اتمیک است؛ رکورد فقط وقتی جایگزین می‌شود که Dataset جدید کاملاً Validate شده باشد. */
import {DB_NAME, DB_VERSION, DB_STORE} from "../core/constants.js";
let dbPromise = null;
function openDb(){
  if(!("indexedDB" in globalThis)) return Promise.resolve(null);
  return dbPromise ??= new Promise(res => { try{ const rq = indexedDB.open(DB_NAME, DB_VERSION);
    rq.onupgradeneeded = () => { if(!rq.result.objectStoreNames.contains(DB_STORE)) rq.result.createObjectStore(DB_STORE, {keyPath: "datasetId"}); };
    rq.onsuccess = () => res(rq.result); rq.onerror = rq.onblocked = () => res(null); }catch{ res(null); } });
}
const tx = (db, mode, fn) => new Promise(res => { try{ const t = db.transaction(DB_STORE, mode), rq = fn(t.objectStore(DB_STORE));
  t.oncomplete = () => res(rq?.result ?? true); t.onerror = t.onabort = () => res(null); }catch{ res(null); } });
export async function getDataset(id){ const db = await openDb(); return db ? (await tx(db, "readonly", s => s.get(id))) || null : null; }
export async function putDataset(rec){ const db = await openDb(); return db ? !!(await tx(db, "readwrite", s => s.put({...rec, updatedAt: Date.now()}))) : false; }
export async function deleteDataset(id){ const db = await openDb(); return db ? !!(await tx(db, "readwrite", s => s.delete(id))) : false; }
export async function listDatasets(){ const db = await openDb(); return db ? (await tx(db, "readonly", s => s.getAll())) || [] : []; }
