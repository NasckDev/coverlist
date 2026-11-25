import { useEffect, useRef } from "react";
import { setSplashActive } from "./splashState";

export const SPLASH_SEEN_KEY = "coverlist:intro";
const AUTO_EXIT_MS = 2400;

/** A abertura roda só na primeira visita da sessão, nunca com movimento reduzido. */
export function shouldShowSplash(): boolean {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    if (sessionStorage.getItem(SPLASH_SEEN_KEY) === "1") return false;
    sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    /* sem sessionStorage a abertura roda e pronto */
  }
  return true;
}

/** Abertura do protótipo: vinil sobe girando, o nome entra letra a letra e o disco voa até a capa. */
export function Splash({ color, onDone }: { color: string; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const sp = root.current;
    if (!sp) return;
    const ease = "cubic-bezier(.65,0,.2,1)";
    const exit = () => {
      if (done.current) return;
      done.current = true;
      clearTimeout(timer);
      document.removeEventListener("keydown", exit);
      const disc = sp.querySelector<HTMLElement>(".splash-disc");
      const target = document.querySelector(".disc-wrap")?.getBoundingClientRect();
      const canAnimate = typeof sp.animate === "function";
      if (disc && canAnimate) {
        const T =
          target && target.width
            ? `translate(${target.left + target.width / 2 - innerWidth / 2}px, ${target.top + target.height / 2 - innerHeight / 2}px) scale(${target.width / disc.offsetWidth})`
            : "scale(.2)";
        disc.animate([{ transform: "none", opacity: 1 }, { transform: T, opacity: 1, offset: 0.82 }, { transform: T, opacity: 0 }], {
          duration: 1150,
          easing: ease,
          fill: "forwards",
        });
        sp.querySelectorAll<HTMLElement>(".splash-word span").forEach((s, i) =>
          s.animate([{ transform: "none" }, { transform: "translateY(-115%)" }], { duration: 520, delay: i * 40, easing: ease, fill: "forwards" }),
        );
        sp.querySelector<HTMLElement>(".splash-sub")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" });
        sp.querySelector<HTMLElement>(".splash-bg")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 750, delay: 220, easing: "ease", fill: "forwards" });
      }
      sp.style.pointerEvents = "none";
      setTimeout(() => setSplashActive(false), canAnimate ? 420 : 0);
      setTimeout(onDone, canAnimate ? 1180 : 0);
    };
    const timer = setTimeout(exit, AUTO_EXIT_MS);
    sp.addEventListener("click", exit);
    document.addEventListener("keydown", exit);
    return () => {
      clearTimeout(timer);
      sp.removeEventListener("click", exit);
      document.removeEventListener("keydown", exit);
    };
  }, [onDone]);

  return (
    <div className="splash" ref={root} style={{ ["--sbg" as string]: color }}>
      <div className="splash-bg" aria-hidden="true" />
      <div className="splash-disc" aria-hidden="true">
        <div className="disc">
          <div className="label" />
        </div>
        <div className="sheen" />
      </div>
      <p className="splash-word" aria-hidden="true">
        {[..."Coverlist"].map((c, i) => (
          <span key={i} style={{ ["--i" as string]: i }}>
            {c}
          </span>
        ))}
      </p>
      <p className="splash-sub" aria-hidden="true">
        Monte o preview da sua playlist
      </p>
      <button type="button" className="skip">
        Pular abertura
      </button>
    </div>
  );
}
