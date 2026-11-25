import { dedupeTracks, interleave } from "./dedupe.js";
import { isObject, str } from "./guards.js";
import { fetchJson, UpstreamError, type UpstreamOptions } from "./http.js";
import {
  deezerError,
  deezerPreviewUrl,
  enrichWithLookup,
  normalizeAppleRss,
  normalizeDeezerPlaylist,
  normalizeDeezerTracks,
  normalizeItunesResults,
} from "./normalize.js";
import type { AppleCountry } from "./collections.js";
import type { ChartResult, ImportedPlaylist, ResolvedPreview, SearchResult, SpotifyName, Track } from "./types.js";

const DEEZER_API = "https://api.deezer.com";
const ITUNES_API = "https://itunes.apple.com";
const APPLE_RSS = "https://rss.marketingtools.apple.com/api/v2";
/** O lookup do iTunes aceita vários ids separados por vírgula; lotes de 50 mantêm a URL curta. */
const LOOKUP_BATCH = 50;

/** Erro "no data" do Deezer (código 800) é recurso inexistente; os demais são falha da origem. */
async function deezer(path: string, options: UpstreamOptions): Promise<unknown> {
  const raw = await fetchJson("deezer", `${DEEZER_API}${path}`, options);
  const error = deezerError(raw);
  if (error) {
    if (error.code === 800) throw new UpstreamError("deezer", "not_found", "code 800");
    if (error.code === 4) throw new UpstreamError("deezer", "quota", "code 4");
    throw new UpstreamError("deezer", "invalid", `code ${error.code ?? "?"}`);
  }
  return raw;
}

export async function deezerPlaylist(playlistId: string, limit: number, options: UpstreamOptions): Promise<ImportedPlaylist> {
  const raw = await deezer(`/playlist/${playlistId}`, options);
  const parsed = normalizeDeezerPlaylist(raw, limit);
  if (!parsed) throw new UpstreamError("deezer", "invalid", "playlist shape");
  return { ...parsed.meta, tracks: parsed.tracks };
}

export async function deezerPreview(trackId: string, options: UpstreamOptions): Promise<ResolvedPreview> {
  const raw = await deezer(`/track/${trackId}`, options);
  if (!isObject(raw) || raw.type !== "track") throw new UpstreamError("deezer", "invalid", "track shape");
  return { id: `dz:${trackId}`, ...deezerPreviewUrl(raw) };
}

async function itunesLookup(ids: string[], country: string, options: UpstreamOptions): Promise<unknown[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += LOOKUP_BATCH) batches.push(ids.slice(i, i + LOOKUP_BATCH));
  const results = await Promise.all(
    batches.map((batch) =>
      fetchJson("itunes", `${ITUNES_API}/lookup?id=${batch.join(",")}&country=${country}&entity=song`, options),
    ),
  );
  return results.flatMap((result) => (isObject(result) && Array.isArray(result.results) ? result.results : []));
}

/**
 * Parada da Apple (RSS) enriquecida pelo lookup em lote do iTunes, que traz prévia, duração e álbum.
 * Se o lookup falhar, a parada sai assim mesmo, sem prévias: melhor um resultado parcial do que nenhum.
 */
export async function appleChart(country: AppleCountry, limit: number, options: UpstreamOptions): Promise<ChartResult> {
  const raw = await fetchJson("apple-rss", `${APPLE_RSS}/${country}/music/most-played/${limit}/songs.json`, options);
  const chart = normalizeAppleRss(raw, limit);
  if (!chart) throw new UpstreamError("apple-rss", "invalid", "feed shape");
  let tracks = chart.tracks;
  try {
    const lookup = await itunesLookup(
      tracks.map((track) => track.id.slice(3)),
      country,
      options,
    );
    tracks = enrichWithLookup(tracks, { results: lookup });
  } catch (error) {
    console.error(`[api/coverlist] itunes lookup failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
  return { country, title: chart.title, updatedAt: chart.updatedAt, tracks };
}

/**
 * Busca unificada: Deezer e iTunes em paralelo, normalizados, intercalados e sem duplicatas.
 * Uma fonte fora do ar não derruba a busca; só falha (502) quando as duas falham.
 */
export async function unifiedSearch(term: string, limit: number, country: AppleCountry, options: UpstreamOptions): Promise<SearchResult> {
  const query = encodeURIComponent(term);
  const [deezerResult, itunesResult] = await Promise.allSettled([
    deezer(`/search?q=${query}&limit=${limit}`, options).then((raw) => normalizeDeezerTracks(isObject(raw) ? raw.data : null, limit)),
    fetchJson("itunes", `${ITUNES_API}/search?term=${query}&media=music&entity=song&limit=${limit}&country=${country}`, options).then(
      (raw) => normalizeItunesResults(raw, limit),
    ),
  ]);
  if (deezerResult.status === "rejected" && itunesResult.status === "rejected") throw deezerResult.reason;
  const fromDeezer: Track[] = deezerResult.status === "fulfilled" ? deezerResult.value : [];
  const fromItunes: Track[] = itunesResult.status === "fulfilled" ? itunesResult.value : [];
  return {
    tracks: dedupeTracks(interleave(fromDeezer, fromItunes)).slice(0, limit),
    sources: {
      deezer: deezerResult.status === "fulfilled" ? "ok" : "error",
      itunes: itunesResult.status === "fulfilled" ? "ok" : "error",
    },
  };
}

/** O Spotify só oferece oEmbed sem chave: dá o nome da playlist, nunca as faixas. */
export async function spotifyName(playlistId: string, options: UpstreamOptions): Promise<SpotifyName> {
  const target = encodeURIComponent(`https://open.spotify.com/playlist/${playlistId}`);
  const raw = await fetchJson("spotify", `https://open.spotify.com/oembed?url=${target}`, options);
  const title = isObject(raw) ? str(raw.title, 100) : null;
  if (!title) throw new UpstreamError("spotify", "invalid", "oembed shape");
  return { title };
}
