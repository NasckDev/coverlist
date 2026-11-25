// Inspeção rápida no navegador durante o desenvolvimento.
// Uso: node scripts/eval.mjs <url> "<expressão JS>" [espera-ms]
import { chromium } from "@playwright/test";

const [url, expr, wait = "4000"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => sessionStorage.setItem("coverlist:intro", "1"));
await page.goto(url);
await page.waitForTimeout(Number(wait));
console.log(JSON.stringify(await page.evaluate(expr), null, 1));
await browser.close();
