import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues, isNarrow, offline } from "./support";

test.describe("Coverlist", () => {
  test("explorar → abrir coleção → tocar a prévia → usar como base", async ({ page }) => {
    await offline(page);
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "A capa viva da sua playlist" })).toBeVisible();
    const card = page.getByRole("link", { name: /^Top Mundo\. 100 faixas/ });
    await expect(card).toBeVisible();
    await expectNoSeriousA11yIssues(page);

    await card.click();
    await expect(page).toHaveURL(/#\/c\/top-mundo$/);
    await expect(page.getByRole("heading", { level: 1, name: "Top Mundo" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("1 faixa sem prévia");

    const cover = page.locator(".canvas");
    await cover.getByRole("button", { name: "Tocar", exact: true }).click();
    await expect(cover.getByRole("button", { name: "Pausar" })).toBeVisible();
    await expect(page.locator(".inner")).toHaveClass(/playing/);
    await expect(cover.locator(".row[aria-current='true']")).toContainText("Choosin' Texas");

    await cover.getByRole("button", { name: "Próxima faixa" }).click();
    await expect(cover.locator(".row[aria-current='true']")).toContainText("Boston");
    if (!isNarrow(page)) {
      // Atalho global: com o foco fora de botões e campos, espaço pausa.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Space");
      await expect(cover.getByRole("button", { name: "Tocar", exact: true })).toBeVisible();
    } else {
      await cover.getByRole("button", { name: "Pausar" }).click();
    }
    await expectNoSeriousA11yIssues(page);

    await page.getByRole("button", { name: "Usar como base" }).click();
    await expect(page).toHaveURL(/#\/p\/p[a-z0-9]+$/);
    await expect(page.getByText("Playlist criada com 100 faixas de “Top Mundo”.")).toBeVisible();
    await expect(page.getByText(/limite/i)).toHaveCount(0);
    // A playlist copiada continua editável: dá para buscar e adicionar (100 é o teto, a cópia veio com 100).
    await page.getByRole("searchbox", { name: "Buscar música ou artista" }).fill("anitta");
    await page.getByRole("list", { name: "Resultados da busca" }).getByRole("button").nth(1).click();
    await expect(page.getByText("A playlist já tem 100 faixas, o limite. Remova uma para adicionar outra.")).toBeVisible();
    await expect(page.getByText(/limite/i)).toHaveCount(1);
  });

  test("criar playlist → buscar e adicionar → reordenar (teclado e arrastar) → compartilhar link", async ({ page, context }) => {
    await offline(page);
    await page.goto("./#/p");
    await page.getByRole("button", { name: "Nova playlist" }).click();
    await expect(page).toHaveURL(/#\/p\/p[a-z0-9]+$/);

    await page.getByRole("tab", { name: "Detalhes" }).click();
    await page.getByRole("textbox", { name: "Nome" }).fill("Domingo no repeat");
    await page.getByRole("textbox", { name: "Quem montou" }).fill("Ale");
    await expect(page.locator(".canvas .title")).toHaveText("Domingo no repeat");
    await expect(page.locator(".canvas .kicker")).toHaveText("Playlist de Ale");
    await page.getByRole("tab", { name: /Faixas/ }).click();

    const search = page.getByRole("searchbox", { name: "Buscar música ou artista" });
    const results = page.getByRole("list", { name: "Resultados da busca" });
    for (const pick of [0, 1, 2]) {
      await search.fill("anitta");
      await expect(results.getByRole("button").nth(pick)).toBeVisible();
      await results.getByRole("button").nth(pick).click();
    }
    const list = page.getByRole("list", { name: "Faixas da playlist" }).first();
    const titles = () => list.locator(".t-meta b").allTextContents();
    const before = await titles();
    expect(before).toHaveLength(3);
    await expect(page.locator(".canvas .sum")).toContainText("3 faixas");

    // Teclado: a alça com ↓ desce a primeira faixa.
    await list.locator("li").first().hover();
    await list.getByRole("button", { name: /^Reordenar/ }).first().focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(titles).toEqual([before[1], before[0], before[2]]);
    await expect(page.getByText(`${before[0]} movida para a posição 2 de 3.`)).toBeAttached();

    // Arrastar: a terceira vai para o topo.
    const rows = list.locator("li");
    const handle = rows.nth(2).getByRole("button", { name: /^Reordenar/ });
    await rows.nth(2).hover();
    const from = await handle.boundingBox();
    const to = await rows.nth(0).boundingBox();
    if (!from || !to) throw new Error("sem caixa");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect.poll(titles).toEqual([before[2], before[1], before[0]]);
    await expect(page.locator(".canvas .row .m b").first()).toHaveText(before[2]);

    await page.getByRole("tab", { name: "Visual" }).click();
    await page.getByRole("button", { name: /Pôster/ }).click();
    await page.getByRole("button", { name: "Menta" }).click();
    await expect(page.locator(".inner")).toHaveAttribute("data-layout", "poster");
    await expectNoSeriousA11yIssues(page);

    await page.getByRole("button", { name: "Compartilhar playlist" }).click();
    const dialog = page.getByRole("dialog", { name: "Compartilhar a playlist" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Quadrado/ }).click();
    await expect(dialog.getByRole("img", { name: /quadrado 1:1/ })).toBeVisible();
    const link = dialog.getByTestId("share-link");
    await expect(link).toHaveValue(/#\/s\/[A-Za-z0-9_-]+$/);
    const url = await link.inputValue();
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Baixar imagem" }).click();
    expect((await download).suggestedFilename()).toBe("coverlist-domingo-no-repeat-quadrado.png");
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole("button", { name: "Fechar" }).click();

    // O link reabre a mesma playlist em outro navegador (contexto sem nada salvo).
    const other = await context.browser()!.newContext({ viewport: page.viewportSize()! });
    const page2 = await other.newPage();
    await offline(page2);
    await page2.goto(url);
    await expect(page2.locator(".canvas .title")).toHaveText("Domingo no repeat");
    await expect(page2.locator(".inner")).toHaveAttribute("data-layout", "poster");
    await expect(page2.locator(".canvas .row .m b")).toHaveText([before[2], before[1], before[0]]);
    await page2.getByRole("button", { name: "Salvar nas minhas" }).click();
    await expect(page2).toHaveURL(/#\/p\/p[a-z0-9]+$/);
    await other.close();
  });

  test("excluir com desfazer, exportar e importar JSON, importar link do Deezer, tema e link inválido", async ({ page }) => {
    await offline(page);
    await page.goto("./#/p");
    await page.getByRole("button", { name: "Nova playlist" }).click();
    await page.getByRole("link", { name: "Minhas playlists" }).first().click();
    await page.getByRole("button", { name: "Excluir Nova playlist" }).click();
    await expect(page.getByText("Nenhuma playlist ainda")).toBeVisible();
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect(page.getByRole("link", { name: /^Abrir Nova playlist/ })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^coverlist-playlists-\d{4}-\d{2}-\d{2}\.json$/);
    // O arquivo exportado volta pelo importar: a playlist aparece de novo, com outro id.
    await page.locator("input[type=file]").setInputFiles((await file.path())!);
    await expect(page.getByText("1 playlist importada.")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Abrir Nova playlist/ })).toHaveCount(2);

    await page.getByRole("textbox", { name: "Link ou nome da playlist" }).fill("https://www.deezer.com/br/playlist/3155776842");
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page).toHaveURL(/#\/p\/p[a-z0-9]+$/);
    await expect(page.getByText("100 faixas importadas do Deezer.")).toBeVisible();
    await expect(page.locator(".canvas .title")).toHaveText("Top Worldwide");

    await page.goto("./#/p");
    const theme = page.getByRole("button", { name: /^Tema:/ });
    await theme.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await theme.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoSeriousA11yIssues(page);
    await theme.click();

    await page.goto("./#/s/link-adulterado");
    await expect(page.getByRole("alert")).toContainText("Link inválido");
  });

  test("décadas → play no cartão → coleção já tocando → voltar ao mesmo filtro", async ({ page }) => {
    await offline(page);
    await page.goto("./");
    await page.getByRole("link", { name: "Décadas", exact: true }).click();
    await expect(page).toHaveURL(/#\/g\/decadas$/);
    await page.getByRole("link", { name: "Anos 80", exact: true }).click();
    await expect(page).toHaveURL(/#\/g\/decadas\/1980$/);
    await expectNoSeriousA11yIssues(page);

    await page.getByRole("button", { name: "Ouvir as prévias de Anos 80", exact: true }).click();
    await expect(page).toHaveURL(/#\/c\/anos-80$/);
    // Um clique: a capa abre tocando a primeira faixa com prévia.
    await expect(page.locator(".inner")).toHaveClass(/playing/);
    await expect(page.getByRole("button", { name: "Pausar prévia" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Resumo da coleção" })).toContainText("100 faixas");
    await expectNoSeriousA11yIssues(page);

    // O voltar aparece sem rolar, no topo (celular) ou no painel (desktop), e volta ao mesmo filtro.
    const back = page.getByRole("link", { name: "Voltar para Décadas · Anos 80" });
    await expect(back).toBeVisible();
    await expect(back).toBeInViewport();
    await back.click();
    await expect(page).toHaveURL(/#\/g\/decadas\/1980$/);
  });

  test("importa pelo link de compartilhar do app do Deezer e procura pelo nome", async ({ page }) => {
    await offline(page);
    await page.goto("./#/p");
    const field = page.getByRole("textbox", { name: "Link ou nome da playlist" });
    await field.fill("https://link.deezer.com/s/31Wq4dKe1ARDAb5TeNIGh");
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.getByText(/pode ter vencido ou estar incompleto/)).toBeVisible();

    await field.fill("rock");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    const results = page.getByRole("list", { name: "Playlists do Deezer encontradas" });
    await expect(results.getByRole("button").first()).toBeVisible();
    await expectNoSeriousA11yIssues(page);

    await field.fill("Ouça no Deezer: https://link.deezer.com/s/30mAVu3pLtvGQuthQUK9b");
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page).toHaveURL(/#\/p\/p[a-z0-9]+$/);
    await expect(page.getByText("100 faixas importadas do Deezer.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar para Minhas playlists" })).toBeInViewport();
  });

  test("servidor sem a API (site estático) mostra erro com tentar de novo", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("coverlist:intro", "1"));
    await page.route("**/api/coverlist**", (route) => route.fulfill({ status: 404, contentType: "text/html", body: "<h1>404</h1>" }));
    await page.goto("./");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Não deu para carregar as coleções");
    await expect(alert.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("abertura aparece na primeira visita e pode ser pulada", async ({ page }) => {
    await offline(page, { splash: true });
    // Relógio parado: a abertura sai sozinha em 2,4 s, e a máquina de teste pode ser lenta.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto("./#/c/top-mundo");
    const skip = page.getByRole("button", { name: "Pular abertura" });
    await expect(skip).toBeVisible();
    // Qualquer tecla (ou clique) pula; a abertura também sai sozinha em 2,4 s.
    await page.keyboard.press("Escape");
    await page.clock.runFor(2000);
    await expect(skip).toBeHidden();
    await page.clock.resume();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Top Mundo" })).toBeVisible();
    await expect(skip).toHaveCount(0);
  });
});
