import type { CSSProperties } from "react";
import { THEME_KEYS, type ThemeKey } from "../../server/types";
import { LAYOUT_KEYS, LAYOUTS, THEMES, type LayoutKey } from "../lib/design";
import { LayoutIcon } from "./icons";

export function VisualTab({
  theme,
  layout,
  onTheme,
  onLayout,
}: {
  theme: ThemeKey;
  layout: LayoutKey;
  onTheme: (t: ThemeKey) => void;
  onLayout: (l: LayoutKey) => void;
}) {
  return (
    <>
      <h2 id="models-h">Modelo</h2>
      <div className="opts models" role="group" aria-labelledby="models-h">
        {LAYOUT_KEYS.map((k) => (
          <button key={k} type="button" className="opt model" aria-pressed={layout === k} onClick={() => onLayout(k)}>
            <LayoutIcon layout={k} />
            <span>
              <b>{LAYOUTS[k].name}</b>
              <small>{LAYOUTS[k].hint}</small>
            </span>
          </button>
        ))}
      </div>
      <h2 id="swatches-h">Cor do selo</h2>
      <div className="swatches" role="group" aria-labelledby="swatches-h">
        {THEME_KEYS.map((k) => (
          <button key={k} type="button" className="swb" aria-pressed={theme === k} onClick={() => onTheme(k)}>
            <i className="sw" style={{ background: THEMES[k].paper, ["--l" as string]: THEMES[k].label } as CSSProperties} aria-hidden="true" />
            <span>{THEMES[k].name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
