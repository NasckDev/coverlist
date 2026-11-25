import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { callFixtureProxy, silentWav } from "../tests/support/fixture-proxy";

/** PNG 1×1 cinza: as capas ficam determinísticas e com CORS liberado, como nos CDNs reais. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==", "base64");
const WAV = Buffer.from(silentWav(3));

export async function offline(page: Page, options: { splash?: boolean } = {}) {
  if (!options.splash) await page.addInitScript(() => sessionStorage.setItem("coverlist:intro", "1"));
  await page.route("**/api/coverlist**", async (route) => {
    const { status, headers, body } = await callFixtureProxy(route.request().url());
    await route.fulfill({ status, headers, body });
  });
  await page.route(/^https:\/\/(audio-ssl\.itunes\.apple\.com|cdnt-preview\.dzcdn\.net)\//, (route) =>
    route.fulfill({ status: 200, body: WAV, headers: { "content-type": "audio/wav", "access-control-allow-origin": "*" } }),
  );
  await page.route(/^https:\/\/([a-z0-9-]+\.)?(mzstatic\.com|dzcdn\.net)\/.*\.(jpg|png)$/, (route) =>
    route.fulfill({ status: 200, body: PIXEL, headers: { "content-type": "image/png", "access-control-allow-origin": "*" } }),
  );
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
}

export async function expectNoSeriousA11yIssues(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}

export const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900;
