import deezerPlaylist from "../fixtures/deezer-playlist-top-worldwide.json";
import itunesSearch from "../fixtures/itunes-search-anitta.json";
import { normalizeDeezerTracks, normalizeItunesResults } from "../../server/normalize";
import { artFromRef, decodeShare, encodeShare, MAX_PAYLOAD_CHARS, PUBLIC_APP_URL, shareUrl, type SharedPlaylist } from "../../src/share/codec";

async function rawPayload(data: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const out = new Uint8Array(await new Response(source.pipeThrough(new CompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).arrayBuffer());
  let bin = "";
  for (const b of out) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const base: SharedPlaylist = {
  name: "Mistura",
  description: "Deezer e iTunes",
  by: "Ale",
  theme: "menta",
  layout: "deck",
  tracks: [...normalizeDeezerTracks(deezerPlaylist.tracks.data, 25), ...normalizeItunesResults(itunesSearch, 25)],
};

describe("link compartilhável", () => {
  it("ida e volta preserva nome, visual, faixas, capas e prévias", async () => {
    const payload = await encodeShare(base);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(payload);
    expect(back).toMatchObject({ name: "Mistura", description: "Deezer e iTunes", by: "Ale", theme: "menta", layout: "deck" });
    expect(back.tracks.map((t) => t.id)).toEqual(base.tracks.map((t) => t.id));
    const dz = back.tracks[0];
    expect(dz.preview).toEqual(base.tracks[0].preview);
    expect(dz.artwork?.large).toBe(base.tracks[0].artwork?.large);
    const it = back.tracks[25];
    expect(it.preview).toEqual(base.tracks[25].preview);
    expect(it.artwork?.large).toBe(base.tracks[25].artwork?.large);
  });

  it("35 faixas reais ficam bem abaixo do limite de tamanho", async () => {
    const payload = await encodeShare(base);
    expect(base.tracks.length).toBe(35);
    expect(payload.length).toBeLessThan(MAX_PAYLOAD_CHARS / 2);
  });

  it.each([
    ["vazio", ""],
    ["caracteres fora de base64url", "abc$%"],
    ["não comprimido", "aGVsbG8"],
  ])("rejeita payload %s", async (_name, payload) => {
    await expect(decodeShare(payload)).rejects.toThrow();
  });

  it("rejeita versão, tema e faixa inválidos", async () => {
    await expect(decodeShare(await rawPayload([2, "a", "", "", "menta", "deck", []]))).rejects.toThrow();
    await expect(decodeShare(await rawPayload([1, "a", "", "", "neon", "deck", []]))).rejects.toThrow();
    await expect(decodeShare(await rawPayload([1, "a", "", "", "menta", "deck", [["javascript:1", "t", "a", 0, "", ""]]]))).rejects.toThrow();
  });

  it("não deixa um link adulterado apontar para outro host", async () => {
    const tampered = await decodeShare(await rawPayload([1, "a", "", "", "menta", "deck", [["it:1", "t", "a", 0, "a1|../../evil", "i../../x"]]]));
    expect(tampered.tracks[0].artwork).toBeNull();
    expect(tampered.tracks[0].preview).toBeNull();
    expect(artFromRef("dhttps://evil")).toBeNull();
  });

  it("preserva a prévia do iTunes pendente (resolvida ao tocar)", async () => {
    const pending = { ...base.tracks[25], preview: { kind: "itunes" as const, trackId: base.tracks[25].id.slice(3), country: "us" } };
    const back = await decodeShare(await encodeShare({ ...base, tracks: [pending] }));
    expect(back.tracks[0].preview).toEqual(pending.preview);
  });

  it("usa o domínio público fora do localhost", () => {
    expect(shareUrl("abc", { hostname: "nasck.vercel.app", origin: "https://nasck.vercel.app", pathname: "/projetos/coverlist/" })).toBe(`${PUBLIC_APP_URL}#/s/abc`);
    expect(shareUrl("abc", { hostname: "localhost", origin: "http://localhost:5191", pathname: "/" })).toBe("http://localhost:5191/#/s/abc");
  });
});
