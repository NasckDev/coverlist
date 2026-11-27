import appleRss from "../fixtures/apple-rss-br.json" with { type: "json" };
import deezerNoData from "../fixtures/deezer-error-nodata.json" with { type: "json" };
import deezerPlaylist from "../fixtures/deezer-playlist-top-worldwide.json" with { type: "json" };
import deezerSearch from "../fixtures/deezer-search-anitta.json" with { type: "json" };
import deezerPlaylistSearch from "../fixtures/deezer-search-playlist-rock.json" with { type: "json" };
import deezerShare from "../fixtures/deezer-share-redirects.json" with { type: "json" };
import deezerTrack from "../fixtures/deezer-track.json" with { type: "json" };
import itunesLookup from "../fixtures/itunes-lookup-br.json" with { type: "json" };
import itunesSearch from "../fixtures/itunes-search-anitta.json" with { type: "json" };
import spotifyOembed from "../fixtures/spotify-oembed.json" with { type: "json" };
import { createHandler, type CoverlistResponse } from "../../server/handler";
import type { FetchLike } from "../../server/http";

/**
 * O proxy de verdade (server/handler.ts) alimentado pelas respostas reais gravadas em tests/fixtures.
 * Usado pelo MSW (testes de componente) e pelo Playwright (E2E): mesma normalização, zero rede.
 */
export const fixtureFetch: FetchLike = async (url) => {
  const share = /^https:\/\/link\.deezer\.com\/s\/([A-Za-z0-9]+)$/.exec(url);
  if (share) {
    const recorded = (deezerShare.responses as Record<string, { status: number; location: string } | undefined>)[share[1]];
    const status = recorded?.status ?? 404;
    return { ok: false, status, headers: { get: (name) => (name.toLowerCase() === "location" ? (recorded?.location ?? null) : null) }, text: async () => "" };
  }
  let body: unknown = null;
  if (url.startsWith("https://rss.marketingtools.apple.com/")) body = appleRss;
  else if (url.startsWith("https://itunes.apple.com/lookup")) body = itunesLookup;
  else if (url.startsWith("https://itunes.apple.com/search")) body = itunesSearch;
  else if (/^https:\/\/api\.deezer\.com\/playlist\/1$/.test(url)) body = deezerNoData;
  else if (url.startsWith("https://api.deezer.com/playlist/")) body = deezerPlaylist;
  else if (url.startsWith("https://api.deezer.com/search/playlist")) body = deezerPlaylistSearch;
  else if (url.startsWith("https://api.deezer.com/search")) body = deezerSearch;
  else if (url.startsWith("https://api.deezer.com/track/")) body = deezerTrack;
  else if (url.startsWith("https://open.spotify.com/oembed")) body = spotifyOembed;
  const text = JSON.stringify(body);
  return { ok: body !== null, status: body !== null ? 200 : 500, headers: { get: () => null }, text: async () => text };
};

const handler = createHandler({ fetch: fixtureFetch });

export async function callFixtureProxy(url: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  let status = 200;
  let body = "";
  const response: CoverlistResponse = {
    setHeader: (name, value) => void (headers[name.toLowerCase()] = value),
    status(code) {
      status = code;
      return response;
    },
    json(payload) {
      body = JSON.stringify(payload);
    },
  };
  const parsed = new URL(url, "http://localhost");
  await handler({ method: "GET", url: `${parsed.pathname}${parsed.search}` }, response);
  return { status, headers, body };
}

/** WAV PCM mudo: toca em qualquer navegador, inclusive no Chromium de teste sem codecs proprietários. */
export function silentWav(seconds = 2, rate = 8000): Uint8Array {
  const samples = seconds * rate;
  const buffer = new ArrayBuffer(44 + samples);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  return new Uint8Array(buffer);
}
