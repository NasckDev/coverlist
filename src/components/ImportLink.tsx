import { useState } from "react";
import type { ImportedPlaylist } from "../../server/types";
import { failureMessage, fetchDeezerPlaylist, fetchSpotifyName } from "../lib/api";
import { parsePlaylistLink } from "../lib/links";

export type ImportOutcome = { kind: "deezer"; playlist: ImportedPlaylist } | { kind: "spotify"; name: string };

export const LINK_HELP =
  "Funciona com playlists públicas do Deezer (as faixas vêm de verdade). Do Spotify, só o nome: o Spotify não libera as faixas sem login. YouTube exige chave de API e não é lido.";

/** Campo de link de playlist: Deezer importa faixas; Spotify traz só o nome; YouTube é recusado com explicação. */
export function ImportLink({ id, onImported, cta = "Importar" }: { id: string; onImported: (outcome: ImportOutcome) => string | void; cta?: string }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const link = parsePlaylistLink(value);
    if (!link) return setNote("Cole o link de uma playlist do Deezer (deezer.com/…/playlist/123) ou do Spotify.");
    if (link.service === "youtube") return setNote("Playlist do YouTube reconhecida, mas ler as faixas exige uma chave da API do Google. Adicione as músicas pela busca.");
    if (link.service === "deezer-short") return setNote("Links curtos do app não são abertos aqui. Abra o link no navegador e cole o endereço completo (deezer.com/…/playlist/…).");
    setBusy(true);
    setNote("Lendo a playlist…");
    try {
      const outcome: ImportOutcome =
        link.service === "deezer" ? { kind: "deezer", playlist: await fetchDeezerPlaylist(link.id) } : { kind: "spotify", name: (await fetchSpotifyName(link.id)).title };
      setNote(onImported(outcome) ?? "");
      setValue("");
    } catch (error) {
      setNote(failureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="sr" htmlFor={id}>
        Link da playlist
      </label>
      <div className="link-row field">
        <input
          id={id}
          type="url"
          placeholder="Cole o link da playlist"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          aria-describedby={`${id}-help`}
        />
        <button type="button" className="ghost" onClick={() => void run()} disabled={busy || !value.trim()}>
          {busy ? "Lendo…" : cta}
        </button>
      </div>
      <p className="note" id={`${id}-help`}>
        {LINK_HELP}
      </p>
      <p className="note" aria-live="polite">
        {note}
      </p>
    </>
  );
}
