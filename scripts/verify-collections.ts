/**
 * Confere ao vivo se cada coleção curada ainda aponta para o que a configuração diz:
 * a playlist do Deezer existe e pertence à conta editorial anotada; o feed da Apple responde.
 * Uso: npm run verify:collections
 */
import { COLLECTIONS } from "../server/collections";

let failures = 0;

for (const c of COLLECTIONS) {
  try {
    if (c.source.kind === "deezer-playlist") {
      const res = await fetch(`https://api.deezer.com/playlist/${c.source.playlistId}`);
      const data = (await res.json()) as { error?: unknown; title?: string; nb_tracks?: number; creator?: { name?: string } };
      const owner = data.creator?.name;
      const ok = !data.error && owner === c.source.owner;
      if (!ok) failures++;
      console.log(`${ok ? "ok  " : "FALHA"} ${c.id.padEnd(18)} Deezer ${c.source.playlistId} "${data.title}" (${data.nb_tracks} faixas) de ${owner}`);
    } else {
      const url = `https://rss.marketingtools.apple.com/api/v2/${c.source.country}/music/most-played/${c.source.limit}/songs.json`;
      const res = await fetch(url);
      const data = (await res.json()) as { feed?: { results?: unknown[]; updated?: string } };
      const count = data.feed?.results?.length ?? 0;
      if (!res.ok || !count) failures++;
      console.log(`${res.ok && count ? "ok  " : "FALHA"} ${c.id.padEnd(18)} Apple RSS ${c.source.country} (${count} faixas, ${data.feed?.updated})`);
    }
  } catch (error) {
    failures++;
    console.log(`FALHA ${c.id}: ${error instanceof Error ? error.message : error}`);
  }
}

process.exit(failures ? 1 : 0);
