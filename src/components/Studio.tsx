import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

const SHORTCUTS: [string[], string][] = [
  [["Espaço"], "Toca ou pausa"],
  [["←", "→"], "Volta ou avança 5 s na prévia"],
  [["Shift", "←"], "Faixa anterior"],
  [["Shift", "→"], "Próxima faixa"],
  [["Esc"], "Mostra o editor de novo (no modo apresentar)"],
];

/** Atalhos num diálogo no mesmo estilo do de compartilhar, aberto pelo ícone de teclado do painel. */
function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => e.target === el && onClose();
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [onClose]);
  return (
    <dialog className="share keys-dlg" ref={ref} aria-labelledby="keys-title" onClose={onClose}>
      <div className="share-side keys-in">
        <div className="share-top">
          <h2 id="keys-title">Atalhos do player</h2>
          <button type="button" className="icon" aria-label="Fechar" onClick={onClose}>
            <Icon.x />
          </button>
        </div>
        <p>Valem com a capa aberta, fora de campos de texto.</p>
        <dl className="keys-list">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what}>
              <dt>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
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
  const [keysOpen, setKeysOpen] = useState(false);
  const closeKeys = useCallback(() => setKeysOpen(false), []);
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
            <button type="button" className="icon keys-btn" aria-label="Atalhos do teclado" title="Atalhos do teclado" onClick={() => setKeysOpen(true)}>
              <Icon.keyboard />
            </button>
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
        {player.queueKey === queueKey && player.status === "unavailable" && player.message && (
          <p className="sr" role="status">
            {player.message}
          </p>
        )}
        <Cover meta={meta} tracks={tracks} queueKey={queueKey} />
      </main>
      <ShortcutsDialog open={keysOpen} onClose={closeKeys} />
    </div>
  );
}
