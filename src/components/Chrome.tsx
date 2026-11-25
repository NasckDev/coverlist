import { onlineManager } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { ThemeKey, Track } from "../../server/types";
import { artBackground, themeVars } from "../lib/design";
import { href } from "../lib/router";
import { Icon } from "./icons";
import { useSegPill } from "./Seg";

/* ---------------------------------------------------------------- tema */
type Mode = "auto" | "light" | "dark";
const MODE_KEY = "coverlist:theme";
const MODES: Mode[] = ["auto", "light", "dark"];
const MODE_LABEL: Record<Mode, string> = { auto: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" };

function readMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyStoredTheme() {
  const mode = readMode();
  if (mode === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = mode;
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(readMode);
  useEffect(() => {
    if (mode === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* preferência só desta visita */
    }
  }, [mode]);
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  return (
    <button type="button" className="theme-btn" onClick={() => setMode(next)} aria-label={`${MODE_LABEL[mode]}. Mudar para ${MODE_LABEL[next].slice(6)}`} title={MODE_LABEL[mode]}>
      {mode === "auto" ? <Icon.auto /> : mode === "light" ? <Icon.sun /> : <Icon.moon />}
    </button>
  );
}

/* ---------------------------------------------------------------- topo */
export function Topbar({ current }: { current: "explore" | "library" }) {
  const nav = useSegPill<HTMLElement>(current);
  return (
    <header className="topbar">
      <p className="brand">
        <a href={href.explore()}>
          <i aria-hidden="true" />
          Coverlist
        </a>
      </p>
      <nav className="seg nav" aria-label="Seções" ref={nav}>
        <a href={href.explore()} aria-current={current === "explore" ? "page" : undefined}>
          Explorar
        </a>
        <a href={href.library()} aria-current={current === "library" ? "page" : undefined}>
          Minhas playlists
        </a>
      </nav>
      <ThemeToggle />
    </header>
  );
}

/* ---------------------------------------------------------------- conexão */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

export function OfflineBanner({ note }: { note?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <p className="banner warn" role="status">
      <b>Sem conexão.</b> {note ?? "Mostrando o que já estava salvo neste navegador. Prévias de áudio precisam de internet."}
    </p>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state err" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="solid" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- capa gerada */
export function MiniCover({ title, theme, track, tag }: { title: string; theme: ThemeKey; track?: Track | null; tag?: string }) {
  return (
    <div className="mini" style={themeVars(theme) as CSSProperties} aria-hidden="true">
      <h3>{title}</h3>
      <div className="mdisc">
        <div className="mlabel" style={{ background: artBackground(track ?? null, "medium") }} />
      </div>
      {tag && <span className="mtag">{tag}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- avisos com desfazer */
interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}
type ToastFn = (message: string, action?: Toast["action"], durationMs?: number) => void;
const ToastContext = createContext<ToastFn>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback<ToastFn>(
    (message, action, durationMs = 8000) => {
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-2), { id, message, action }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <p>{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------------------------------------------------------- pular para o conteúdo */
/** Com rotas por hash, um link "#conteudo" trocaria de rota: o foco é movido à mão. */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#conteudo"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("conteudo")?.focus();
      }}
    >
      Pular para o conteúdo
    </a>
  );
}
