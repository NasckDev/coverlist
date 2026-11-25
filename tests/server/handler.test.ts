// @vitest-environment node
import appleRss from "../fixtures/apple-rss-br.json";
import deezerNoData from "../fixtures/deezer-error-nodata.json";
import deezerPlaylist from "../fixtures/deezer-playlist-top-worldwide.json";
import deezerSearch from "../fixtures/deezer-search-anitta.json";
import deezerTrack from "../fixtures/deezer-track.json";
import itunesLookup from "../fixtures/itunes-lookup-br.json";
import itunesSearch from "../fixtures/itunes-search-anitta.json";
import spotifyOembed from "../fixtures/spotify-oembed.json";
import { COLLECTIONS } from "../../server/collections";
import { CACHE_POLICY, createHandler, OP_NAMES, type CoverlistResponse } from "../../server/handler";
import type { FetchLike } from "../../server/http";

type Route = (url: string, signal?: AbortSignal) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

function fakeFetch(route: Route) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push(url);
    const { status, body } = await route(url, init?.signal);
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => text };
  };
  return { fetch, calls };
}

const fixtures: Route = (url) => {
  if (url.startsWith("https://rss.marketingtools.apple.com/")) return { status: 200, body: appleRss };
  if (url.startsWith("https://itunes.apple.com/lookup")) return { status: 200, body: itunesLookup };
  if (url.startsWith("https://itunes.apple.com/search")) return { status: 200, body: itunesSearch };
  if (url.startsWith("https://api.deezer.com/playlist/3155776842")) return { status: 200, body: deezerPlaylist };
  if (url.startsWith("https://api.deezer.com/playlist/")) return { status: 200, body: deezerNoData };
  if (url.startsWith("https://api.deezer.com/search")) return { status: 200, body: deezerSearch };
  if (url.startsWith("https://api.deezer.com/track/")) return { status: 200, body: deezerTrack };
  if (url.startsWith("https://open.spotify.com/oembed")) return { status: 200, body: spotifyOembed };
  return { status: 500, body: "unexpected" };
};

function call(query: string, options: { method?: string; route?: Route; timeoutMs?: number } = {}) {
  const { fetch, calls } = fakeFetch(options.route ?? fixtures);
  const handler = createHandler({ fetch, timeoutMs: options.timeoutMs });
  const headers = new Map<string, string>();
  let status = 0;
  let body: unknown;
  const response: CoverlistResponse = {
    setHeader: (name, value) => void headers.set(name.toLowerCase(), value),
    status(code) {
      status = code;
      return response;
    },
    json(payload) {
      body = payload;
    },
  };
  return handler({ method: options.method ?? "GET", url: `/api/coverlist?${query}` }, response).then(() => ({
    status,
    body: body as Record<string, unknown>,
    headers,
    calls,
  }));
}

const cacheOf = (policy: { sMaxAge: number; swr: number }) => `public, s-maxage=${policy.sMaxAge}, stale-while-revalidate=${policy.swr}`;

describe("lista fechada de operações e validação", () => {
  it("expõe só as operações previstas", () => {
    expect(OP_NAMES).toEqual(["collections", "collection", "charts", "playlist", "search", "track", "spotify"]);
  });

  it.each([
    ["", "unknown_op"],
    ["op=proxy&url=https://example.com", "unknown_op"],
    ["op=search&q=abc&url=https://evil.example", "unknown_param"],
    ["op=search&q=a", "invalid_query"],
    [`op=search&q=${"x".repeat(81)}`, "invalid_query"],
    ["op=search&q=abc&limit=26", "invalid_limit"],
    ["op=search&q=abc&limit=-1", "invalid_limit"],
    ["op=search&q=abc&q=def", "duplicate_param"],
    ["op=charts&country=xx", "invalid_country"],
    ["op=charts&country=br&limit=30", "invalid_limit"],
    ["op=playlist&id=12a", "invalid_id"],
    ["op=playlist&id=0123", "invalid_id"],
    ["op=playlist&id=../../user/1", "invalid_id"],
    ["op=track&id=99999999999999999", "invalid_id"],
    ["op=spotify&id=abc", "invalid_id"],
  ])("recusa %s com 400 %s sem chamar a origem", async (query, code) => {
    const result = await call(query);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: code });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.calls).toHaveLength(0);
  });

  it("aceita só GET e HEAD", async () => {
    const result = await call("op=collections", { method: "POST" });
    expect(result.status).toBe(405);
    expect(result.headers.get("allow")).toBe("GET, HEAD");
  });

  it("coleção desconhecida vira 404 sem chamar a origem", async () => {
    const result = await call("op=collection&id=nao-existe");
    expect(result.status).toBe(404);
    expect(result.calls).toHaveLength(0);
  });
});

