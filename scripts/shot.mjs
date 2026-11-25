// Uso: node scripts/shot.mjs <url> <arquivo.png> [largura] [altura] [dark] [ação]
import { chromium } from "@playwright/test";
const [url, out, w = "1440", h = "900", scheme = "light", wait = "2500"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme });
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.addInitScript(() => sessionStorage.setItem("coverlist:intro", "1"));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(logs.join("\n") || "no console errors");
await browser.close();
