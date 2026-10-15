/* رجیستری Datasetها — افزودن Dataset جدید = یک ورودی اینجا + یک پردازشگر در processors/ (+ tools/build-manifest.mjs). Engineهای قبلی تغییر نمی‌کنند. */
export const DATASETS = {
  main: { id: "main", label: "گزارش 1520", file: "./data/1520.xlsx", processor: "1520", primary: true }
  /* reading: { id:"reading", label:"گزارش قرائت", file:"./data/reading.xlsx", processor:"reading" } */
};
/* processor id → ماژول؛ هر ماژول: export const version; process(raw); validate(processed, raw, ctx) */
export const PROCESSORS = { "1520": "./processors/report1520.js" /* , reading: "./processors/reading.js" */ };
