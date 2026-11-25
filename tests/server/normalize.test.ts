// @vitest-environment node
import appleRss from "../fixtures/apple-rss-br.json";
import deezerChart from "../fixtures/deezer-chart-tracks.json";
import deezerPlaylist from "../fixtures/deezer-playlist-top-worldwide.json";
import deezerSearch from "../fixtures/deezer-search-anitta.json";
import deezerTrack from "../fixtures/deezer-track.json";
import itunesLookup from "../fixtures/itunes-lookup-br.json";
import itunesSearch from "../fixtures/itunes-search-anitta.json";
import {
  appleArtwork,
  deezerError,
  deezerPreviewUrl,
  enrichWithLookup,
  normalizeAppleRss,
  normalizeDeezerPlaylist,
  normalizeDeezerTrack,
  normalizeDeezerTracks,
  normalizeItunesResults,
  normalizeItunesTrack,
} from "../../server/normalize";
import deezerNoData from "../fixtures/deezer-error-nodata.json";

describe("Deezer", () => {
  it("normaliza a busca real com id prefixado, capa em três tamanhos e prévia só por id", () => {
    const tracks = normalizeDeezerTracks(deezerSearch.data, 50);
    expect(tracks).toHaveLength(deezerSearch.data.length);
    const first = tracks[0];
    expect(first.id).toBe(`dz:${deezerSearch.data[0].id}`);
    expect(first.title).toBe(deezerSearch.data[0].title);
    expect(first.artist).toBe(deezerSearch.data[0].artist.name);
    expect(first.source).toBe("deezer");
    expect(first.artwork?.medium).toMatch(/^https:\/\/cdn-images\.dzcdn\.net\/.+250x250/);
    expect(first.artwork?.large).toMatch(/500x500/);
    expect(first.preview).toEqual({ kind: "deezer", trackId: String(deezerSearch.data[0].id) });
    expect(JSON.stringify(tracks)).not.toContain("hdnea");
  });

  it("marca faixas sem prévia ou não tocáveis da playlist real como preview null", () => {
    const parsed = normalizeDeezerPlaylist(deezerPlaylist, 100);
    expect(parsed?.meta).toMatchObject({ id: "3155776842", title: "Top Worldwide", creator: "Deezer Charts", total: 100 });
    expect(parsed?.meta.updatedAt).toBe("2026-11-25T13:26:09.000Z");
    const withoutPreview = deezerPlaylist.tracks.data.filter((t) => !t.preview || t.readable === false).length;
    expect(parsed?.tracks.filter((t) => t.preview === null)).toHaveLength(withoutPreview);
    expect(withoutPreview).toBeGreaterThan(0);
  });

  it("respeita o limite de faixas", () => {
    expect(normalizeDeezerTracks(deezerChart.data, 5)).toHaveLength(5);
  });

  it("lê a URL assinada e o momento de expiração do track real", () => {
    const { url, expiresAt } = deezerPreviewUrl(deezerTrack);
    expect(url).toMatch(/^https:\/\/cdnt-preview\.dzcdn\.net\//);
    expect(expiresAt).toBe(1795635243000);
  });

  it("descarta URL de host desconhecido e itens malformados", () => {
    expect(deezerPreviewUrl({ ...deezerTrack, preview: "https://evil.example/a.mp3" }).url).toBeNull();
    expect(normalizeDeezerTrack({ id: "x", title: "a" })).toBeNull();
    expect(normalizeDeezerTrack(null)).toBeNull();
    const art = normalizeDeezerTrack({ ...deezerSearch.data[0], album: { cover_medium: "http://cdn-images.dzcdn.net/a.jpg" } });
    expect(art?.artwork).toBeNull();
  });

  it("reconhece o objeto de erro que o Deezer devolve com HTTP 200", () => {
    expect(deezerError(deezerNoData)).toEqual({ code: 800, type: "DataException" });
    expect(deezerError(deezerSearch)).toBeNull();
  });
});

describe("iTunes e Apple RSS", () => {
  it("normaliza a busca real do iTunes com prévia estável", () => {
    const tracks = normalizeItunesResults(itunesSearch, 50);
    expect(tracks).toHaveLength(itunesSearch.results.length);
    expect(tracks[0]).toMatchObject({
      id: `it:${itunesSearch.results[0].trackId}`,
      title: itunesSearch.results[0].trackName,
      source: "itunes",
      preview: { kind: "url", url: itunesSearch.results[0].previewUrl },
    });
    expect(tracks[0].durationSec).toBe(Math.round(itunesSearch.results[0].trackTimeMillis / 1000));
    expect(tracks[0].artwork?.large).toMatch(/600x600bb\.jpg$/);
  });

  it("ignora resultados que não são músicas", () => {
    expect(normalizeItunesTrack({ ...itunesSearch.results[0], kind: "music-video" })).toBeNull();
  });

  it("normaliza o feed real da Apple sem prévia e completa com o lookup em lote", () => {
    const chart = normalizeAppleRss(appleRss, 50);
    expect(chart?.title).toBe("Top músicas");
    expect(chart?.updatedAt).toBe("2026-11-25T19:06:22.000Z");
    expect(chart?.tracks).toHaveLength(25);
    expect(chart?.tracks.every((t) => t.preview === null && t.durationSec === null)).toBe(true);
    expect(chart?.tracks.filter((t) => t.explicit)).toHaveLength(6);

    const enriched = enrichWithLookup(chart?.tracks ?? [], itunesLookup);
    expect(enriched.map((t) => t.id)).toEqual(chart?.tracks.map((t) => t.id));
    expect(enriched.every((t) => t.preview?.kind === "url")).toBe(true);
    expect(enriched[0]).toMatchObject({ title: "Pós (Ao Vivo)", durationSec: 176, album: "Pós (Ao Vivo) - Single" });
  });

  it("mantém a faixa da parada quando o lookup não a encontra (resultado parcial)", () => {
    const chart = normalizeAppleRss(appleRss, 3);
    const enriched = enrichWithLookup(chart?.tracks ?? [], { results: [] });
    expect(enriched).toEqual(chart?.tracks);
  });

  it("gera capas em 100, 300 e 600 px a partir do artworkUrl100", () => {
    const art = appleArtwork(appleRss.feed.results[0].artworkUrl100);
    expect(art?.small).toMatch(/\/100x100bb\.jpg$/);
    expect(art?.medium).toMatch(/\/300x300bb\.jpg$/);
    expect(art?.large).toMatch(/\/600x600bb\.jpg$/);
    expect(appleArtwork("https://example.com/a/100x100bb.jpg")).toBeNull();
  });
});
