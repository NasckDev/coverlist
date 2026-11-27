// @vitest-environment node
import appleRss from "../fixtures/apple-rss-br.json";
import deezerNoData from "../fixtures/deezer-error-nodata.json";
import deezerPlaylist from "../fixtures/deezer-playlist-top-worldwide.json";
import deezerSearch from "../fixtures/deezer-search-anitta.json";
import deezerPlaylistSearch from "../fixtures/deezer-search-playlist-rock.json";
import deezerShare from "../fixtures/deezer-share-redirects.json";
import deezerTrack from "../fixtures/deezer-track.json";
import itunesLookup from "../fixtures/itunes-lookup-br.json";
import itunesSearch from "../fixtures/itunes-search-anitta.json";
import spotifyOembed from "../fixtures/spotify-oembed.json";
import { COLLECTIONS } from "../../server/collections";
import { CACHE_POLICY, createHandler, OP_NAMES, type CoverlistResponse } from "../../server/handler";
import { resetCaches } from "../../server/sources";
import type { FetchLike } from "../../server/http";

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
type Route = (url: string, signal?: AbortSignal) => Reply | Promise<Reply>;

function fakeFetch(route: Route) {
  const calls: string[] = [];
  const redirects: (string | undefined)[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push(url);
    redirects.push(init?.redirect);
    const { status, body, headers = {} } = await route(url, init?.signal);
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, text: async () => text };
  };
  return { fetch, calls, redirects };
}

const fixtures: Route = (url) => {
  if (url.startsWith("https://rss.marketingtools.apple.com/")) return { status: 200, body: appleRss };
  if (url.startsWith("https://itunes.apple.com/lookup")) return { status: 200, body: itunesLookup };
  if (url.startsWith("https://itunes.apple.com/search")) return { status: 200, body: itunesSearch };
  if (url.startsWith("https://api.deezer.com/playlist/3155776842")) return { status: 200, body: deezerPlaylist };
  if (url.startsWith("https://api.deezer.com/playlist/")) return { status: 200, body: deezerNoData };
  if (url.startsWith("https://api.deezer.com/search/playlist")) return { status: 200, body: deezerPlaylistSearch };
  if (url.startsWith("https://api.deezer.com/search")) return { status: 200, body: deezerSearch };
  const share = /^https:\/\/link\.deezer\.com\/s\/([A-Za-z0-9]+)$/.exec(url);
  if (share) {
    const recorded = (deezerShare.responses as Record<string, { status: number; location: string }>)[share[1]];
    if (recorded) return { status: recorded.status, body: "", headers: { location: recorded.location } };
  }
  if (url.startsWith("https://api.deezer.com/track/")) return { status: 200, body: deezerTrack };
  if (url.startsWith("https://open.spotify.com/oembed")) return { status: 200, body: spotifyOembed };
  return { status: 500, body: "unexpected" };
};

function call(query: string, options: { method?: string; route?: Route; timeoutMs?: number } = {}) {
  const { fetch, calls, redirects } = fakeFetch(options.route ?? fixtures);
  const handler = createHandler({ fetch, timeoutMs: options.timeoutMs, retryDelayMs: 0 });
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
    redirects,
  }));
}

beforeEach(() => resetCaches());

const cacheOf = (policy: { sMaxAge: number; swr: number }) => `public, s-maxage=${policy.sMaxAge}, stale-while-revalidate=${policy.swr}`;

