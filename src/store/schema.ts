import { THEME_KEYS, type Artwork, type Preview, type ThemeKey, type Track } from "../../server/types";
import { LAYOUT_KEYS, type LayoutKey } from "../lib/design";

/**
 * Esquema persistido das playlists. Toda leitura (IndexedDB, arquivo importado, link) passa por
 * `validatePlaylist`, então um dado corrompido nunca chega à interface.
 *
 * - v1: formato do protótipo (localStorage `ladoa:v2`): faixas com `dur`, `art` e `preview` soltos.
 * - v2: faixas no tipo `Track` do proxy, prévia do Deezer guardada só como id.
 */
export const SCHEMA_VERSION = 2;
export const MAX_TRACKS = 50;
export const MAX_PLAYLISTS = 100;
export const NAME_MAX = 40;
export const DESC_MAX = 80;
export const BY_MAX = 30;

export interface Playlist {
  id: string;
  name: string;
  description: string;
  by: string;
  theme: ThemeKey;
  layout: LayoutKey;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
  /** De onde a playlist nasceu, para exibir ("Baseada em Top Mundo"). */
  origin: string | null;
}

export interface Library {
  schemaVersion: typeof SCHEMA_VERSION;
  playlists: Playlist[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Remove caracteres de controle (quebra de linha, NUL etc.) e corta no limite. */
const stripControl = (v: string) => Array.from(v, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? "" : c)).join("");
const text = (v: unknown, max: number, fallback = ""): string => (typeof v === "string" ? stripControl(v).slice(0, max) : fallback);

const SAFE_HOSTS = ["dzcdn.net", "deezer.com", "mzstatic.com", "apple.com"];

export function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2048) return null;
  try {
    const url = new URL(v);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !SAFE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function validateArtwork(v: unknown): Artwork | null {
  if (!isObj(v)) return null;
  const small = safeHttpsUrl(v.small);
  const medium = safeHttpsUrl(v.medium);
  const large = safeHttpsUrl(v.large);
  const any = medium ?? large ?? small;
  return any ? { small: small ?? any, medium: medium ?? any, large: large ?? any } : null;
}

function validatePreview(v: unknown, id: string): Preview {
  if (!isObj(v)) return null;
  if (v.kind === "url") {
    const url = safeHttpsUrl(v.url);
    return url ? { kind: "url", url } : null;
  }
  if (v.kind === "deezer" && typeof v.trackId === "string" && /^\d{1,15}$/.test(v.trackId) && id === `dz:${v.trackId}`) {
    return { kind: "deezer", trackId: v.trackId };
  }
  return null;
}

export const TRACK_ID = /^(dz|it|lc):[A-Za-z0-9_-]{1,40}$/;

export function validateTrack(v: unknown): Track | null {
  if (!isObj(v) || typeof v.id !== "string" || !TRACK_ID.test(v.id)) return null;
  const title = text(v.title, 120).trim();
  const artist = text(v.artist, 120).trim();
  if (!title || !artist) return null;
  const source = v.source === "deezer" || v.source === "itunes" ? v.source : v.id.startsWith("dz:") ? "deezer" : "itunes";
  const duration = typeof v.durationSec === "number" && Number.isFinite(v.durationSec) && v.durationSec > 0 && v.durationSec < 24 * 3600;
  return {
    id: v.id,
    title,
    artist,
    album: typeof v.album === "string" ? text(v.album, 120) || null : null,
    durationSec: duration ? Math.round(v.durationSec as number) : null,
    artwork: validateArtwork(v.artwork),
    preview: validatePreview(v.preview, v.id),
    source,
    explicit: v.explicit === true,
    link: safeHttpsUrl(v.link),
  };
}

const isTheme = (v: unknown): v is ThemeKey => typeof v === "string" && (THEME_KEYS as readonly string[]).includes(v);
const isLayout = (v: unknown): v is LayoutKey => typeof v === "string" && (LAYOUT_KEYS as readonly string[]).includes(v);
const isoOr = (v: unknown, fallback: string) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback);

