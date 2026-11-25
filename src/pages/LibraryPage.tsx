import { useRef, useState } from "react";
import { MiniCover, OfflineBanner, SkipLink, Topbar, useToast } from "../components/Chrome";
import { ImportLink, type ImportOutcome } from "../components/ImportLink";
import { Icon } from "../components/icons";
import { fold, formatDate, plural, summaryLine } from "../lib/design";
import { href, navigate } from "../lib/router";
import { usePlaylists } from "../store/playlists";
import { BY_MAX, DESC_MAX, MAX_PLAYLISTS, MAX_TRACKS, migrate, NAME_MAX, newPlaylistId, SCHEMA_VERSION, type Playlist } from "../store/schema";

export const MAX_IMPORT_BYTES = 1_000_000;

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const store = usePlaylists();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(playlist.name);
  const name0 = playlist.name.trim() || "Sem nome";
  const updated = formatDate(playlist.updatedAt);

  const remove = () => {
    const undo = store.remove(playlist.id);
    toast(`“${name0}” excluída.`, { label: "Desfazer", run: undo });
  };
  const duplicate = () => {
    const copy = store.duplicate(playlist.id);
    toast(copy ? `Cópia criada: “${copy.name}”.` : `Limite de ${MAX_PLAYLISTS} playlists atingido.`);
  };

  return (
    <li className="pcard">
      <a href={href.playlist(playlist.id)} aria-label={`Abrir ${name0}, ${summaryLine(playlist.tracks) || "sem faixas"}`}>
        <MiniCover title={name0} theme={playlist.theme} track={playlist.tracks.find((t) => t.artwork) ?? playlist.tracks[0] ?? null} tag={playlist.by ? `de ${playlist.by}` : undefined} />
        <span className="ccard-meta">
          <b>{name0}</b>
          <span>
            {summaryLine(playlist.tracks) || "Sem faixas ainda"}
            {updated ? ` · editada em ${updated}` : ""}
          </span>
        </span>
      </a>
      {renaming ? (
        <form
          className="rename"
          onSubmit={(e) => {
            e.preventDefault();
            store.update(playlist.id, { name: name.slice(0, NAME_MAX) });
            setRenaming(false);
          }}
        >
          <label className="sr" htmlFor={`rn-${playlist.id}`}>
            Novo nome
          </label>
          {/* O campo recebe foco ao abrir a edição: é a ação que a pessoa acabou de pedir. */}
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input id={`rn-${playlist.id}`} value={name} maxLength={NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setRenaming(false)} />
          <button type="submit" className="ghost">
            Salvar
          </button>
        </form>
      ) : (
        <div className="pcard-actions">
          <button type="button" onClick={() => {
              setName(playlist.name);
              setRenaming(true);
            }} aria-label={`Renomear ${name0}`}>
            Renomear
          </button>
          <button type="button" onClick={duplicate} aria-label={`Duplicar ${name0}`}>
            Duplicar
          </button>
          <button type="button" onClick={remove} aria-label={`Excluir ${name0}`}>
            Excluir
          </button>
        </div>
      )}
    </li>
  );
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function LibraryPage() {
  const store = usePlaylists();
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const [fileNote, setFileNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const f = fold(filter.trim());
  const shown = f ? store.playlists.filter((p) => fold(`${p.name} ${p.description} ${p.by}`).includes(f)) : store.playlists;

  const create = () => {
    const p = store.create();
    if (!p) return toast(`Limite de ${MAX_PLAYLISTS} playlists atingido.`);
    navigate(href.playlist(p.id));
  };

  const exportAll = () => {
    const date = new Date().toISOString().slice(0, 10);
    download(`coverlist-playlists-${date}.json`, { app: "coverlist", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), playlists: store.playlists });
    setFileNote(`${plural(store.playlists.length, "playlist exportada", "playlists exportadas")}.`);
  };

  const importFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) return setFileNote("Arquivo grande demais (máximo de 1 MB).");
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return setFileNote("Esse arquivo não é um JSON válido.");
    }
    if (typeof data !== "object" || data === null || (data as { app?: unknown }).app !== "coverlist") return setFileNote("Esse arquivo não foi exportado pelo Coverlist.");
    const { library, dropped, fromFuture } = migrate(data, newPlaylistId);
    if (fromFuture) return setFileNote("O arquivo é de uma versão mais nova do Coverlist.");
    const { added, skipped } = store.importMany(library.playlists);
    const ignored = skipped + dropped;
    setFileNote(`${plural(added, "playlist importada", "playlists importadas")}${ignored ? `, ${ignored} ignorada(s) por estarem inválidas ou acima do limite` : ""}.`);
  };

  const onImported = (outcome: ImportOutcome) => {
    if (outcome.kind === "spotify") {
      const p = store.create({ name: outcome.name.slice(0, NAME_MAX), origin: "Spotify (só o nome)" });
      if (!p) return `Limite de ${MAX_PLAYLISTS} playlists atingido.`;
      toast("Nome importado do Spotify. As faixas não vêm: adicione pela busca.");
      navigate(href.playlist(p.id));
      return;
    }
    const src = outcome.playlist;
    const p = store.create({
      name: src.title.slice(0, NAME_MAX),
      description: src.description.slice(0, DESC_MAX),
      by: (src.creator ?? "").slice(0, BY_MAX),
      tracks: src.tracks.slice(0, MAX_TRACKS),
      origin: `Deezer: ${src.title}`,
    });
    if (!p) return `Limite de ${MAX_PLAYLISTS} playlists atingido.`;
    toast(src.tracks.length > MAX_TRACKS ? `Importadas as ${MAX_TRACKS} primeiras de ${src.total} faixas (limite por playlist).` : `${plural(p.tracks.length, "faixa importada", "faixas importadas")} do Deezer.`);
    navigate(href.playlist(p.id));
  };

  return (
    <div className="page">
      <SkipLink />
      <Topbar current="library" />
      <main className="page-main" id="conteudo" tabIndex={-1}>
        <div className="hero">
          <h1>Minhas playlists</h1>
          <p>Ficam salvas neste navegador. Exporte em JSON para levar para outro aparelho, ou compartilhe por link.</p>
        </div>
        <OfflineBanner note="Suas playlists continuam aqui. Busca, importação e prévias precisam de internet." />
        {store.readOnly && (
          <p className="banner warn" role="alert">
            Os dados salvos são de uma versão mais nova do Coverlist. Nada será gravado por cima deles nesta aba.
          </p>
        )}
        {!store.persistent && store.ready && (
          <p className="banner warn" role="alert">
            Este navegador não liberou o armazenamento local. As playlists valem só até fechar a aba; exporte em JSON para não perder.
          </p>
        )}
        <div className="lib-actions">
          <button type="button" className="solid" onClick={create} disabled={!store.ready}>
            Nova playlist
          </button>
          <div className="search">
            <Icon.search />
            <label className="sr" htmlFor="lib-filter">
              Buscar nas minhas playlists
            </label>
            <input id="lib-filter" type="search" placeholder="Buscar nas minhas playlists" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <button type="button" className="ghost" onClick={exportAll} disabled={!store.playlists.length}>
            Exportar JSON
          </button>
          <button type="button" className="ghost" onClick={() => fileInput.current?.click()} disabled={!store.ready}>
            Importar JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Arquivo JSON exportado pelo Coverlist"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
        </div>
        <p className="note" aria-live="polite">
          {fileNote}
        </p>
        <section className="lib-import" aria-labelledby="imp-h">
          <h2 id="imp-h">Importar playlist por link</h2>
          <ImportLink id="lib-link" onImported={onImported} cta="Importar" />
        </section>

        {!store.ready && <p role="status">Carregando suas playlists…</p>}
        {store.ready && store.dropped > 0 && (
          <p className="banner warn" role="status">
            {plural(store.dropped, "item salvo estava corrompido e foi ignorado", "itens salvos estavam corrompidos e foram ignorados")}.
          </p>
        )}
        {store.ready && !store.playlists.length && (
          <div className="state">
            <h2>Nenhuma playlist ainda</h2>
            <p>Crie uma do zero, importe um link do Deezer ou abra uma coleção em Explorar e use como base.</p>
            <a className="ghost" href={href.explore()}>
              Ir para Explorar
            </a>
          </div>
        )}
        {store.ready && !!store.playlists.length && !shown.length && <p className="empty">Nenhuma playlist com “{filter}”.</p>}
        <ul className="grid" aria-label="Playlists">
          {shown.map((p) => (
            <PlaylistCard key={p.id} playlist={p} />
          ))}
        </ul>
      </main>
    </div>
  );
}
