/* ثابت‌های مشترک — مسیرها نسبت به محل خود فایل‌ها محاسبه می‌شوند، نه Root سایت؛
   پس روی GitHub Pages (https://user.github.io/<repo>/) و هر زیرپوشه بدون تنظیم کار می‌کند. */
export const APP_BASE = new URL("../../", import.meta.url).href;
export const appUrl = rel => new URL(rel, APP_BASE).href;
export const MANIFEST_URL = appUrl("data/manifest.json");
export const DB_NAME = "dashboard-data", DB_VERSION = 1, DB_STORE = "datasets";
export const MANIFEST_TIMEOUT_MS = 6000, DOWNLOAD_TIMEOUT_MS = 45000;
/* کتابخانه‌ها: اول vendor/ محلی (اگر موجود بود) بعد CDN. اجرای برنامه به vendor/ وابسته نیست. */
export const VENDOR = {
  xlsx:   [appUrl("vendor/xlsx/xlsx.full.min.js"), "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"],
  lucide: [appUrl("vendor/lucide/lucide.min.js"),  "https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js"]
};
