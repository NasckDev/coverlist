import type { Artwork, Preview, ThemeKey, Track } from "../../server/types";
import { LAYOUT_KEYS, type LayoutKey } from "../lib/design";
import { BY_MAX, DESC_MAX, MAX_TRACKS, NAME_MAX, validateTrack } from "../store/schema";
import { THEME_KEYS } from "../../server/types";

/**
 * Link compartilhável: o estado da playlist vai compactado no próprio link (#/s/<payload>).
 *
 * - Nenhuma URL viaja crua: capas e prévias viram referências curtas (hash do Deezer, caminho do
 *   CDN da Apple) e são remontadas só em hosts conhecidos ao abrir. Um link adulterado não
 *   consegue apontar o app para outro servidor.
 * - JSON compacto → deflate-raw (CompressionStream) → base64url.
 */
export const SHARE_VERSION = 1;
export const MAX_PAYLOAD_CHARS = 16_000;
export const PUBLIC_APP_URL = "https://nasck.vercel.app/projetos/coverlist/";

export interface SharedPlaylist {
  name: string;
  description: string;
  by: string;
  theme: ThemeKey;
  layout: LayoutKey;
  tracks: Track[];
}

type Packed = [string, string, string, number | 0, string, string];

const DZ_COVER = /^https:\/\/(?:cdn-images|e-cdns-images)\.dzcdn\.net\/images\/cover\/([0-9a-f]{32})\/\d+x\d+-[0-9a-z-]+\.jpg$/;
const AP_COVER = /^https:\/\/(is\d-ssl)\.mzstatic\.com\/image\/thumb\/([A-Za-z0-9/._-]+?)\/\d+x\d+bb\.jpg$/;
const IT_AUDIO = /^https:\/\/audio-ssl\.itunes\.apple\.com\/itunes-assets\/([A-Za-z0-9/._-]+)$/;
const SAFE_PATH = /^[A-Za-z0-9/._-]{1,400}$/;

function artRef(art: Artwork | null): string {
  const url = art?.large ?? art?.medium ?? "";
  const dz = DZ_COVER.exec(url);
  if (dz) return `d${dz[1]}`;
  const ap = AP_COVER.exec(url);
  if (ap && !ap[2].includes("..")) return `a${ap[1].slice(2, -4)}|${ap[2]}`;
  return "";
}

export function artFromRef(ref: string): Artwork | null {
  if (/^d[0-9a-f]{32}$/.test(ref)) {
    const at = (s: number) => `https://cdn-images.dzcdn.net/images/cover/${ref.slice(1)}/${s}x${s}-000000-80-0-0.jpg`;
    return { small: at(56), medium: at(250), large: at(500) };
  }
  const ap = /^a(\d)\|(.+)$/.exec(ref);
  if (ap && SAFE_PATH.test(ap[2]) && !ap[2].includes("..")) {
    const at = (s: number) => `https://is${ap[1]}-ssl.mzstatic.com/image/thumb/${ap[2]}/${s}x${s}bb.jpg`;
    return { small: at(100), medium: at(300), large: at(600) };
  }
  return null;
}

function previewRef(preview: Preview): string {
  if (!preview) return "";
  if (preview.kind === "deezer") return "z";
  const it = IT_AUDIO.exec(preview.url);
  return it && !it[1].includes("..") ? `i${it[1]}` : "";
}

function previewFromRef(ref: string, id: string): Preview {
  if (ref === "z" && /^dz:\d{1,15}$/.test(id)) return { kind: "deezer", trackId: id.slice(3) };
  if (ref.startsWith("i") && SAFE_PATH.test(ref.slice(1)) && !ref.includes("..")) {
    return { kind: "url", url: `https://audio-ssl.itunes.apple.com/itunes-assets/${ref.slice(1)}` };
  }
  return null;
}

function pack(t: Track): Packed {
  return [t.id, t.title, t.artist, t.durationSec ?? 0, artRef(t.artwork), previewRef(t.preview)];
}

const toB64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (text: string) => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const out = new Response(source.pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(playlist: SharedPlaylist): Promise<string> {
  const data = [
    SHARE_VERSION,
    playlist.name.slice(0, NAME_MAX),
    playlist.description.slice(0, DESC_MAX),
    playlist.by.slice(0, BY_MAX),
    playlist.theme,
    playlist.layout,
    playlist.tracks.slice(0, MAX_TRACKS).map(pack),
  ];
  const json = new TextEncoder().encode(JSON.stringify(data));
  return toB64Url(await transform(json, new CompressionStream("deflate-raw")));
}

export class ShareLinkError extends Error {}

/** Valida tudo ao ler: tamanho, versão, tipos, limites e cada faixa. Qualquer desvio rejeita o link. */
export async function decodeShare(payload: string): Promise<SharedPlaylist> {
  if (!payload || payload.length > MAX_PAYLOAD_CHARS || !/^[A-Za-z0-9_-]+$/.test(payload)) throw new ShareLinkError("formato");
  let data: unknown;
  try {
    const bytes = await transform(fromB64Url(payload), new DecompressionStream("deflate-raw"));
    if (bytes.length > 200_000) throw new ShareLinkError("tamanho");
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ShareLinkError("conteúdo");
  }
  if (!Array.isArray(data) || data.length !== 7 || data[0] !== SHARE_VERSION) throw new ShareLinkError("versão");
  const [, name, description, by, theme, layout, packed] = data as unknown[];
  if (typeof name !== "string" || typeof description !== "string" || typeof by !== "string") throw new ShareLinkError("campos");
  if (!(THEME_KEYS as readonly unknown[]).includes(theme) || !(LAYOUT_KEYS as readonly unknown[]).includes(layout)) throw new ShareLinkError("visual");
  if (!Array.isArray(packed) || packed.length > MAX_TRACKS) throw new ShareLinkError("faixas");
  const tracks: Track[] = [];
  for (const item of packed) {
    if (!Array.isArray(item) || item.length !== 6) throw new ShareLinkError("faixa");
    const [id, title, artist, dur, art, prev] = item as unknown[];
    if (typeof id !== "string" || typeof art !== "string" || typeof prev !== "string" || typeof dur !== "number") throw new ShareLinkError("faixa");
    const track = validateTrack({
      id,
      title,
      artist,
      album: null,
      durationSec: dur || null,
      artwork: artFromRef(art),
      preview: previewFromRef(prev, id),
      source: id.startsWith("dz:") ? "deezer" : "itunes",
      explicit: false,
      link: null,
    });
    if (!track) throw new ShareLinkError("faixa");
    tracks.push(track);
  }
  return {
    name: name.slice(0, NAME_MAX),
    description: description.slice(0, DESC_MAX),
    by: by.slice(0, BY_MAX),
    theme: theme as ThemeKey,
    layout: layout as LayoutKey,
    tracks,
  };
}

/** Em produção o link aponta para o domínio público; no dev, para o endereço local. */
export function shareUrl(payload: string, location: Pick<Location, "hostname" | "origin" | "pathname"> = window.location): string {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const base = local ? `${location.origin}${location.pathname}` : PUBLIC_APP_URL;
  return `${base}#/s/${payload}`;
}