describe("lista fechada de operações e validação", () => {
  it("expõe só as operações previstas", () => {
    expect(OP_NAMES).toEqual(["collections", "collection", "charts", "playlist", "search", "track", "lookup", "spotify", "playlists", "shortlink"]);
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
    ["op=playlists&q=a", "invalid_query"],
    ["op=playlists&q=rock&limit=26", "invalid_limit"],
    ["op=playlists&q=rock&url=https://evil.example", "unknown_param"],
    ["op=shortlink&code=abc", "invalid_code"],
    ["op=shortlink&code=../../x", "invalid_code"],
    ["op=shortlink&code=https%3A%2F%2Fevil.example", "invalid_code"],
    [`op=shortlink&code=${"a".repeat(41)}`, "invalid_code"],
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

  it("parada sai mesmo se o lookup falhar, com a prévia marcada para resolver ao tocar", async () => {
    const route: Route = (url) => (url.includes("/lookup") ? { status: 503, body: "" } : fixtures(url));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await call("op=charts&country=br&limit=25", { route });
    errors.mockRestore();
    expect(result.status).toBe(200);
    const tracks = result.body.tracks as { id: string; preview: unknown }[];
    expect(tracks).toHaveLength(25);
    expect(tracks[0].preview).toEqual({ kind: "itunes", trackId: tracks[0].id.slice(3), country: "br" });
    // 503 é temporário: cada lote foi tentado duas vezes (25 ids = 1 lote).
    expect(result.calls.filter((u) => u.includes("/lookup"))).toHaveLength(2);
  });

  it("lookup em lotes de 25 ids", async () => {
    const result = await call("op=collection&id=paradas-brasil");
    const lookups = result.calls.filter((u) => u.includes("/lookup"));
    expect(lookups).toHaveLength(1);
    expect(lookups[0].split("id=")[1].split("&")[0].split(",")).toHaveLength(25);
  });

  it("repete uma vez em erro temporário da origem e serve a resposta", async () => {
    let first = true;
    const route: Route = (url) => {
      if (url.startsWith("https://rss.") && first) {
        first = false;
        return { status: 503, body: "" };
      }
      return fixtures(url);
    };
    const result = await call("op=collection&id=paradas-brasil", { route });
    expect(result.status).toBe(200);
    expect(result.calls.filter((u) => u.startsWith("https://rss."))).toHaveLength(2);
  });

  it("não repete erro definitivo (404)", async () => {
    const route: Route = (url) => (url.startsWith("https://rss.") ? { status: 404, body: "" } : fixtures(url));
    const result = await call("op=collection&id=paradas-brasil", { route });
    expect(result.status).toBe(404);
    expect(result.calls.filter((u) => u.startsWith("https://rss."))).toHaveLength(1);
  });

  it("serve a última parada boa da memória quando o RSS cai (stale-if-error)", async () => {
    expect((await call("op=charts&country=br&limit=25")).status).toBe(200);
    // dentro de 15 min a parada vem da memória, sem chamar a origem
    expect((await call("op=charts&country=br&limit=25", { route: () => ({ status: 503, body: "" }) })).calls).toHaveLength(0);
    // depois disso a origem é consultada; se estiver fora, a última parada boa ainda serve
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 20 * 60_000);
    const offline = await call("op=charts&country=br&limit=25", { route: () => ({ status: 503, body: "" }) });
    vi.useRealTimers();
    expect(offline.status).toBe(200);
    expect((offline.body.tracks as unknown[]).length).toBe(25);
    expect(offline.calls.filter((u) => u.startsWith("https://rss."))).toHaveLength(2);
  });

  it("lookup resolve a prévia de uma faixa do iTunes na hora de tocar", async () => {
    const result = await call("op=lookup&id=6815826572&country=br");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: "it:6815826572", url: expect.stringMatching(/^https:\/\/audio-ssl\.itunes\.apple\.com\//) });
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.lookup));
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

  it("playlists busca playlists públicas do Deezer pelo nome", async () => {
    const result = await call("op=playlists&q=rock&limit=5");
    expect(result.status).toBe(200);
    expect(result.calls).toEqual(["https://api.deezer.com/search/playlist?q=rock&limit=5"]);
    const playlists = result.body.playlists as { id: string; title: string; total: number; artwork: { medium: string } | null }[];
    expect(playlists[0]).toMatchObject({ id: "16006333303", title: "Rock Nacional", creator: "anonymous", total: 39 });
    expect(playlists[0].artwork?.medium).toMatch(/^https:\/\/cdn-images\.dzcdn\.net\//);
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.playlists));
  });

  it("shortlink lê o redirect do link de compartilhar sem segui-lo e devolve a playlist", async () => {
    const result = await call("op=shortlink&code=30mAVu3pLtvGQuthQUK9b");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ kind: "playlist", id: "6524256744" });
    expect(result.calls).toEqual(["https://link.deezer.com/s/30mAVu3pLtvGQuthQUK9b"]);
    expect(result.redirects).toEqual(["manual"]);
    expect(result.headers.get("cache-control")).toBe(cacheOf(CACHE_POLICY.shortlink));
  });

  it("shortlink de álbum diz o tipo, para o app explicar que não é playlist", async () => {
    const result = await call("op=shortlink&code=33YUXFGT262a7innvHZZT");
    expect(result.body).toEqual({ kind: "album", id: "1042626192" });
  });

  it("shortlink vencido (redirect para deezer-links-404) vira 404", async () => {
    const result = await call("op=shortlink&code=31Wq4dKe1ARDAb5TeNIGh");
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "not_found" });
  });

  it("shortlink ignora destino fora do deezer.com", async () => {
    const route: Route = () => ({ status: 301, body: "", headers: { location: "https://link.deezer.com/?dest=https%3A%2F%2Fevil.example%2Fplaylist%2F1" } });
    const result = await call("op=shortlink&code=AbCdEf123", { route });
    expect(result.status).toBe(404);
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
