import { useEffect, useId, useRef, useState } from "react";
import type { Track } from "../../server/types";
import { failureMessage, useSearch } from "../lib/api";
import { artBackground, fmt } from "../lib/design";
import { Icon } from "./icons";

const DEBOUNCE_MS = 300;
const SOURCE_NAME = { deezer: "Deezer", itunes: "iTunes" } as const;

/** Busca unificada (Deezer + iTunes pelo proxy), com debounce, estados e faixas já adicionadas marcadas. */
export function TrackSearch({ have, onAdd }: { have: ReadonlySet<string>; onAdd: (t: Track) => void }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const search = useSearch(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const q = debounced.trim();
  const tracks = search.data?.tracks ?? [];
  const sources = search.data?.sources;
  const partial = sources && (sources.deezer === "error" || sources.itunes === "error");
  let note = "";
  if (term.trim().length === 1) note = "Digite pelo menos 2 letras.";
  else if (q.length >= 2 && search.isError) note = failureMessage(search.error);
  else if (q.length >= 2 && search.isFetching && !search.data) note = "Buscando no Deezer e no iTunes…";
  else if (q.length >= 2 && search.data && !tracks.length) note = `Nada encontrado para “${q}”.`;
  else if (partial) note = `${sources?.deezer === "error" ? "O Deezer" : "O iTunes"} não respondeu; mostrando só o que a outra fonte trouxe.`;
  else if (tracks.length) note = "Resultados do Deezer e do iTunes, sem duplicatas.";

  const add = (t: Track) => {
    onAdd(t);
    setTerm("");
    setDebounced("");
    setOpen(false);
    input.current?.focus();
  };

  return (
    <div ref={box}>
      <div className="search">
        <Icon.search />
        <label className="sr" htmlFor={`${listId}-q`}>
          Buscar música ou artista
        </label>
        <input
          ref={input}
          id={`${listId}-q`}
          type="search"
          placeholder="Buscar música ou artista"
          autoComplete="off"
          value={term}
          aria-controls={listId}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTerm("");
              setOpen(false);
            }
          }}
        />
      </div>
      <ul className="results" id={listId} aria-label="Resultados da busca">
        {open &&
          q.length >= 2 &&
          tracks.map((t) => {
            const already = have.has(t.id);
            return (
              <li key={t.id}>
                <button type="button" disabled={already} onClick={() => add(t)} aria-label={`Adicionar ${t.title}, de ${t.artist}${already ? " (já está na playlist)" : ""}`}>
                  <span className="thumb" style={{ background: artBackground(t) }} />
                  <span className="t-meta">
                    <b>{t.title}</b>
                    <i>
                      <span>{t.artist}</span>
                      {!t.preview && <span className="tag muted">sem prévia</span>}
                      {already && <span className="tag muted">na playlist</span>}
                    </i>
                  </span>
                  <span className="src">
                    {SOURCE_NAME[t.source]}
                    {t.durationSec ? ` · ${fmt(t.durationSec)}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
      <p className="note" aria-live="polite">
        {note}
      </p>
    </div>
  );
}
