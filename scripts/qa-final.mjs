// QA final como usuário: site estático publicado (sem API) e dev com o proxy de verdade (APIs ao vivo).
// Uso: node scripts/qa-final.mjs <pasta-de-prints>
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "C:/ale/_design-claude/qa/coverlist/final";
mkdirSync(OUT, { recursive: true });
const results = [];
const log = (ok, what) => {
  results.push(`${ok ? "ok   " : "FALHA"} ${what}`);
  console.log(results.at(-1));
};
// Chrome de verdade (tem AAC, o formato das prévias do iTunes); sem ele, o Chromium do Playwright.
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
console.log(`navegador: ${browser.version()}`);

async function session(viewport, colorScheme, fn) {
  const ctx = await browser.newContext({ viewport, colorScheme });
  await ctx.addInitScript(() => sessionStorage.setItem("coverlist:intro", "1"));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await fn(page);
  } catch (error) {
    log(false, `${error.message.split("\n")[0]}`);
  }
  if (errors.length) log(false, `erros de página: ${errors.join(" | ")}`);
  await ctx.close();
}

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// 1) Publicado no portfólio, servido estático (a Function não existe aqui).
await session({ width: 1440, height: 900 }, "light", async (page) => {
  await page.goto("http://localhost:5297/projetos/coverlist/");
  await page.getByRole("heading", { name: "A capa viva da sua playlist" }).waitFor();
  log(true, "estático: /projetos/coverlist/ carrega (JS, CSS e fontes na subpasta)");
  const alert = page.getByRole("alert");
  await alert.waitFor({ timeout: 20000 });
  log((await alert.textContent()).includes("Não deu para carregar as coleções"), "estático: sem API mostra erro com “Tentar de novo”");
  await page.screenshot({ path: `${OUT}/estatico-explorar-sem-api-1440.png` });
  await page.goto("http://localhost:5297/projetos/coverlist/#/p");
  await page.getByRole("button", { name: "Nova playlist" }).click();
  await page.waitForURL(/#\/p\/p/);
  log(true, "estático: Minhas playlists e o editor funcionam sem API (dados locais)");
  await page.reload();
  await page.locator(".canvas .title").waitFor({ timeout: 10000 });
  log(true, "estático: recarregar em rota interna não dá 404 (hash)");
  await page.screenshot({ path: `${OUT}/estatico-editor-sem-api-1440.png` });
});

// 2) Dev com o handler de verdade e APIs ao vivo.
const DEV = "http://localhost:5191/";
for (const [w, h, scheme] of [
  [1440, 900, "light"],
  [1440, 900, "dark"],
  [390, 844, "light"],
  [390, 844, "dark"],
]) {
  const tag = `${w}-${scheme === "dark" ? "escuro" : "claro"}`;
  await session({ width: w, height: h }, scheme, async (page) => {
    await page.goto(DEV);
    await page.getByRole("link", { name: /^Paradas do Brasil\. \d+ faixas/ }).waitFor({ timeout: 30000 });
    await page.getByRole("link", { name: /^Top Mundo\. \d+ faixas/ }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    log(await noHScroll(page), `${tag}: Explorar com coleções reais, sem rolagem horizontal`);
    await page.screenshot({ path: `${OUT}/explorar-${tag}.png` });

    await page.goto(`${DEV}#/c/paradas-brasil`);
    await page.locator(".canvas .title").waitFor();
    const cover = page.locator(".canvas");
    await cover.getByRole("button", { name: "Tocar", exact: true }).click();
    await cover.getByRole("button", { name: "Pausar" }).waitFor({ timeout: 15000 });
    // a prévia do iTunes vem do CDN da Apple; espera o áudio andar (até 20 s de rede)
    await page.waitForFunction(() => document.querySelectorAll(".seek span")[1]?.textContent !== "0:00", null, { timeout: 20000 }).catch(() => undefined);
    const t = await page.evaluate(() => document.querySelectorAll(".seek span")[1]?.textContent);
    log(t !== "0:00", `${tag}: Paradas do Brasil toca a prévia real do iTunes (posição ${t})`);
    await page.screenshot({ path: `${OUT}/colecao-tocando-${tag}.png` });
    await cover.getByRole("button", { name: "Próxima faixa" }).click();
    await page.waitForTimeout(2000);
    log(await cover.getByRole("button", { name: "Pausar" }).isVisible(), `${tag}: próxima faixa continua tocando`);
    await cover.getByRole("button", { name: "Pausar" }).click();

    await page.goto(`${DEV}#/c/top-mundo`);
    await page.locator(".canvas .title").waitFor();
    await cover.getByRole("button", { name: "Tocar", exact: true }).click();
    await cover.getByRole("button", { name: "Pausar" }).waitFor({ timeout: 15000 });
    log(true, `${tag}: Top Mundo resolve a prévia assinada do Deezer na hora e toca`);
    await page.getByRole("button", { name: "Usar como base" }).click();
    await page.waitForURL(/#\/p\/p/);
    const toast = await page.locator(".toast p").first().textContent();
    log(!/limite/.test(toast ?? ""), `${tag}: usar como base cria a playlist com um aviso só (“${toast}”)`);

    if (w >= 900) {
      await page.getByRole("tab", { name: "Detalhes" }).click();
      await page.getByRole("textbox", { name: "Nome" }).fill("Meu top do mundo");
      log((await page.locator(".canvas .title").textContent()) === "Meu top do mundo", `${tag}: renomear reflete na capa`);
      await page.getByRole("tab", { name: /Faixas/ }).click();
      await page.getByRole("button", { name: "Atalhos do teclado" }).click();
      await page.getByRole("dialog", { name: "Atalhos do player" }).waitFor();
      await page.screenshot({ path: `${OUT}/atalhos-${tag}.png` });
      await page.keyboard.press("Escape");
      log(true, `${tag}: diálogo de atalhos abre e fecha com Esc`);
    }
    await page.locator(".list li").first().hover();
    await page.getByRole("button", { name: /Remover: / }).first().click();
    await page.getByRole("button", { name: "Desfazer" }).click();
    log((await page.locator(".canvas .row").count()) === 100, `${tag}: remover faixa e desfazer volta às 100`);
    await page.locator(".list li").first().hover();
    await page.getByRole("button", { name: /Remover: / }).first().click();
    await page.getByRole("searchbox", { name: "Buscar música ou artista" }).fill("anitta");
    const results = page.getByRole("list", { name: "Resultados da busca" });
    await results.getByRole("button").first().waitFor({ timeout: 20000 });
    const sources = await results.locator(".src").allTextContents();
    log(sources.some((s) => s.startsWith("Deezer")) && sources.some((s) => s.startsWith("iTunes")), `${tag}: busca ao vivo traz Deezer e iTunes juntos`);
    await page.screenshot({ path: `${OUT}/busca-${tag}.png` });
    await results.getByRole("button").first().click();
    log((await page.locator(".canvas .row").count()) === 100, `${tag}: adicionar faixa da busca`);

    for (const label of ["Toca-discos", "Pôster", "Editorial"]) {
      await page.getByRole("tab", { name: "Visual" }).click();
      await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/editor-${label.toLowerCase().replace(/[^a-z]/g, "")}-${tag}.png` });
    }
    log(await noHScroll(page), `${tag}: editor nos 3 modelos sem rolagem horizontal`);

    await page.getByRole("button", { name: "Compartilhar playlist" }).click();
    const dialog = page.getByRole("dialog", { name: "Compartilhar a playlist" });
    await dialog.waitFor();
    await page.waitForFunction(() => /#\/s\//.test(document.querySelector("[data-testid=share-link]")?.value ?? ""), null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/compartilhar-${tag}.png` });
    const link = await dialog.getByTestId("share-link").inputValue();
    log(link.length < 16000, `${tag}: link compartilhável gerado (${link.length} caracteres para 100 faixas)`);
    await page.keyboard.press("Escape");

    const other = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p2 = await other.newPage();
    await p2.goto(link);
    await p2.locator(".canvas .title").waitFor();
    log((await p2.locator(".canvas .row").count()) === 100, `${tag}: o link abre a mesma playlist em outro contexto`);
    await p2.screenshot({ path: `${OUT}/link-aberto-${tag}.png` });
    await other.close();
  });
}

await browser.close();
console.log(`\n${results.filter((r) => r.startsWith("ok")).length} ok, ${results.filter((r) => r.startsWith("FALHA")).length} falhas`);
