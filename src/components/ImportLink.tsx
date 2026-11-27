import { useState } from "react";
import type { ImportedPlaylist, PlaylistHit } from "../../server/types";
import { ApiError, failureMessage, fetchDeezerPlaylist, fetchSpotifyName, resolveDeezerShareLink, usePlaylistSearch } from "../lib/api";
import { plural } from "../lib/design";
import { extractLink, parsePlaylistLink, type ParsedLink } from "../lib/links";

export type ImportOutcome = { kind: "deezer"; playlist: ImportedPlaylist } | { kind: "spotify"; name: string };

export const LINK_HELP =
  "Cole o link de uma playlist pública do Deezer (o “Copiar link” do app ou deezer.com/…/playlist/…) ou digite o nome dela. Do Spotify vem só o nome; Apple Music e YouTube exigem chave de API e não são lidos.";

const KIND_NAME = { playlist: "uma playlist", album: "um álbum", track: "uma faixa", artist: "um artista", other: "outro tipo de conteúdo" } as const;

/** Mensagens para quem está importando: dizem o que aconteceu e o que fazer, nunca o erro técnico. */
export function importFailure(error: unknown, from: "link" | "share" | "name"): string {
  const failure = error instanceof ApiError ? error.failure : "unavailable";
  if (failure === "not_found" && from === "share")
    return "Esse link de compartilhar não abriu: ele pode ter vencido ou estar incompleto. Copie o link de novo no app do Deezer, ou digite o nome da playlist.";
  if (failure === "not_found")
    return "Não encontramos essa playlist no Deezer. Ela pode ser privada: no app, deixe a playlist pública e tente de novo. Ou digite o nome dela para procurar.";
  if (failure === "bad_request") return "Esse link parece incompleto. Copie de novo no app do Deezer e cole aqui.";
  if (failure === "upstream") return "O Deezer não respondeu agora. Tente de novo em instantes, ou digite o nome da playlist.";
  return failureMessage(error);
}

/** Link reconhecido que não dá para importar: explica o motivo e aponta a alternativa. */
function unsupportedNote(link: NonNullable<ParsedLink>): string | null {
  switch (link.service) {
    case "deezer-other":
      return `Esse link é de ${KIND_NAME[link.kind]} do Deezer, não de uma playlist. Cole o link de uma playlist, ou adicione as músicas pela busca.`;
    case "deezer-short":
      return "Esse formato antigo de link curto do Deezer não é lido aqui. No app, toque em Compartilhar → Copiar link para gerar um link novo, ou digite o nome da playlist.";
    case "youtube":
      return "Playlist do YouTube reconhecida, mas ler as faixas exige uma chave da API do Google. Digite o nome para achar uma playlist parecida no Deezer, ou adicione as músicas pela busca.";
    case "apple":
      return "Playlists da Apple Music só podem ser lidas com uma chave de desenvolvedor da Apple, que o Coverlist não usa. Digite o nome dela para achar uma parecida no Deezer.";
    default:
      return null;
  }
}

