import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clear, createStore } from "idb-keyval";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { ToastProvider } from "../../src/components/Chrome";
import { TrackSearch } from "../../src/components/TrackSearch";
import { createQueryClient } from "../../src/lib/api";
import { CollectionPage } from "../../src/pages/CollectionPage";
import { ExplorePage } from "../../src/pages/ExplorePage";
import { LibraryPage } from "../../src/pages/LibraryPage";
import { PlayerProvider } from "../../src/player/PlayerProvider";
import { PlaylistsProvider } from "../../src/store/playlists";
import { takeAutoplay } from "../../src/lib/router";
import { COLLECTIONS } from "../../server/collections";
import { callFixtureProxy } from "../support/fixture-proxy";

const proxy = http.get("*/api/coverlist", async ({ request }) => {
  const { status, headers, body } = await callFixtureProxy(request.url);
  return new HttpResponse(body, { status, headers });
});
const server = setupServer(proxy);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await clear(createStore("coverlist", "kv"));
  window.location.hash = "";
});

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

function wrap(ui: ReactNode) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <PlaylistsProvider>
        <PlayerProvider>
          <ToastProvider>{ui}</ToastProvider>
        </PlayerProvider>
      </PlaylistsProvider>
    </QueryClientProvider>,
  );
}

describe("Explorar", () => {
  it("lista as coleções por grupo com contagem e data reais das fixtures", async () => {
    wrap(<ExplorePage />);
    expect(await screen.findByRole("heading", { name: "Paradas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Décadas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gêneros" })).toBeInTheDocument();
    const brasil = await screen.findByRole("link", { name: /Paradas do Brasil\. 25 faixas · atualizado em 25\/11\/2026/ });
    expect(brasil).toHaveAttribute("href", "#/c/paradas-brasil");
    expect(await screen.findByRole("link", { name: /Top Mundo\. 100 faixas/ })).toBeInTheDocument();
  });

  it("filtra por grupo e década com endereço próprio, e o resto fica a um clique", async () => {
    const decades = COLLECTIONS.filter((c) => c.group === "decadas").length;
    const { unmount } = wrap(<ExplorePage />);
    const more = await screen.findByRole("link", { name: `Ver todas as ${decades} décadas` });
    expect(more).toHaveAttribute("href", "#/g/decadas");
    unmount();
    wrap(<ExplorePage filter={{ group: "decadas", era: 1980 }} />);
    expect(await screen.findByRole("link", { name: "Décadas" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("link", { name: "Anos 80" })).toHaveAttribute("aria-current", "page");
    const cards = await screen.findAllByRole("button", { name: /^Ouvir as prévias de / });
    expect(cards.map((b) => b.getAttribute("aria-label"))).toEqual(["Ouvir as prévias de Anos 80", "Ouvir as prévias de Anos 80 no Brasil"]);
    expect(screen.queryByRole("heading", { name: "Paradas" })).not.toBeInTheDocument();
  });

  it("o play do cartão abre a coleção pedindo para tocar", async () => {
    wrap(<ExplorePage filter={{ group: "generos", scope: "brasil" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ouvir as prévias de Funk" }));
    expect(window.location.hash).toBe("#/c/funk");
    expect(takeAutoplay("funk")).toBe(true);
  });

  it("mostra erro com tentar de novo quando o servidor falha", async () => {
    server.use(http.get("*/api/coverlist", () => HttpResponse.json({ error: "upstream_unavailable" }, { status: 502 })));
    wrap(<ExplorePage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não deu para carregar as coleções");
    server.resetHandlers();
    await userEvent.click(within(alert).getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("heading", { name: "Paradas" })).toBeInTheDocument();
  });

  it("trata resposta que não é JSON (site estático sem a Function) como servidor indisponível", async () => {
    server.use(http.get("*/api/coverlist", () => new HttpResponse("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } })));
    wrap(<ExplorePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível falar com o servidor do Coverlist agora.");
  });
});

describe("Coleção", () => {
  it("abre a capa viva, sinaliza a faixa sem prévia e cria uma playlist a partir dela", async () => {
    wrap(<CollectionPage id="top-mundo" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Top Mundo" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("1 faixa sem prévia de 30 s na fonte");
    expect(screen.getAllByRole("button", { name: /\(sem prévia\)$/ })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /^Voltar para / })[0]).toHaveAttribute("href", expect.stringMatching(/^#\//));
    const summary = within(screen.getByRole("list", { name: "Resumo da coleção" }));
    expect(summary.getByText("100").parentElement).toHaveTextContent("100 faixas");
    expect(summary.getByText("99").parentElement).toHaveTextContent("99 prévias");
    expect(screen.getByRole("button", { name: "Ouvir prévias" })).toBeEnabled();
    const related = within(await screen.findByRole("navigation", { name: "Mais em Paradas" }));
    expect(related.getByRole("link", { name: "Paradas do Brasil" })).toHaveAttribute("href", "#/c/paradas-brasil");
    await userEvent.click(screen.getByRole("button", { name: "Usar como base" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p[a-z0-9]+$/));
    expect(await screen.findByText("Playlist criada com 100 faixas de “Top Mundo”.")).toBeInTheDocument();
    expect(screen.queryByText(/limite/i)).not.toBeInTheDocument();
  });

  it("mostra a prévia indisponível ao tocar a faixa sem prévia", async () => {
    wrap(<CollectionPage id="top-mundo" />);
    const noPreview = (await screen.findAllByRole("button", { name: /\(sem prévia\)$/ }))[0];
    await userEvent.click(noPreview);
    expect(await screen.findAllByText(/não tem prévia de 30 s/)).not.toHaveLength(0);
  });
});

describe("Busca unificada", () => {
  it("mostra Deezer e iTunes sem duplicatas e marca o que já está na playlist", async () => {
    const onAdd = vi.fn();
    wrap(<TrackSearch have={new Set(["dz:3602074142"])} onAdd={onAdd} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar música ou artista" }), "anitta");
    const results = await screen.findByRole("list", { name: "Resultados da busca" });
    await waitFor(() => expect(within(results).getAllByRole("button").length).toBeGreaterThan(5));
    const labels = within(results).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
    expect(within(results).getAllByText("Deezer", { exact: false }).length).toBeGreaterThan(0);
    expect(within(results).getAllByText("iTunes", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText("Resultados do Deezer e do iTunes, sem duplicatas.")).toBeInTheDocument();
    await userEvent.click(within(results).getAllByRole("button")[0]);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("avisa quando uma das fontes falha (resultado parcial)", async () => {
    server.use(
      http.get("*/api/coverlist", () =>
        HttpResponse.json({
          tracks: [{ id: "it:1", title: "Só do iTunes", artist: "A", album: null, durationSec: 100, artwork: null, preview: null, source: "itunes", explicit: false, link: null }],
          sources: { deezer: "error", itunes: "ok" },
        }),
      ),
    );
    wrap(<TrackSearch have={new Set()} onAdd={() => undefined} />);
    await userEvent.type(screen.getByRole("searchbox"), "abc");
    expect(await screen.findByText("O Deezer não respondeu; mostrando só o que a outra fonte trouxe.")).toBeInTheDocument();
    expect(screen.getByText("sem prévia")).toBeInTheDocument();
  });

});

describe("Minhas playlists", () => {
  it("cria, renomeia, duplica e exclui com desfazer", async () => {
    const user = userEvent.setup();
    wrap(<LibraryPage />);
    expect(await screen.findByText("Nenhuma playlist ainda")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nova playlist" }));
    window.location.hash = "";
    await user.click(await screen.findByRole("button", { name: "Renomear Nova playlist" }));
    const input = screen.getByRole("textbox", { name: "Novo nome" });
    await user.clear(input);
    await user.type(input, "Domingo{Enter}");
    expect(await screen.findByRole("link", { name: /Abrir Domingo/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Duplicar Domingo" }));
    expect(await screen.findByRole("link", { name: /Abrir Domingo \(cópia\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Excluir Domingo" }));
    expect(screen.queryByRole("link", { name: /^Abrir Domingo,/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Desfazer" }));
    expect(await screen.findByRole("link", { name: /^Abrir Domingo,/ })).toBeInTheDocument();
  });

  it("recusa importar um JSON que não é do Coverlist", async () => {
    const user = userEvent.setup();
    const { container } = wrap(<LibraryPage />);
    await screen.findByText("Nenhuma playlist ainda");
    const file = new File([JSON.stringify({ app: "outro" })], "x.json", { type: "application/json" });
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
    expect(await screen.findByText("Esse arquivo não foi exportado pelo Coverlist.")).toBeInTheDocument();
  });

  it("importa playlist do Deezer por link e explica o YouTube", async () => {
    const user = userEvent.setup();
    wrap(<LibraryPage />);
    await screen.findByText("Nenhuma playlist ainda");
    const field = screen.getByRole("textbox", { name: "Link ou nome da playlist" });
    await user.type(field, "https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG");
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByText(/exige uma chave da API do Google/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "https://www.deezer.com/br/playlist/3155776842");
    await user.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p/));
    expect(await screen.findByText("100 faixas importadas do Deezer.")).toBeInTheDocument();
  });
});

describe("Importar playlist", () => {
  async function importer() {
    const user = userEvent.setup();
    wrap(<LibraryPage />);
    await screen.findByText("Nenhuma playlist ainda");
    const field = screen.getByRole("textbox", { name: "Link ou nome da playlist" });
    const submit = async (text: string, button = "Importar") => {
      await user.clear(field);
      await user.type(field, text);
      await user.click(screen.getByRole("button", { name: button }));
    };
    return { user, submit };
  }

  it("importa pelo link do botão Compartilhar do app do Deezer (link.deezer.com/s/…), mesmo com frase em volta", async () => {
    const { submit } = await importer();
    await submit("Ouça no Deezer: https://link.deezer.com/s/30mAVu3pLtvGQuthQUK9b");
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p/));
    expect(await screen.findByText("100 faixas importadas do Deezer.")).toBeInTheDocument();
  });

  it("explica link de álbum, link vencido e playlist privada sem erro técnico", async () => {
    const { submit } = await importer();
    await submit("https://link.deezer.com/s/33YUXFGT262a7innvHZZT");
    expect(await screen.findByText(/Esse link é de um álbum do Deezer, não de uma playlist/)).toBeInTheDocument();
    await submit("https://link.deezer.com/s/31Wq4dKe1ARDAb5TeNIGh");
    expect(await screen.findByText(/pode ter vencido ou estar incompleto/)).toBeInTheDocument();
    await submit("https://www.deezer.com/playlist/1");
    expect(await screen.findByText(/Ela pode ser privada: no app, deixe a playlist pública/)).toBeInTheDocument();
    await submit("https://example.com/qualquer");
    expect(await screen.findByText(/Esse link não é de uma playlist do Deezer/)).toBeInTheDocument();
    expect(screen.queryByText(/not_found|upstream|502|404/)).not.toBeInTheDocument();
  });

  it("procura playlists públicas do Deezer pelo nome e importa a escolhida", async () => {
    const { user, submit } = await importer();
    await submit("rock", "Buscar");
    const results = await screen.findByRole("list", { name: "Playlists do Deezer encontradas" });
    const first = await within(results).findByRole("button", { name: "Importar Rock Nacional, de anonymous, 39 faixas" });
    await user.click(first);
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p/));
  });

  it("do Spotify traz o nome e sugere playlists do Deezer com esse nome", async () => {
    const { user, submit } = await importer();
    await submit("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    expect(await screen.findByText(/O Spotify só libera o nome: “Today’s Top Hits”/)).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Playlists do Deezer encontradas" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Criar só com o nome “Today’s Top Hits”" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p/));
  });
});
