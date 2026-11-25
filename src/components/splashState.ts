/** Coordena a abertura com a capa: enquanto ela roda, a capa espera ("pre") e entra quando a abertura sai. */
let active = false;
const listeners = new Set<() => void>();

export const isSplashActive = () => active;

export function setSplashActive(value: boolean) {
  active = value;
  if (value) return;
  const pending = [...listeners];
  listeners.clear();
  for (const fn of pending) fn();
}

export function onSplashExit(fn: () => void): () => void {
  if (!active) {
    fn();
    return () => undefined;
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}
