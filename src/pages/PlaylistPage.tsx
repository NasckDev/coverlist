import { useMemo, useState } from "react";
import { ErrorState, Topbar, useToast } from "../components/Chrome";
import { ImportLink, type ImportOutcome } from "../components/ImportLink";
import { ShareDialog } from "../components/ShareDialog";
import { Studio } from "../components/Studio";
import { EditableTrackList } from "../components/TrackList";
import { TrackSearch } from "../components/TrackSearch";
import { VisualTab } from "../components/VisualTab";
import { Icon } from "../components/icons";
import { href } from "../lib/router";
import { usePlayer } from "../player/PlayerProvider";
import { usePlaylists } from "../store/playlists";
import { BY_MAX, DESC_MAX, MAX_TRACKS, NAME_MAX } from "../store/schema";
import { LoadingStudio } from "./CollectionPage";

export function PlaylistPage({ id }: { id: string }) {
  const store = usePlaylists();
  const toast = useToast();
  const player = usePlayer();
  const [sharing, setSharing] = useState(false);
  const playlist = store.get(id);
  const have = useMemo(() => new Set(playlist?.tracks.map((t) => t.id)), [playlist]);
  const playingIndex = player.queueKey === `p-${id}` ? player.index : 0;
  const shareContent = useMemo(() => (playlist ? { ...playlist, current: playingIndex } : null), [playlist, playingIndex]);

  if (!store.ready) return <LoadingStudio label="Abrindo a playlist…" />;
  if (!playlist)
    return (
      <div className="page">
        <Topbar current="library" />
        <main className="page-main" id="conteudo" tabIndex={-1}>
          <ErrorState title="Playlist não encontrada" message="Ela pode ter sido excluída ou criada em outro navegador. Playlists ficam salvas só neste aparelho." />
          <p>
            <a href={href.library()}>Ver minhas playlists</a>
          </p>
        </main>
      </div>
    );

  const queueKey = `p-${playlist.id}`;
  const count = playlist.tracks.length;

  const onImported = (outcome: ImportOutcome) => {
    if (outcome.kind === "spotify") {
      store.update(playlist.id, { name: outcome.name.slice(0, NAME_MAX) });
      return "Nome importado do Spotify. As faixas não vêm: o Spotify não libera a lista sem login. Adicione as músicas pela busca.";
    }
    const { added, skipped } = store.addTracks(playlist.id, outcome.playlist.tracks);
    return `${added} ${added === 1 ? "faixa adicionada" : "faixas adicionadas"} de “${outcome.playlist.title}”.${skipped ? ` ${skipped} ficaram de fora (repetidas ou acima do limite de ${MAX_TRACKS}).` : ""}`;
  };

  const field = (key: "name" | "description" | "by", label: string, max: number) => (
    <label className="field">
      <span>{label}</span>
      <input maxLength={max} autoComplete="off" value={playlist[key]} onChange={(e) => store.update(playlist.id, { [key]: e.target.value })} />
    </label>
  );

  return (
    <>
      <Studio
        panelLabel="Editor da playlist"
        queueKey={queueKey}
        meta={playlist}
        tracks={playlist.tracks}
        header={
          <nav className="crumbs" aria-label="Caminho">
            <a href={href.library()}>Minhas playlists</a>
            <span aria-hidden="true">/</span>
            <span>{playlist.name.trim() || "Sem nome"}</span>
          </nav>
        }
        tabs={[
          {
            id: "faixas",
            label: (
              <>
                Faixas <b>{count}</b>
              </>
            ),
            content: (
              <>
                <TrackSearch
                  have={have}
                  count={count}
                  onAdd={(t) => {
                    const result = store.addTrack(playlist.id, t);
                    if (result === "full") toast(`Limite de ${MAX_TRACKS} faixas por playlist.`);
                  }}
                />
                <details className="import">
                  <summary>Importar de um link do Deezer ou Spotify</summary>
                  <ImportLink id={`link-${playlist.id}`} onImported={onImported} />
                </details>
                {count >= MAX_TRACKS - 5 && (
                  <p className="limit">
                    {count >= MAX_TRACKS ? `Playlist cheia: ${MAX_TRACKS} de ${MAX_TRACKS} faixas.` : `${count} de ${MAX_TRACKS} faixas: quase no limite.`}
                  </p>
                )}
                <EditableTrackList
                  tracks={playlist.tracks}
                  queueKey={queueKey}
                  onMove={(from, to) => store.moveTrack(playlist.id, from, to)}
                  onRemove={(trackId) => {
                    const index = playlist.tracks.findIndex((t) => t.id === trackId);
                    const removed = playlist.tracks[index];
                    store.removeTrack(playlist.id, trackId);
                    toast(`“${removed.title}” removida.`, {
                      label: "Desfazer",
                      run: () => store.insertTrack(playlist.id, removed, index),
                    });
                  }}
                />
              </>
            ),
          },
          {
            id: "detalhes",
            label: "Detalhes",
            content: (
              <>
                {field("name", "Nome", NAME_MAX)}
                {field("description", "Descrição", DESC_MAX)}
                {field("by", "Quem montou", BY_MAX)}
                {playlist.origin && <p className="note">Baseada em “{playlist.origin}”.</p>}
              </>
            ),
          },
          {
            id: "visual",
            label: "Visual",
            content: (
              <VisualTab
                theme={playlist.theme}
                layout={playlist.layout}
                onTheme={(theme) => store.update(playlist.id, { theme })}
                onLayout={(layout) => store.update(playlist.id, { layout })}
              />
            ),
          },
        ]}
        foot={
          <button type="button" className="solid share-btn" onClick={() => setSharing(true)}>
            <Icon.share />
            <span>Compartilhar playlist</span>
          </button>
        }
      />
      {shareContent && <ShareDialog open={sharing} onClose={() => setSharing(false)} layout={playlist.layout} content={shareContent} />}
    </>
  );
}
