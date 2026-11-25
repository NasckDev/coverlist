// @vitest-environment node
import deezerSearch from "../fixtures/deezer-search-anitta.json";
import itunesSearch from "../fixtures/itunes-search-anitta.json";
import { artistKey, dedupeKey, dedupeTracks, interleave, titleKey } from "../../server/dedupe";
import { normalizeDeezerTracks, normalizeItunesResults } from "../../server/normalize";
import type { Track } from "../../server/types";

const base: Track = {
  id: "dz:1",
  title: "Song",
  artist: "Artist",
  album: null,
  durationSec: 200,
  artwork: null,
  preview: null,
  source: "deezer",
  explicit: false,
  link: null,
};

describe("chaves de deduplicação", () => {
  it("ignora acentos, participações e remasterização no título", () => {
    expect(titleKey("Você Já Sabe")).toBe("voce ja sabe");
    expect(titleKey("Sim ou não (feat. Maluma)")).toBe(titleKey("Sim Ou Não"));
    expect(titleKey("Yellow - Remastered 2011")).toBe("yellow");
    expect(titleKey("Pós (Ao Vivo)")).not.toBe(titleKey("Pós"));
  });

  it("usa só o primeiro artista creditado", () => {
    expect(artistKey("Anitta & Los Brasileros")).toBe("anitta");
    expect(artistKey("Anitta, LUDMILLA & Snoop Dogg")).toBe("anitta");
    expect(artistKey("Post Malone feat. Swae Lee")).toBe("post malone");
  });
});

describe("dedupeTracks", () => {
  it("remove a mesma faixa vinda do Deezer e do iTunes na busca real e completa a prévia", () => {
    const deezer = normalizeDeezerTracks(deezerSearch.data, 10);
    const itunes = normalizeItunesResults(itunesSearch, 10);
    const merged = dedupeTracks(interleave(deezer, itunes));
    const keys = merged.map(dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(merged.length).toBeLessThan(deezer.length + itunes.length);
    const voce = merged.filter((t) => titleKey(t.title) === "voce ja sabe");
    expect(voce).toHaveLength(1);
  });

  it("não junta gravações com durações muito diferentes", () => {
    const studio = { ...base, id: "dz:1", durationSec: 200 };
    const extended = { ...base, id: "it:2", source: "itunes" as const, durationSec: 420 };
    expect(dedupeTracks([studio, extended])).toHaveLength(2);
  });

  it("mantém a primeira e herda campos que faltavam", () => {
    const art = { small: "s", medium: "m", large: "l" };
    const first = { ...base, id: "dz:1", artwork: null, preview: null };
    const second = { ...base, id: "it:9", source: "itunes" as const, artwork: art, preview: { kind: "url" as const, url: "u" } };
    expect(dedupeTracks([first, second])).toEqual([{ ...first, artwork: art, preview: { kind: "url", url: "u" } }]);
  });

  it("ignora ids repetidos", () => {
    expect(dedupeTracks([base, base])).toHaveLength(1);
  });

  it("intercala as fontes", () => {
    expect(interleave([1, 3, 5], [2, 4])).toEqual([1, 2, 3, 4, 5]);
  });
});
