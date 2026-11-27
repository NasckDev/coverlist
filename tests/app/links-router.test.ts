import { parsePlaylistLink } from "../../src/lib/links";
import { href, parseRoute, requestAutoplay, takeAutoplay } from "../../src/lib/router";

describe("links de playlist", () => {
  it.each([
    ["https://www.deezer.com/br/playlist/3155776842", { service: "deezer", id: "3155776842" }],
    ["https://deezer.com/playlist/1111141961?utm=x", { service: "deezer", id: "1111141961" }],
    ["https://www.deezer.com/pt-br/playlist/1/", { service: "deezer", id: "1" }],
    ["https://deezer.page.link/abc", { service: "deezer-short" }],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=1", { service: "spotify", id: "37i9dQZF1DXcBWIGoYBM5M" }],
    ["https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", { service: "youtube", id: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG" }],
    // O "Copiar link" do app do Deezer gera link.deezer.com/s/<código>, às vezes com frase em volta.
    ["https://link.deezer.com/s/30mAVu3pLtvGQuthQUK9b", { service: "deezer-share", code: "30mAVu3pLtvGQuthQUK9b" }],
    ["Ouça “Mais queridas” no Deezer: https://link.deezer.com/s/30mAVu3pLtvGQuthQUK9b", { service: "deezer-share", code: "30mAVu3pLtvGQuthQUK9b" }],
    ["link.deezer.com/s/30mAVu3pLtvGQuthQUK9b", { service: "deezer-share", code: "30mAVu3pLtvGQuthQUK9b" }],
    ["Minha playlist: https://www.deezer.com/br/playlist/1306931615?utm_source=deezer.", { service: "deezer", id: "1306931615" }],
    ["1306931615", { service: "deezer", id: "1306931615" }],
    ["https://www.deezer.com/br/album/123", { service: "deezer-other", kind: "album" }],
    ["https://www.deezer.com/track/9", { service: "deezer-other", kind: "track" }],
    ["spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", { service: "spotify", id: "37i9dQZF1DXcBWIGoYBM5M" }],
    ["https://music.apple.com/br/playlist/hits/pl.11ac7cc7d09741c5822e8c66e5c7edbb", { service: "apple" }],
    ["https://music.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", { service: "youtube", id: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG" }],
  ])("reconhece %s", (link, expected) => {
    expect(parsePlaylistLink(link)).toEqual(expected);
  });

  it.each(["", "não é link", "1989", "rock anos 80", "https://evil.example/playlist/1", "javascript:alert(1)", "https://deezer.com.evil.example/playlist/1", "https://link.deezer.com.evil.example/s/abcd", "meu-deezer.com/playlist/123456"])(
    "recusa %s",
    (link) => {
      expect(parsePlaylistLink(link)).toBeNull();
    },
  );
});

describe("rotas por hash", () => {
  it.each([
    ["", { name: "explore" }],
    ["#/", { name: "explore" }],
    ["#/c/top-mundo", { name: "collection", id: "top-mundo" }],
    ["#/p", { name: "library" }],
    ["#/p/pabc123", { name: "playlist", id: "pabc123" }],
    ["#/s/abc_-1", { name: "shared", payload: "abc_-1" }],
    ["#/c/../x", { name: "notFound" }],
    ["#/qualquer", { name: "notFound" }],
    ["#/g/decadas", { name: "explore", group: "decadas" }],
    ["#/g/decadas/1980", { name: "explore", group: "decadas", era: 1980 }],
    ["#/g/generos/brasil", { name: "explore", group: "generos", scope: "brasil" }],
    ["#/g/paradas/brasil", { name: "notFound" }],
    ["#/g/generos/1980", { name: "notFound" }],
    ["#/g/decadas/1950", { name: "notFound" }],
  ])("%s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
});

describe("endereços de Explorar", () => {
  it("monta o endereço de cada filtro", () => {
    expect(href.explore()).toBe("#/");
    expect(href.explore({ group: "decadas", era: 1990 })).toBe("#/g/decadas/1990");
    expect(href.explore({ group: "generos", scope: "mundo" })).toBe("#/g/generos/mundo");
  });

  it("o pedido de tocar ao abrir vale uma vez e só para a coleção pedida", () => {
    requestAutoplay("anos-80");
    expect(takeAutoplay("anos-80")).toBe(true);
    expect(takeAutoplay("anos-80")).toBe(false);
    // Abrir outra coleção descarta o pedido pendente.
    requestAutoplay("anos-80");
    expect(takeAutoplay("rock")).toBe(false);
    expect(takeAutoplay("anos-80")).toBe(false);
    // Pedido antigo (a coleção não carregou a tempo) não toca depois.
    requestAutoplay("anos-80", 0);
    expect(takeAutoplay("anos-80", 60_000)).toBe(false);
  });
});
