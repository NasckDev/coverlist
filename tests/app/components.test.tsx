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
    await userEvent.click(screen.getByRole("button", { name: "Usar como base" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p[a-z0-9]+$/));
    expect(await screen.findByText(/Playlist criada com as 50 primeiras de 100 faixas/)).toBeInTheDocument();
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
    wrap(<TrackSearch have={new Set(["dz:3602074142"])} count={3} onAdd={onAdd} />);
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
    wrap(<TrackSearch have={new Set()} count={0} onAdd={() => undefined} />);
    await userEvent.type(screen.getByRole("searchbox"), "abc");
    expect(await screen.findByText("O Deezer não respondeu; mostrando só o que a outra fonte trouxe.")).toBeInTheDocument();
    expect(screen.getByText("sem prévia")).toBeInTheDocument();
  });

  it("bloqueia a adição no limite de faixas", async () => {
    wrap(<TrackSearch have={new Set()} count={50} onAdd={() => undefined} />);
    expect(screen.getByText("Limite de 50 faixas. Remova uma para adicionar outra.")).toBeInTheDocument();
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

  it("importa playlist do Deezer por link e diz que o Spotify só traz o nome", async () => {
    const user = userEvent.setup();
    wrap(<LibraryPage />);
    await screen.findByText("Nenhuma playlist ainda");
    const field = screen.getByRole("textbox", { name: "Link da playlist" });
    await user.type(field, "https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG");
    await user.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByText(/exige uma chave da API do Google/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "https://www.deezer.com/br/playlist/3155776842");
    await user.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/p/));
    expect(await screen.findByText("Importadas as 50 primeiras de 100 faixas (limite por playlist).")).toBeInTheDocument();
  });
});
