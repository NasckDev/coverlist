import { clear, createStore, get, set } from "idb-keyval";
import { loadLibrary, saveLibrary, LEGACY_LOCAL_KEY } from "../../src/store/db";
import { MAX_PLAYLISTS, MAX_TRACKS, migrate, SCHEMA_VERSION, validatePlaylist, validateTrack, type Library } from "../../src/store/schema";
import type { Track } from "../../server/types";

let n = 0;
const newId = () => `test${++n}`;

const track = (i: number, extra: Partial<Track> = {}): Track => ({
  id: `dz:${1000 + i}`,
  title: `Faixa ${i}`,
  artist: "Artista",
  album: null,
  durationSec: 180,
  artwork: null,
  preview: { kind: "deezer", trackId: String(1000 + i) },
  source: "deezer",
  explicit: false,
  link: null,
  ...extra,
});

const playlist = (id: string, tracks: Track[] = [track(1)]) => ({
  id,
  name: "Minha",
  description: "",
  by: "Ale",
  theme: "brasa",
  layout: "poster",
  tracks,
  createdAt: "2026-11-25T10:00:00.000Z",
  updatedAt: "2026-11-25T10:00:00.000Z",
  origin: null,
});

describe("validação", () => {
  it("aceita uma faixa válida e descarta URL de host desconhecido", () => {
    expect(validateTrack(track(1))).toEqual(track(1));
    const evil = validateTrack(track(2, { artwork: { small: "https://evil.example/a.jpg", medium: "javascript:alert(1)", large: "x" } }));
    expect(evil?.artwork).toBeNull();
    expect(validateTrack(track(3, { preview: { kind: "url", url: "http://audio-ssl.itunes.apple.com/a.m4a" } }))?.preview).toBeNull();
  });

  it("aceita prévia do iTunes a resolver ao tocar só com id e país coerentes", () => {
    const it = { ...track(1), id: "it:123", source: "itunes" as const };
    expect(validateTrack({ ...it, preview: { kind: "itunes", trackId: "123", country: "br" } })?.preview).toEqual({ kind: "itunes", trackId: "123", country: "br" });
    expect(validateTrack({ ...it, preview: { kind: "itunes", trackId: "999", country: "br" } })?.preview).toBeNull();
    expect(validateTrack({ ...it, preview: { kind: "itunes", trackId: "123", country: "BRA" } })?.preview).toBeNull();
  });

  it("recusa prévia do Deezer que não corresponde ao id da faixa", () => {
    expect(validateTrack(track(1, { preview: { kind: "deezer", trackId: "999" } }))?.preview).toBeNull();
  });

  it("recusa id fora do padrão e remove caracteres de controle", () => {
    expect(validateTrack({ ...track(1), id: "x:1" })).toBeNull();
    expect(validateTrack({ ...track(1), title: "A\u0000B\nC" })?.title).toBe("ABC");
  });

  it("limita faixas, remove duplicatas e corrige tema/modelo inválidos", () => {
    const many = Array.from({ length: MAX_TRACKS + 10 }, (_, i) => track(i));
    const p = validatePlaylist({ ...playlist("abcd", [track(1), track(1), ...many]), theme: "neon", layout: "x" });
    expect(p?.tracks).toHaveLength(MAX_TRACKS);
    expect(new Set(p?.tracks.map((t) => t.id)).size).toBe(MAX_TRACKS);
    expect(p?.theme).toBe("cobalto");
    expect(p?.layout).toBe("editorial");
  });
});

describe("migração", () => {
  it("v1 (formato do protótipo) vira uma playlist v2", () => {
    const v1 = {
      name: "O mundo no repeat",
      desc: "Sucessos",
      by: "Coverlist",
      theme: "noite",
      layout: "deck",
      current: 0,
      tracks: [
        { id: "t1", title: "Blinding Lights", artist: "The Weeknd", dur: 200 },
        { id: "t2", title: "Com capa", artist: "X", dur: 100, art: "https://is1-ssl.mzstatic.com/a/300x300bb.jpg", preview: "https://audio-ssl.itunes.apple.com/a.m4a" },
        { title: "", artist: "sem título" },
      ],
    };
    const result = migrate(v1, newId, "2026-11-25T00:00:00.000Z");
    expect(result.migrated).toBe(true);
    expect(result.library.schemaVersion).toBe(SCHEMA_VERSION);
    const [p] = result.library.playlists;
    expect(p).toMatchObject({ name: "O mundo no repeat", description: "Sucessos", theme: "noite", layout: "deck", origin: "Protótipo" });
    expect(p.tracks).toHaveLength(2);
    expect(p.tracks[0]).toMatchObject({ id: "lc:t1", durationSec: 200, preview: null });
    expect(p.tracks[1].preview).toEqual({ kind: "url", url: "https://audio-ssl.itunes.apple.com/a.m4a" });
  });

  it("v2 válido passa sem regravar; itens corrompidos são contados", () => {
    const result = migrate({ schemaVersion: SCHEMA_VERSION, playlists: [playlist("abcd"), { lixo: true }, playlist("abcd")] }, newId);
    expect(result.migrated).toBe(false);
    expect(result.library.playlists).toHaveLength(1);
    expect(result.dropped).toBe(2);
  });

  it("versão futura não é sobrescrita", () => {
    expect(migrate({ schemaVersion: SCHEMA_VERSION + 1, playlists: [] }, newId).fromFuture).toBe(true);
  });

  it("lixo vira biblioteca vazia", () => {
    expect(migrate("abc", newId).library.playlists).toEqual([]);
    expect(migrate(null, newId)).toMatchObject({ dropped: 0, migrated: false });
  });

  it("respeita o máximo de playlists", () => {
    const list = Array.from({ length: MAX_PLAYLISTS + 3 }, (_, i) => playlist(`pl${String(i).padStart(3, "0")}`));
    expect(migrate({ schemaVersion: SCHEMA_VERSION, playlists: list }, newId).library.playlists).toHaveLength(MAX_PLAYLISTS);
  });
});

describe("IndexedDB", () => {
  const store = createStore("coverlist", "kv");
  beforeEach(async () => {
    await clear(store);
    localStorage.clear();
  });

  it("grava e lê a biblioteca com a versão de esquema", async () => {
    const library: Library = { schemaVersion: SCHEMA_VERSION, playlists: [validatePlaylist(playlist("abcd"))!] };
    expect(await saveLibrary(library)).toBe(true);
    expect(await get("library", store)).toEqual(library);
    const loaded = await loadLibrary();
    expect(loaded.library).toEqual(library);
    expect(loaded.persistent).toBe(true);
  });

  it("importa o protótipo do localStorage na primeira vez e grava já migrado", async () => {
    localStorage.setItem(LEGACY_LOCAL_KEY, JSON.stringify({ name: "Antiga", tracks: [{ id: "a", title: "T", artist: "A", dur: 120 }] }));
    const loaded = await loadLibrary();
    expect(loaded.library.playlists[0].name).toBe("Antiga");
    expect(await get("library", store)).toMatchObject({ schemaVersion: SCHEMA_VERSION });
  });

  it("dado corrompido no banco vira biblioteca vazia e é regravado", async () => {
    await set("library", { schemaVersion: SCHEMA_VERSION, playlists: "quebrado" }, store);
    const loaded = await loadLibrary();
    expect(loaded.library.playlists).toEqual([]);
    expect(loaded.dropped).toBe(1);
  });
});
