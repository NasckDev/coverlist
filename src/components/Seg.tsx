import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Pílula deslizante do protótipo: posiciona o fundo sob o botão ativo. */
export function useSegPill<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const seg = ref.current;
    if (!seg) return;
    const move = () => {
      const active = seg.querySelector<HTMLElement>('[aria-pressed="true"],[aria-selected="true"],[aria-current="page"]');
      if (!active) return;
      seg.style.setProperty("--x", `${active.offsetLeft}px`);
      seg.style.setProperty("--w", `${active.offsetWidth}px`);
    };
    move();
    const ro = new ResizeObserver(move);
    ro.observe(seg);
    void document.fonts?.ready.then(move);
    return () => ro.disconnect();
  }, [dep]);
  return ref;
}

export interface TabDef {
  id: string;
  label: ReactNode;
}

/** Abas com teclado (setas, Home, End), seguindo o padrão WAI-ARIA de tablist. */
export function Tabs({ tabs, active, onChange, idPrefix }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; idPrefix: string }) {
  const ref = useSegPill<HTMLDivElement>(active);
  const focusTab = (index: number) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    onChange(next.id);
    ref.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${next.id}`)?.focus();
  };
  return (
    <div className="seg tabs" role="tablist" aria-label="Seções do editor" ref={ref}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") focusTab(i + 1);
            else if (e.key === "ArrowLeft") focusTab(i - 1);
            else if (e.key === "Home") focusTab(0);
            else if (e.key === "End") focusTab(tabs.length - 1);
            else return;
            e.preventDefault();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