export function validatePlaylist(v: unknown, now = new Date().toISOString()): Playlist | null {
  if (!isObj(v) || typeof v.id !== "string" || !/^[A-Za-z0-9_-]{4,40}$/.test(v.id) || !Array.isArray(v.tracks)) return null;
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const raw of v.tracks) {
    const track = validateTrack(raw);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
    if (tracks.length >= MAX_TRACKS) break;
  }
  return {
    id: v.id,
    name: text(v.name, NAME_MAX),
    description: text(v.description, DESC_MAX),
    by: text(v.by, BY_MAX),
    theme: isTheme(v.theme) ? v.theme : "cobalto",
    layout: isLayout(v.layout) ? v.layout : "editorial",
    tracks,
    createdAt: isoOr(v.createdAt, now),
    updatedAt: isoOr(v.updatedAt, now),
    origin: typeof v.origin === "string" ? text(v.origin, 80) || null : null,
  };
}

/** Faixa do protótipo (v1) para o tipo atual. */
function migrateV1Track(v: unknown, index: number): Track | null {
  if (!isObj(v)) return null;
  const title = text(v.title, 120).trim();
  const artist = text(v.artist, 120).trim();
  if (!title || !artist) return null;
  const art = safeHttpsUrl(v.art);
  const preview = safeHttpsUrl(v.preview);
  const dur = typeof v.dur === "number" && v.dur > 0 ? Math.round(v.dur) : null;
  const rawId = typeof v.id === "string" ? v.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) : "";
  return {
    id: `lc:${rawId || `v1-${index}`}`,
    title,
    artist,
    album: null,
    durationSec: dur,
    artwork: art ? { small: art, medium: art, large: art } : null,
    preview: preview ? { kind: "url", url: preview } : null,
    source: "itunes",
    explicit: false,
    link: null,
  };
}

function migrateV1(v: Obj, newId: () => string, now: string): Playlist | null {
  if (!Array.isArray(v.tracks)) return null;
  return validatePlaylist(
    {
      id: newId(),
      name: v.name,
      description: v.desc,
      by: v.by,
      theme: v.theme,
      layout: v.layout,
      tracks: v.tracks.map(migrateV1Track),
      createdAt: now,
      updatedAt: now,
      origin: "Protótipo",
    },
    now,
  );
}

export interface MigrationResult {
  library: Library;
  /** Quantos itens foram descartados por estarem inválidos. */
  dropped: number;
  /** Veio de uma versão anterior e precisa ser regravado. */
  migrated: boolean;
  /** Versão mais nova que este app conhece: não sobrescrever. */
  fromFuture: boolean;
}

/** Lê qualquer coisa persistida e devolve uma biblioteca válida da versão atual. */
export function migrate(raw: unknown, newId: () => string, now = new Date().toISOString()): MigrationResult {
  const empty: Library = { schemaVersion: SCHEMA_VERSION, playlists: [] };
  if (raw == null) return { library: empty, dropped: 0, migrated: false, fromFuture: false };
  if (!isObj(raw)) return { library: empty, dropped: 1, migrated: true, fromFuture: false };

  // v1: uma playlist solta, sem schemaVersion (formato do protótipo).
  if (raw.schemaVersion === undefined && Array.isArray(raw.tracks)) {
    const playlist = migrateV1(raw, newId, now);
    return { library: { ...empty, playlists: playlist ? [playlist] : [] }, dropped: playlist ? 0 : 1, migrated: true, fromFuture: false };
  }
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : NaN;
  if (version > SCHEMA_VERSION) return { library: empty, dropped: 0, migrated: false, fromFuture: true };
  if (version !== SCHEMA_VERSION || !Array.isArray(raw.playlists)) return { library: empty, dropped: 1, migrated: true, fromFuture: false };

  const playlists: Playlist[] = [];
  const ids = new Set<string>();
  let dropped = 0;
  for (const item of raw.playlists) {
    const playlist = validatePlaylist(item, now);
    if (!playlist || ids.has(playlist.id) || playlists.length >= MAX_PLAYLISTS) {
      dropped++;
      continue;
    }
    ids.add(playlist.id);
    playlists.push(playlist);
  }
  return { library: { schemaVersion: SCHEMA_VERSION, playlists }, dropped, migrated: false, fromFuture: false };
}

export function newPlaylistId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `p${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("")}`.slice(0, 16);
}
