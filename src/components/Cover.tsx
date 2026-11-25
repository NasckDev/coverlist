import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ThemeKey, Track } from "../../server/types";
import { artBackground, fmt, summaryLine, themeVars, type LayoutKey } from "../lib/design";
import { NO_PREVIEW_MESSAGE, usePlayer } from "../player/PlayerProvider";
import { Icon } from "./icons";
import { isSplashActive, onSplashExit } from "./splashState";

export interface CoverMeta {
  name: string;
  description: string;
  by: string;
  theme: ThemeKey;
  layout: LayoutKey;
}

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const PlayIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" />
  </svg>
);

/**
 * A capa viva do protótipo: vinil, selo, título ajustado, faixas e controles.
 * O progresso (arco, braço, tempo) é pintado direto no DOM a cada quadro, sem re-render.
 */
export function Cover({ meta, tracks, queueKey }: { meta: CoverMeta; tracks: Track[]; queueKey: string }) {
  const player = usePlayer();
  const { setQueue } = player;
  const active = player.queueKey === queueKey;
  const index = active ? player.index : 0;
  const current = tracks[index] ?? null;
  const playing = active && player.isPlaying;

  useEffect(() => setQueue(queueKey, tracks), [setQueue, queueKey, tracks]);

  const innerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tracksRef = useRef<HTMLOListElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);
  const progRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const armRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const durRef = useRef<HTMLSpanElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LayoutKey>(meta.layout);
  const [overflow, setOverflow] = useState(false);
  const [introClass, setIntroClass] = useState(() => (isSplashActive() ? "pre" : "intro"));

  const name = meta.name.trim() || "Sem nome";

  // Abertura: entra sozinha ou espera a animação de abertura terminar.
  useEffect(() => {
    if (introClass === "pre") {
      return onSplashExit(() => {
        setIntroClass("intro from-splash");
        setTimeout(() => setIntroClass(""), 2200);
      });
    }
    if (introClass === "intro") {
      const timer = setTimeout(() => setIntroClass(""), 1700);
      return () => clearTimeout(timer);
    }
  }, [introClass]);

  const checkOverflow = useCallback(() => {
    const el = tracksRef.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 4);
  }, []);

  // Encolhe o título até caber na largura e no número de linhas do modelo atual.
  const fit = useCallback(() => {
    const inner = innerRef.current;
    const title = titleRef.current;
    if (!inner || !title) return;
    let f = 1;
    inner.style.setProperty("--fit", "1");
    const cs = getComputedStyle(inner);
    const max = parseFloat(cs.getPropertyValue("--lines")) || 3;
    const lh = parseFloat(cs.getPropertyValue("--lh")) || 0.9;
    for (let i = 0; i < 18; i++) {
      const px = parseFloat(getComputedStyle(title).fontSize) * lh;
      if (!px) break;
      const lines = Math.round(title.offsetHeight / px);
      if (title.scrollWidth <= title.clientWidth + 1 && lines <= max) break;
      f *= 0.92;
      inner.style.setProperty("--fit", f.toFixed(3));
    }
    checkOverflow();
  }, [checkOverflow]);

  useLayoutEffect(() => {
    fit();
  }, [fit, name, layout, tracks.length]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(fit, 70);
    });
    ro.observe(inner.parentElement ?? inner);
    void document.fonts?.ready.then(fit);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [fit]);

  // Troca de modelo com FLIP: mede antes, troca o atributo, anima a diferença.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner || meta.layout === layout) return;
    const movers = [headRef.current, tracksRef.current, nowRef.current].filter((e): e is HTMLElement => !!e);
    const first = movers.map((e) => e.getBoundingClientRect());
    inner.classList.remove("intro");
    inner.classList.add("switching");
    inner.dataset.layout = meta.layout;
    fit();
    if (!reduceMotion()) {
      movers.forEach((e, i) => {
        const f = first[i];
        const l = e.getBoundingClientRect();
        if (!l.width || !f.width || typeof e.animate !== "function") return;
        const s = Math.max(0.45, Math.min(2.2, f.width / l.width));
        e.animate(
          [
            { transformOrigin: "0 0", transform: `translate(${f.left - l.left}px, ${f.top - l.top}px) scale(${s})`, opacity: 0.35 },
            { transformOrigin: "0 0", transform: "none", opacity: 1 },
          ],
          { duration: 850, easing: "cubic-bezier(.65,0,.2,1)", delay: i * 45, fill: "backwards" },
        );
      });
    }
    setLayout(meta.layout);
    const timer = setTimeout(() => inner.classList.remove("switching"), 1100);
    return () => clearTimeout(timer);
  }, [meta.layout, layout, fit]);

  // Progresso pintado a cada quadro enquanto toca.
  const paint = useCallback(
    (force: boolean) => {
      const audio = player.audio;
      const live = active && audio && audio.getAttribute("src") && current?.preview;
      const pos = live ? audio.currentTime : 0;
      const d = live && Number.isFinite(audio.duration) ? audio.duration : 0;
      const p = d ? Math.min(1, pos / d) : 0;
      progRef.current?.style.setProperty("stroke-dashoffset", String(100 - p * 100));
      const a = ((-90 + 180 * p) * Math.PI) / 180;
      dotRef.current?.setAttribute("cx", String(50 + 48 * Math.cos(a)));
      dotRef.current?.setAttribute("cy", String(50 + 48 * Math.sin(a)));
      if (curRef.current) curRef.current.textContent = fmt(pos);
      if (durRef.current) durRef.current.textContent = d ? fmt(d) : "0:30";
      if (seekRef.current && (force || document.activeElement !== seekRef.current)) seekRef.current.value = String(Math.round(p * 1000));
      armRef.current?.style.setProperty("--arm", `${!playing ? -9.1 : +(2.9 + 18 * p).toFixed(1)}deg`);
    },
    [player.audio, active, current, playing],
  );

  useEffect(() => {
    paint(true);
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      paint(false);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paint, playing]);

  // Faixa nova: o selo pulsa e a lista rola até ela.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!reduceMotion() && typeof labelRef.current?.animate === "function") {
      labelRef.current.animate([{ scale: 0.8, opacity: 0.4 }, { scale: 1, opacity: 1 }], { duration: 500, easing: "cubic-bezier(.2,.9,.3,1.2)" });
    }
    const list = tracksRef.current;
    const row = list?.querySelector<HTMLElement>("[aria-current='true']")?.parentElement;
    if (list && row && list.scrollHeight > list.clientHeight && typeof list.scrollTo === "function") {
      list.scrollTo({ top: row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2, behavior: reduceMotion() ? "auto" : "smooth" });
    }
  }, [index]);

  let ring = "";
  while (ring.length < 46) ring += `${name} ● `;
  const rep = `${name} ● `.repeat(Math.max(2, Math.ceil(44 / (name.length + 3))));
  const noPreview = active && (player.status === "unavailable" || player.status === "error");
  const by = meta.by.trim();
  const muted = player.muted || player.volume === 0;

  return (
    <div className="canvas" style={themeVars(meta.theme) as CSSProperties}>
      <div ref={innerRef} className={`inner ${introClass} ${playing ? "playing" : ""}`} data-layout={layout}>
        <div className="bg-ink" />
        <div className="marquee" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`mq${i === 1 ? " rev" : ""}`}>
              <span>{rep}</span>
              <span>{rep}</span>
            </div>
          ))}
        </div>
        <div className="bg-label" />

        <div className="disc-wrap" aria-hidden="true">
          <div className="platter" />
          <div className="disc">
            <div className="label" ref={labelRef} style={{ background: artBackground(current, "large") }}>
              <svg viewBox="0 0 100 100">
                <defs>
                  <path id={`ring-${queueKey}`} d="M50,50 m-35,0 a35,35 0 1,1 70,0 a35,35 0 1,1 -70,0" />
                </defs>
                <circle cx="50" cy="50" r="50" fill="none" stroke="rgba(0,0,0,.38)" strokeWidth="44" />
                <text>
                  <textPath href={`#ring-${queueKey}`} textLength="216" lengthAdjust="spacing">
                    {ring.slice(0, 56)}
                  </textPath>
                </text>
                <circle className="hole" cx="50" cy="50" r="5.5" />
              </svg>
            </div>
          </div>
          <div className="sheen" />
          <svg className="arc" viewBox="0 0 100 100">
            <path className="rail" d="M50 2 A48 48 0 0 1 50 98" pathLength={100} />
            <path className="prog" ref={progRef} d="M50 2 A48 48 0 0 1 50 98" pathLength={100} />
            <circle ref={dotRef} cx="50" cy="2" r="1.6" />
          </svg>
          <div className="arm" ref={armRef} />
          <div className="pivot" />
        </div>

        <header className="head" ref={headRef}>
          {by && <p className="kicker">Playlist de {by}</p>}
          <h1 className="title" ref={titleRef}>
            {name}
          </h1>
          {meta.description.trim() && <p className="desc">{meta.description.trim()}</p>}
          <p className="sum">{summaryLine(tracks)}</p>
        </header>

        <ol className={`tracks${overflow ? " over" : ""}`} ref={tracksRef} aria-label="Faixas da playlist">
          {tracks.length === 0 && <li className="nothing">Sem faixas ainda. Busque uma música no editor para começar.</li>}
          {tracks.map((t, i) => {
            const on = i === index && active && player.status !== "idle";
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className="row"
                  aria-current={on ? "true" : undefined}
                  aria-label={`Tocar ${t.title}, de ${t.artist}${t.preview ? "" : " (sem prévia)"}`}
                  onClick={() => player.play(i)}
                >
                  <span className="n" aria-hidden="true">
                    {on ? (
                      <>
                        <s />
                        <s />
                        <s />
                      </>
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="cover" style={{ background: artBackground(t, "small") }} />
                  <span className="m">
                    <b>{t.title}</b>
                    <i>
                      {t.artist}
                      {!t.preview && <span className="np"> · sem prévia</span>}
                    </i>
                  </span>
                  <span className="d">{t.durationSec ? fmt(t.durationSec) : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="now" ref={nowRef}>
          <div className="ctrl">
            <button type="button" aria-label="Faixa anterior" onClick={player.prev} disabled={!tracks.length}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M3 2h2v12H3zM14 2v12L6 8z" />
              </svg>
            </button>
            <button type="button" className="play" aria-label={playing ? "Pausar" : "Tocar"} onClick={player.toggle} disabled={!tracks.length}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" aria-label="Próxima faixa" onClick={player.next} disabled={!tracks.length}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M11 2h2v12h-2zM2 2v12l8-6z" />
              </svg>
            </button>
            <button type="button" className="mute" aria-label={muted ? "Ativar som" : "Silenciar"} aria-pressed={muted} onClick={player.toggleMute}>
              {muted ? <Icon.mute /> : <Icon.volume />}
            </button>
          </div>
          <div className="now-text swap" key={current?.id ?? "none"} aria-live="polite">
            <b>{current ? current.title : "Nada tocando"}</b>
            <i>
              {noPreview ? (player.message ?? NO_PREVIEW_MESSAGE) : current ? current.artist : ""}
              {active && player.status === "loading" && " · carregando prévia…"}
            </i>
          </div>
          <div className="seek">
            <span className="pv" title="As fontes públicas liberam um trecho de 30 s de cada faixa">
              Prévia
            </span>
            <span ref={curRef}>0:00</span>
            <label className="sr" htmlFor={`seek-${queueKey}`}>
              Posição na prévia
            </label>
            <input
              id={`seek-${queueKey}`}
              ref={seekRef}
              type="range"
              min={0}
              max={1000}
              defaultValue={0}
              disabled={!playing && !(active && player.status === "paused" && player.audio?.getAttribute("src"))}
              onInput={(e) => {
                const audio = player.audio;
                if (audio && Number.isFinite(audio.duration)) player.seek((Number(e.currentTarget.value) / 1000) * audio.duration);
                paint(true);
              }}
            />
            <span ref={durRef}>0:30</span>
            <label className="sr" htmlFor={`vol-${queueKey}`}>
              Volume
            </label>
            <input
              id={`vol-${queueKey}`}
              className="vol-range"
              type="range"
              min={0}
              max={100}
              value={Math.round((player.muted ? 0 : player.volume) * 100)}
              onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
