/**
 * Regrava em tests/fixtures as respostas reais das APIs usadas nos testes.
 * Depois de regravar, os testes que dependem de números exatos (datas, contagens) podem precisar de ajuste:
 * é proposital, a fixture é a fonte da verdade do teste.
 * Uso: npm run fixtures:record
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures");

async function save(name: string, url: string): Promise<unknown> {
  const res = await fetch(url);
  const text = await res.text();
  writeFileSync(join(DIR, name), text);
  console.log(`${res.status} ${name} (${text.length} bytes)`);
  return JSON.parse(text) as unknown;
}

const rss = (await save("apple-rss-br.json", "https://rss.marketingtools.apple.com/api/v2/br/music/most-played/25/songs.json")) as {
  feed: { results: { id: string }[] };
};
const ids = rss.feed.results.map((r) => r.id).join(",");
await save("itunes-lookup-br.json", `https://itunes.apple.com/lookup?id=${ids}&country=br&entity=song`);
await save("itunes-search-anitta.json", "https://itunes.apple.com/search?term=anitta&media=music&entity=song&limit=10&country=br");
await save("deezer-search-anitta.json", "https://api.deezer.com/search?q=anitta&limit=10");
await save("deezer-playlist-top-worldwide.json", "https://api.deezer.com/playlist/3155776842");
await save("deezer-chart-tracks.json", "https://api.deezer.com/chart/0/tracks?limit=25");
await save("deezer-editorial-charts.json", "https://api.deezer.com/editorial/0/charts");
await save("deezer-genre.json", "https://api.deezer.com/genre");
await save("deezer-search-playlist-rock.json", "https://api.deezer.com/search/playlist?q=rock&limit=5");
await save("deezer-track.json", "https://api.deezer.com/track/3602074142");
await save("deezer-error-nodata.json", "https://api.deezer.com/playlist/1");
await save("spotify-oembed.json", `https://open.spotify.com/oembed?url=${encodeURIComponent("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")}`);