describe("operações", () => {
  it("collections devolve a configuração com cache longo", async () => {
    const result = await call("op=collections");
    expect(result.status).toBe(200);
    expect((result.body.collections as unknown[]).length).toBe(COLLECTIONS.length);
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.collections));
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("collection de parada da Apple junta RSS e lookup em lote", async () => {
    const result = await call("op=collection&id=paradas-brasil");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: "paradas-brasil", total: 25, updatedAt: "2026-11-25T19:06:22.000Z" });
    expect(result.calls[0]).toBe("https://rss.marketingtools.apple.com/api/v2/br/music/most-played/50/songs.json");
    expect(result.calls[1]).toMatch(/^https:\/\/itunes\.apple\.com\/lookup\?id=\d+(,\d+){24}&country=br&entity=song$/);
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.collectionChart));
  });

  it("collection do Deezer não carrega URL assinada", async () => {
    const result = await call("op=collection&id=top-mundo");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ title: "Top Mundo", total: 100 });
    expect(JSON.stringify(result.body)).not.toContain("hdnea");
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.collectionPlaylist));
  });

  it("parada sai mesmo se o lookup falhar (sem prévias)", async () => {
    const route: Route = (url) => (url.includes("/lookup") ? { status: 503, body: "" } : fixtures(url));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await call("op=charts&country=br&limit=25", { route });
    errors.mockRestore();
    expect(result.status).toBe(200);
    const tracks = result.body.tracks as { preview: unknown }[];
    expect(tracks).toHaveLength(25);
    expect(tracks.every((t) => t.preview === null)).toBe(true);
  });

  it("search une as duas fontes sem duplicatas e informa a situação de cada uma", async () => {
    const result = await call("op=search&q=anitta&limit=20");
    expect(result.status).toBe(200);
    expect(result.body.sources).toEqual({ deezer: "ok", itunes: "ok" });
    const ids = (result.body.tracks as { id: string }[]).map((t) => t.id);
    expect(ids.some((id) => id.startsWith("dz:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("it:"))).toBe(true);
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.search));
    expect(result.calls.some((u) => u.includes("q=anitta"))).toBe(true);
  });

  it("search devolve resultado parcial quando só uma fonte responde", async () => {
    const route: Route = (url) => (url.includes("deezer") ? { status: 500, body: "" } : fixtures(url));
    const result = await call("op=search&q=anitta", { route });
    expect(result.status).toBe(200);
    expect(result.body.sources).toEqual({ deezer: "error", itunes: "ok" });
  });

  it("track resolve a prévia assinada com cache curto", async () => {
    const result = await call("op=track&id=3602074142");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: "dz:3602074142", expiresAt: 1795635243000 });
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.track));
    expect(CACHE_POLICY.track.sMaxAge + CACHE_POLICY.track.swr).toBeLessThan(15 * 60);
  });

  it("playlist inexistente no Deezer (erro 800 com HTTP 200) vira 404", async () => {
    const result = await call("op=playlist&id=1");
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "not_found" });
  });

  it("spotify devolve só o nome via oEmbed", async () => {
    const result = await call("op=spotify&id=37i9dQZF1DXcBWIGoYBM5M");
    expect(result.body).toEqual({ title: "Today’s Top Hits" });
  });
});

describe("falhas de origem", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it("erro HTTP da origem vira 502 genérico, sem detalhe", async () => {
    const result = await call("op=playlist&id=3155776842", { route: () => ({ status: 500, body: "stack trace secreto" }) });
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: "upstream_unavailable" });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  it("resposta que não é JSON vira 502", async () => {
    const result = await call("op=track&id=1", { route: () => ({ status: 200, body: "<html>" }) });
    expect(result.status).toBe(502);
  });

  it("quota do Deezer vira 502", async () => {
    const result = await call("op=track&id=1", { route: () => ({ status: 200, body: { error: { code: 4, type: "Exception" } } }) });
    expect(result.status).toBe(502);
  });

  it("origem lenta é abortada pelo timeout e vira 502", async () => {
    const slow: Route = (_url, signal) =>
      new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const started = Date.now();
    const result = await call("op=collection&id=top-mundo", { route: slow, timeoutMs: 50 });
    expect(result.status).toBe(502);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("search só falha quando as duas fontes falham", async () => {
    const result = await call("op=search&q=anitta", { route: () => ({ status: 503, body: "" }) });
    expect(result.status).toBe(502);
  });
});
