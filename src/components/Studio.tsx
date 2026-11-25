import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Track } from "../../server/types";
import { usePlayer } from "../player/PlayerProvider";
import { Cover, type CoverMeta } from "./Cover";
import { Icon } from "./icons";
import { Tabs, type TabDef } from "./Seg";

export interface StudioTab extends TabDef {
  content: ReactNode;
}

/** Alvos onde as setas e o espaço têm significado próprio: os atalhos globais não interferem. */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("[data-own-keys], [role='tablist'], dialog")) return true;
  return /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target.tagName);
}

/** Atalhos do player: espaço toca/pausa, ← → avançam 5 s, Shift + ← → trocam de faixa. */
function usePlayerShortcuts(enabled: boolean) {
  const player = usePlayer();
  const ref = useRef(player);
  ref.current = player;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const typing = ownsKeys(e.target);
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        ref.current.toggle();
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !typing) {
        e.preventDefault();
        const forward = e.key === "ArrowRight";
        if (e.shiftKey) (forward ? ref.current.next : ref.current.prev)();
        else ref.current.seekBy(forward ? 5 : -5);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}

function Volume() {
  const player = usePlayer();
  const muted = player.muted || player.volume === 0;
  return (
    <div className="vol">
      <button type="button" onClick={player.toggleMute} aria-label={muted ? "Ativar som" : "Silenciar"} aria-pressed={muted}>
        {muted ? <Icon.mute /> : <Icon.volume />}
      </button>
      <label className="sr" htmlFor="volume">
        Volume
      </label>
      <input id="volume" type="range" min={0} max={100} value={Math.round((player.muted ? 0 : player.volume) * 100)} onChange={(e) => player.setVolume(Number(e.target.value) / 100)} />
    </div>
  );
}

export function Studio({
  panelLabel,
  header,
  tabs,
  foot,
  meta,
  tracks,
  queueKey,
  initialTab,
}: {
  panelLabel: string;
  header: ReactNode;
  tabs: StudioTab[];
  foot: ReactNode;
  meta: CoverMeta;
  tracks: Track[];
  queueKey: string;
  initialTab?: string;
}) {
  const [present, setPresent] = useState(false);
  const [tab, setTab] = useState(initialTab ?? tabs[0]?.id ?? "");
  const player = usePlayer();
  const { stop } = player;
  usePlayerShortcuts(true);

  // Ao sair da capa, a prévia para: a fila pertence a esta tela.
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!present) return;
    const mq = matchMedia("(max-width:900px)");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPresent(false);
    const onMq = (e: MediaQueryListEvent) => e.matches && setPresent(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [present]);

  return (
    <div className={`app${present ? " present" : ""}`}>
      <aside className="panel" aria-label={panelLabel}>
        <div className="panel-in" inert={present}>
          <p className="brand">
            <a href="#/" className="brand-link">
              <i aria-hidden="true" />
              Coverlist
            </a>
            <button type="button" className="icon present-btn" aria-label="Ocultar editor" title="Ocultar editor" onClick={() => setPresent(true)}>
              <Icon.panel />
            </button>
          </p>
          {header}
          {tabs.length > 1 && <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix={queueKey.replace(/[^a-z0-9]/gi, "")} />}
          {tabs.map((t) => (
            <section
              key={t.id}
              className="tabpanel"
              role={tabs.length > 1 ? "tabpanel" : undefined}
              id={`${queueKey.replace(/[^a-z0-9]/gi, "")}-panel-${t.id}`}
              aria-labelledby={tabs.length > 1 ? `${queueKey.replace(/[^a-z0-9]/gi, "")}-tab-${t.id}` : undefined}
              hidden={t.id !== tab}
            >
              {t.content}
            </section>
          ))}
          <div className="panel-foot">{foot}</div>
        </div>
      </aside>

      <main className="stage" id="conteudo">
        <button type="button" className="ghost float" onClick={() => setPresent(false)}>
          <Icon.panel />
          Mostrar editor
        </button>
        <div className="bar">
          <p className="keys">
            <kbd>Espaço</kbd> toca ou pausa · <kbd>←</kbd> <kbd>→</kbd> 5 s · <kbd>Shift</kbd> + <kbd>←</kbd> <kbd>→</kbd> troca a faixa
          </p>
          <Volume />
        </div>
        {player.queueKey === queueKey && player.status === "unavailable" && player.message && (
          <p className="sr" role="status">
            {player.message}
          </p>
        )}
        <Cover meta={meta} tracks={tracks} queueKey={queueKey} />
      </main>
    </div>
  );
}
