import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Track } from "../../server/types";
import { artBackground, fmt } from "../lib/design";
import { usePlayer } from "../player/PlayerProvider";
import { Icon } from "./icons";

interface Drag {
  from: number;
  over: number;
  pointerId: number;
}

/**
 * Lista editável: tocar, subir, descer, remover e reordenar arrastando (pointer events, funciona no toque)
 * ou pelo teclado (alça + setas ↑ ↓, Home e End). Cada movimento é anunciado para leitores de tela.
 */
export function EditableTrackList({
  tracks,
  queueKey,
  onMove,
  onRemove,
}: {
  tracks: Track[];
  queueKey: string;
  onMove: (from: number, to: number) => void;
  onRemove: (trackId: string) => void;
}) {
  const player = usePlayer();
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announce, setAnnounce] = useState("");
  const currentId = player.queueKey === queueKey && player.status !== "idle" ? player.current?.id : undefined;

  const move = (from: number, to: number, focusHandle: boolean) => {
    if (to < 0 || to >= tracks.length || from === to) return;
    onMove(from, to);
    setAnnounce(`${tracks[from].title} movida para a posição ${to + 1} de ${tracks.length}.`);
    if (focusHandle) requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>(".handle")[to]?.focus());
  };

  const indexAt = (clientY: number) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>(":scope > li[data-index]") ?? [];
    let idx = items.length - 1;
    for (const [i, li] of [...items].entries()) {
      const r = li.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    return Math.max(0, idx);
  };

  const onPointerDown = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ from: i, over: i, pointerId: e.pointerId });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const over = indexAt(e.clientY);
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { from, over } = drag;
    setDrag(null);
    move(from, over, false);
  };

  if (!tracks.length) {
    return (
      <ul className="list">
        <li className="empty">Nenhuma faixa. Use a busca acima para adicionar a primeira.</li>
      </ul>
    );
  }

  return (
    <>
      <ul className="list" ref={listRef} aria-label="Faixas da playlist" data-own-keys>
        {tracks.map((t, i) => {
          const dropClass = drag && drag.over === i && drag.from !== i ? (drag.over > drag.from ? " drop-after" : " drop-before") : "";
          return (
            <li key={t.id} data-index={i} className={`${t.id === currentId ? "on" : ""}${drag?.from === i ? " dragging" : ""}${dropClass}`}>
              <button
                type="button"
                className="icon handle"
                aria-label={`Reordenar ${t.title}, posição ${i + 1} de ${tracks.length}. Arraste ou use as setas para cima e para baixo.`}
                onPointerDown={onPointerDown(i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? tracks.length - 1 : null;
                  if (to === null) return;
                  e.preventDefault();
                  move(i, to, true);
                }}
              >
                <Icon.grip />
              </button>
              <button type="button" className="pick" onClick={() => player.play(i)} aria-label={`Tocar ${t.title}, de ${t.artist}`}>
                <span className="thumb" style={{ background: artBackground(t) }} />
                <span className="t-meta">
                  <b>{t.title}</b>
                  <i>
                    {t.artist}
                    {!t.preview && <span className="tag muted">sem prévia</span>}
                  </i>
                </span>
              </button>
              <span className="t-dur">{t.durationSec ? fmt(t.durationSec) : ""}</span>
              <button type="button" className="icon" aria-label={`Subir: ${t.title}`} disabled={i === 0} onClick={() => move(i, i - 1, false)}>
                <Icon.up />
              </button>
              <button type="button" className="icon" aria-label={`Descer: ${t.title}`} disabled={i === tracks.length - 1} onClick={() => move(i, i + 1, false)}>
                <Icon.down />
              </button>
              <button type="button" className="icon" aria-label={`Remover: ${t.title}`} onClick={() => onRemove(t.id)}>
                <Icon.x />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="sr" aria-live="assertive">
        {announce}
      </p>
    </>
  );
}

/** Lista de uma coleção (só leitura): tocar e ver o que não tem prévia. */
export function ReadonlyTrackList({ tracks, queueKey }: { tracks: Track[]; queueKey: string }) {
  const player = usePlayer();
  const currentId = player.queueKey === queueKey && player.status !== "idle" ? player.current?.id : undefined;
  return (
    <ul className="list" aria-label="Faixas da coleção">
      {tracks.map((t, i) => (
        <li key={t.id} className={t.id === currentId ? "on" : ""}>
          <button type="button" className="pick" onClick={() => player.play(i)} aria-label={`Tocar ${t.title}, de ${t.artist}`}>
            <span className="thumb" style={{ background: artBackground(t) }} />
            <span className="t-meta">
              <b>{t.title}</b>
              <i>
                {t.artist}
                {!t.preview && <span className="tag muted">sem prévia</span>}
              </i>
            </span>
          </button>
          <span className="t-dur" style={{ display: "block" }}>
            {t.durationSec ? fmt(t.durationSec) : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
