/* منوی همبرگری تنظیمات — به‌صورت خودکار از رجیستری settings.js ساخته می‌شود.
   هر تنظیم/هشدار/شاخص جدیدی که با registerSetting / registerThreshold / registerAlertRule ثبت شود، خودش اینجا ظاهر می‌شود. */
import {schema, get, set, reset, resetAll, isModified, modifiedCount, onChange} from "./settings.js";

const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const faN = n => Number(n).toLocaleString("fa-IR");
const KEEP_OPEN = new Set(); /* دیفالت همه گروه‌ها بسته */

export function initSettingsMenu({button, getOptions=()=>[], beforeOpen=null}){
  let root = null, open = false, defsById = new Map();

  function itemHtml(d){
    const label = `<span class="st-label">${esc(d.label)}${d.desc?`<small>${esc(d.desc)}</small>`:""}</span>`;
    let ctl;
    if(d.type==="bool"){
      ctl = `<label class="rp-switch"><input type="checkbox" data-st-input="${d.id}" ${get(d.id)?"checked":""}><span class="rp-track"></span></label>`;
    }else if(d.type==="list"){
      const cur = new Set(get(d.id));
      const opts = [...new Set([...getOptions(d.id), ...cur])];
      ctl = `<div class="st-chips">${opts.map(o=>`<button type="button" class="st-chip ${cur.has(o)?"on":""}" data-st-list="${d.id}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
    }else{
      ctl = `<input type="number" class="st-num" dir="ltr" data-st-input="${d.id}" value="${get(d.id)}" min="${d.min??""}" max="${d.max??""}" step="${d.step}" inputmode="decimal">${d.unit?`<span class="st-unit">${esc(d.unit)}</span>`:""}`;
    }
    return `<div class="st-item ${d.type==="list"?"st-item-list":""} ${isModified(d.id)?"modified":""}" data-st-item="${d.id}">${label}<div class="st-ctl">${ctl}<button type="button" class="st-reset" data-st-reset="${d.id}" title="بازگردانی به پیش‌فرض" aria-label="بازگردانی به پیش‌فرض">↺</button></div></div>`;
  }

  function build(){
    defsById = new Map();
    const body = schema().map(({group,sections})=>{
      sections.forEach(s=>s.items.forEach(d=>defsById.set(d.id,d)));
      const n = sections.reduce((a,s)=>a+s.items.filter(d=>isModified(d.id)).length,0);
      return `<details class="st-group" data-st-group="${group.id}" ${KEEP_OPEN.has(group.id)?"open":""}>
        <summary><span>${esc(group.label)}</span><em class="st-badge" ${n?"":"hidden"}>${faN(n)} تغییر</em></summary>
        ${sections.map(s=>`<div class="st-section">${s.title?`<h4>${esc(s.title)}</h4>`:""}${s.note?`<p class="st-note">${esc(s.note)}</p>`:""}${s.items.map(itemHtml).join("")}</div>`).join("")}
      </details>`;
    }).join("");
    return `<div class="st-backdrop" data-st="close"></div>
      <aside class="st-panel" role="dialog" aria-label="تنظیمات">
        <header><h2>تنظیمات آستانه‌ها و هشدارها</h2><button type="button" class="st-close" data-st="close" aria-label="بستن">×</button></header>
        <p class="st-intro">تغییرات بلافاصله در تب‌های تحلیل و خروجی اعمال و در همین مرورگر ذخیره می‌شوند.</p>
        <div class="st-body">${body}</div>
        <footer><span class="st-total"></span><button type="button" class="st-resetall" data-st="resetall">بازگردانی همه به پیش‌فرض</button></footer>
      </aside>`;
  }

  /* به‌روزرسانی سبک بدون ساخت دوباره (تا فوکوس و اسکرول حفظ شود) */
  function paint(){
    if(!root || !root.querySelector(".st-body")) return;
    try{
      root.querySelectorAll("[data-st-item]").forEach(el=>el.classList.toggle("modified", isModified(el.dataset.stItem)));
      root.querySelectorAll("[data-st-group]").forEach(g=>{
        const n = [...g.querySelectorAll("[data-st-item]")].filter(el=>isModified(el.dataset.stItem)).length;
        const b = g.querySelector(".st-badge"); if(b){ b.hidden = !n; b.textContent = faN(n)+" تغییر"; }
      });
      const t = modifiedCount();
      const total = root.querySelector(".st-total"); if(total) total.textContent = t ? `${faN(t)} تنظیم تغییر کرده` : "همه مقادیر پیش‌فرض‌اند";
      const ra = root.querySelector(".st-resetall"); if(ra) ra.disabled = !t;
    }catch(err){ console.error("settings paint", err); }
  }
  function syncInputs(){
    if(!root) return;
    try{
      root.querySelectorAll("[data-st-input]").forEach(inp=>{
        if(document.activeElement===inp) return;
        const v = get(inp.dataset.stInput);
        if(inp.type==="checkbox") inp.checked = !!v; else inp.value = v;
      });
      root.querySelectorAll("[data-st-list]").forEach(b=>b.classList.toggle("on", (get(b.dataset.stList)||[]).includes(b.dataset.v)));
    }catch(err){ console.error("settings sync", err); }
  }

  function show(){
    if(!root){ root = document.createElement("div"); root.id = "settingsRoot"; document.body.appendChild(root); bind(); }
    const keepOpen = new Set([...root.querySelectorAll("details[open]")].map(d=>d.dataset.stGroup));
    root.innerHTML = build();
    keepOpen.forEach(id=>root.querySelector(`[data-st-group="${id}"]`)?.setAttribute("open",""));
    paint();
    root.classList.add("open"); open = true; button.setAttribute("aria-expanded","true");
    document.body.classList.add("settings-open");
  }
  function hide(){ if(!root) return; root.classList.remove("open"); open = false; button.setAttribute("aria-expanded","false"); document.body.classList.remove("settings-open"); }

  let timer = null;
  function bind(){
    root.addEventListener("click", e=>{
      /* جلوگیری از بسته/باز شدن تصادفی details وقتی روی کنترل کلیک می‌شود */
      if(e.target.closest("[data-st-input], .st-ctl, .rp-switch, .st-chip, .st-reset, .st-num")) e.stopPropagation();
      const t = e.target.closest("[data-st],[data-st-reset],[data-st-list]"); if(!t) return;
      if(t.dataset.st==="close") return hide();
      if(t.dataset.st==="resetall"){ if(confirm("همه تنظیمات به مقدار پیش‌فرض برگردد؟")){ resetAll(); syncInputs(); paint(); } return; }
      if(t.dataset.stReset){ reset(t.dataset.stReset); syncInputs(); paint(); return; }
      if(t.dataset.stList){
        const id = t.dataset.stList, cur = new Set(get(id)||[]);
        cur.has(t.dataset.v) ? cur.delete(t.dataset.v) : cur.add(t.dataset.v);
        set(id,[...cur]); syncInputs(); paint();
      }
    });
    const commit = inp => {
      const id = inp.dataset.stInput; if(!id) return;
      try{
        if(inp.type==="checkbox") set(id, !!inp.checked);
        else if(inp.value!=="" && Number.isFinite(Number(inp.value))) set(id, Number(inp.value));
        paint();
      }catch(err){ console.error("settings commit", err); }
    };
    /* فقط برای number: input با تاخیر؛ برای checkbox فقط change تا از دوباره‌کاری و سفیدشدن جلوگیری شود */
    root.addEventListener("input", e=>{
      const inp=e.target.closest("[data-st-input]"); if(!inp || inp.type==="checkbox") return;
      clearTimeout(timer); timer=setTimeout(()=>commit(inp),350);
    });
    root.addEventListener("change", e=>{
      const inp=e.target.closest("[data-st-input]"); if(!inp) return;
      e.stopPropagation();
      clearTimeout(timer);
      commit(inp);
      if(inp.type!=="checkbox"){ try{ inp.value = get(inp.dataset.stInput); }catch{} }
    });
  }

  button.addEventListener("click", async ()=>{
    if(open) return hide();
    if(beforeOpen){ try{ await beforeOpen(); }catch(err){ console.error("settings beforeOpen", err); } }   /* ثبت تنظیمات موتورهایی که Lazy Load می‌شوند */
    show();
  });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape" && open) hide(); });
  onChange(()=>{ if(open){ syncInputs(); paint(); } });
  return {show, hide};
}
