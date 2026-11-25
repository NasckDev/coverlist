import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { offline } from "./support";

/**
 * Nada torto, cortado ou sobreposto: cada tela em 8 larguras e nos dois temas, sem rolagem horizontal,
 * com o título da capa cabendo e o vinil sem invadir o texto. Roda num projeto só (ele mesmo varia
 * largura e tema). Com QA_SHOTS=<pasta>, salva um print de viewport de cada combinação.
 */
const WIDTHS = [320, 375, 390, 768, 1024, 1280, 1440, 1920] as const;
const HEIGHT_FOR = (w: number) => (w < 768 ? 844 : w < 1280 ? 1024 : w < 1920 ? 900 : 1080);
const SHOTS = process.env.QA_SHOTS;

interface Report {
  overflowX: number;
  title: { sw: number; cw: number; lines: number; maxLines: number } | null;
  overlaps: string[];
  clipped: string[];
}

async function inspect(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const report: Report = { overflowX: de.scrollWidth - de.clientWidth, title: null, overlaps: [], clipped: [] };
    const inner = document.querySelector<HTMLElement>(".canvas .inner");
    const title = document.querySelector<HTMLElement>(".canvas .title");
    if (inner && title) {
      const lh = parseFloat(getComputedStyle(inner).getPropertyValue("--lh")) || 0.9;
      const px = parseFloat(getComputedStyle(title).fontSize) * lh;
      report.title = {
        sw: title.scrollWidth,
        cw: title.clientWidth,
        lines: Math.round(title.offsetHeight / px),
        maxLines: parseFloat(getComputedStyle(inner).getPropertyValue("--lines")) || 3,
      };
    }
    const canvas = document.querySelector<HTMLElement>(".canvas")?.getBoundingClientRect();
    const disc = document.querySelector<HTMLElement>(".canvas .disc")?.getBoundingClientRect();
    if (canvas && disc) {
      const cx = disc.left + disc.width / 2;
      const cy = disc.top + disc.height / 2;
      const R = disc.width / 2;
      const texts = [".head .kicker", ".head .title", ".head .desc", ".head .sum", ".now-text", ".now .ctrl", ".now .seek", ".tracks .row"];
      const list = document.querySelector<HTMLElement>(".canvas .tracks")?.getBoundingClientRect();
      for (const sel of texts) {
        for (const el of document.querySelectorAll<HTMLElement>(`.canvas ${sel}`)) {
          const r = el.getBoundingClientRect();
          // linhas da lista só contam na parte visível da própria lista (ela rola por dentro)
          const clip = sel === ".tracks .row" && list ? list : canvas;
          const top = Math.max(r.top, canvas.top, clip.top);
          const bottom = Math.min(r.bottom, canvas.bottom, clip.bottom);
          if (!r.width || bottom <= top) continue;
          // menor distância do centro do disco até o retângulo do texto
          const dx = Math.max(r.left - cx, 0, cx - r.right);
          const dy = Math.max(top - cy, 0, cy - bottom);
          if (Math.hypot(dx, dy) < R - 2) report.overlaps.push(`${sel} "${(el.textContent ?? "").slice(0, 24)}"`);
        }
      }
      // controles do player não podem ficar fora da capa
      for (const el of document.querySelectorAll<HTMLElement>(".canvas .now .ctrl button")) {
        const r = el.getBoundingClientRect();
        if (r.right > canvas.right + 1 || r.left < canvas.left - 1 || r.bottom > canvas.bottom + 1) report.clipped.push("controle do player");
      }
    }
    return report;
  });
}

async function check(page: Page, screen: string, width: number, theme: string) {
  await page.waitForTimeout(450);
  const r = await inspect(page);
  const where = `${screen} @ ${width}px ${theme}`;
  expect(r.overflowX, `${where}: rolagem horizontal`).toBeLessThanOrEqual(0);
  if (r.title) {
    expect(r.title.sw, `${where}: título mais largo que a capa`).toBeLessThanOrEqual(r.title.cw + 1);
    expect(r.title.lines, `${where}: título com linhas demais`).toBeLessThanOrEqual(r.title.maxLines);
  }
  expect(r.overlaps, `${where}: vinil sobre o texto`).toEqual([]);
  expect(r.clipped, `${where}: controles cortados`).toEqual([]);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${screen}-${width}-${theme}.png` });
  }
}

test("telas sem rolagem horizontal, título cabendo e vinil fora do texto em 8 larguras e 2 temas", async ({ page }, info) => {
  test.skip(info.project.name !== "1440-claro", "a varredura de larguras roda uma vez só");
  test.setTimeout(50 * 60_000);
  await offline(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  // Uma playlist cheia (50 faixas) para o editor e o diálogo.
  await page.goto("./#/c/top-mundo");
  await page.getByRole("button", { name: "Usar como base" }).click();
  await expect(page).toHaveURL(/#\/p\/p/);
  const editor = page.url();

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT_FOR(width) });

      await page.goto("./#/");
      await expect(page.getByRole("link", { name: /^Top Mundo\. 100 faixas/ })).toBeVisible();
      await check(page, "explorar", width, theme);

      await page.goto("./#/p");
      await expect(page.getByRole("heading", { name: "Minhas playlists" })).toBeVisible();
      await check(page, "minhas-playlists", width, theme);

      await page.goto("./#/c/paradas-brasil");
      await expect(page.locator(".canvas .title")).toHaveText("Paradas do Brasil");
      await check(page, "colecao", width, theme);

      await page.goto(editor);
      await expect(page.locator(".canvas .title")).toBeVisible();
      for (const [layout, label] of [
        ["editorial", "Editorial"],
        ["deck", "Toca-discos"],
        ["poster", "Pôster"],
      ] as const) {
        await page.getByRole("tab", { name: "Visual" }).click();
        await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
        await expect(page.locator(".inner")).toHaveAttribute("data-layout", layout);
        await page.locator(".canvas").scrollIntoViewIfNeeded();
        await check(page, `editor-${layout}`, width, theme);
      }

      await page.getByRole("button", { name: "Compartilhar playlist" }).click();
      await expect(page.getByRole("dialog", { name: "Compartilhar a playlist" })).toBeVisible();
      await check(page, "compartilhar", width, theme);
      await page.keyboard.press("Escape");
    }
  }
});