function PlaylistResults({ term, busyId, onPick }: { term: string; busyId: string | null; onPick: (hit: PlaylistHit) => void }) {
  const search = usePlaylistSearch(term);
  const hits = search.data?.playlists ?? [];
  let note = "";
  if (search.isError) note = importFailure(search.error, "name");
  else if (search.isFetching && (!search.data || search.isPlaceholderData)) note = `Procurando “${term}” no Deezer…`;
  else if (search.data && !hits.length) note = `Nenhuma playlist pública do Deezer com “${term}”. Tente outro nome.`;
  else if (hits.length) note = `Playlists públicas do Deezer com “${term}”. Escolha uma para importar as faixas.`;
  return (
    <>
      <p className="note" aria-live="polite">
        {note}
      </p>
      <ul className="results pl-results" aria-label="Playlists do Deezer encontradas">
        {hits.map((hit) => (
          <li key={hit.id}>
            <button type="button" disabled={busyId !== null} onClick={() => onPick(hit)} aria-label={`Importar ${hit.title}${hit.creator ? `, de ${hit.creator}` : ""}, ${plural(hit.total, "faixa", "faixas")}`}>
              <span className="thumb" style={{ background: hit.artwork ? `url("${hit.artwork.small.replace(/["\\]/g, "")}") center/cover, #555` : "#555" }} />
              <span className="t-meta">
                <b>{hit.title}</b>
                <i>
                  {hit.creator ? `${hit.creator} · ` : ""}
                  {plural(hit.total, "faixa", "faixas")}
                </i>
              </span>
              <span className="src">{busyId === hit.id ? "Lendo…" : "Importar"}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Importar playlist: link do Deezer (inclusive o de compartilhar do app, link.deezer.com/s/…), id numérico
 * ou nome. Pelo nome, lista playlists públicas do Deezer. Spotify traz só o nome e sugere playlists
 * do Deezer com esse nome. YouTube e Apple Music são reconhecidos e explicados.
 */
export function ImportLink({ id, onImported, cta = "Importar" }: { id: string; onImported: (outcome: ImportOutcome) => string | void; cta?: string }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [spotifyName, setSpotifyName] = useState<string | null>(null);
  const isLink = parsePlaylistLink(value) !== null || extractLink(value) !== null;

  const importById = async (playlistId: string, from: "link" | "share" | "name") => {
    try {
      const playlist = await fetchDeezerPlaylist(playlistId);
      if (!playlist.tracks.length) return setNote(`“${playlist.title}” está vazia ou sem faixas disponíveis no Deezer.`);
      setNote(onImported({ kind: "deezer", playlist }) ?? "");
      setValue("");
      setTerm("");
      setSpotifyName(null);
    } catch (error) {
      setNote(importFailure(error, from));
    }
  };

  const fromLink = async (link: NonNullable<ParsedLink>) => {
    if (link.service === "deezer") return importById(link.id, "link");
    if (link.service === "deezer-share") {
      const target = await resolveDeezerShareLink(link.code).catch((error: unknown) => {
        setNote(importFailure(error, "share"));
        return null;
      });
      if (!target) return;
      if (target.kind === "playlist" && target.id) return importById(target.id, "share");
      return setNote(`Esse link é de ${KIND_NAME[target.kind]} do Deezer, não de uma playlist. Cole o link de uma playlist, ou adicione as músicas pela busca.`);
    }
    if (link.service === "spotify") {
      const name = (await fetchSpotifyName(link.id)).title;
      setSpotifyName(name);
      setTerm(name.slice(0, 80));
      return setNote(`O Spotify só libera o nome: “${name}”. Escolha abaixo uma playlist do Deezer com esse nome para trazer as faixas, ou crie só com o nome.`);
    }
    setNote(unsupportedNote(link) ?? "");
  };

  const run = async () => {
    if (busy || busyId) return;
    const text = value.trim();
    const link = parsePlaylistLink(text);
    setSpotifyName(null);
    if (!link && extractLink(text))
      return setNote("Esse link não é de uma playlist do Deezer, Spotify, Apple Music ou YouTube. Cole o link da playlist ou digite o nome dela.");
    if (!link) {
      if (text.length < 2) return setNote("Cole um link ou digite pelo menos 2 letras do nome da playlist.");
      setNote("");
      return setTerm(text.slice(0, 80));
    }
    setBusy(true);
    setTerm("");
    setNote("Lendo a playlist…");
    try {
      await fromLink(link);
    } catch (error) {
      setNote(importFailure(error, "link"));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (hit: PlaylistHit) => {
    if (busy || busyId) return;
    setBusyId(hit.id);
    setNote(`Lendo “${hit.title}”…`);
    await importById(hit.id, "name");
    setBusyId(null);
  };

  const nameOnly = () => {
    if (!spotifyName) return;
    setNote(onImported({ kind: "spotify", name: spotifyName }) ?? "");
    setSpotifyName(null);
    setTerm("");
    setValue("");
  };

  return (
    <div className="importer">
      <label className="sr" htmlFor={id}>
        Link ou nome da playlist
      </label>
      <div className="link-row field">
        <input
          id={id}
          type="text"
          enterKeyHint="go"
          placeholder="Cole o link ou digite o nome da playlist"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          aria-describedby={`${id}-help`}
        />
        <button type="button" className="ghost" onClick={() => void run()} disabled={busy || busyId !== null || !value.trim()}>
          {busy ? "Lendo…" : isLink || !value.trim() ? cta : "Buscar"}
        </button>
      </div>
      <p className="note" id={`${id}-help`}>
        {LINK_HELP}
      </p>
      <p className="note" aria-live="polite">
        {note}
      </p>
      {spotifyName && (
        <button type="button" className="ghost name-only" onClick={nameOnly}>
          Criar só com o nome “{spotifyName}”
        </button>
      )}
      {term && <PlaylistResults term={term} busyId={busyId} onPick={(hit) => void pick(hit)} />}
    </div>
  );
}
