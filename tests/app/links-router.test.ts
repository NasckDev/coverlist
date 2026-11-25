import { parsePlaylistLink } from "../../src/lib/links";
import { parseRoute } from "../../src/lib/router";

describe("links de playlist", () => {
  it.each([
    ["https://www.deezer.com/br/playlist/3155776842", { service: "deezer", id: "3155776842" }],
    ["https://deezer.com/playlist/1111141961?utm=x", { service: "deezer", id: "1111141961" }],
    ["https://www.deezer.com/pt-br/playlist/1/", { service: "deezer", id: "1" }],
    ["https://deezer.page.link/abc", { service: "deezer-short" }],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=1", { service: "spotify", id: "37i9dQZF1DXcBWIGoYBM5M" }],
    ["https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", { service: "youtube", id: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG" }],
  ])("reconhece %s", (link, expected) => {
    expect(parsePlaylistLink(link)).toEqual(expected);
  });

  it.each(["", "não é link", "https://www.deezer.com/br/album/123", "https://evil.example/playlist/1", "javascript:alert(1)", "https://deezer.com.evil.example/playlist/1"])(
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
  ])("%s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
});
