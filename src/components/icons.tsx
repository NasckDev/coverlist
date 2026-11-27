/** Ícones do protótipo (decorativos: sempre com aria-hidden; o rótulo fica no botão). */
const common = { "aria-hidden": true, focusable: false } as const;

export const Icon = {
  panel: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...common}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M6 3v10" />
    </svg>
  ),
  share: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <path d="M8 10V2M5 4.5 8 1.5l3 3M3 8.5v4.25c0 .7.55 1.25 1.25 1.25h7.5c.7 0 1.25-.55 1.25-1.25V8.5" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" {...common}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" strokeLinecap="round" />
    </svg>
  ),
  up: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <path d="m4 10 4-4 4 4" />
    </svg>
  ),
  back: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <path d="M13 8H3.5M7.5 3.5 3 8l4.5 4.5" />
    </svg>
  ),
  play: () => (
    <svg viewBox="0 0 16 16" fill="currentColor" {...common}>
      <path d="M4.5 2.6v10.8c0 .6.65.97 1.17.66l8.6-5.4a.77.77 0 0 0 0-1.32l-8.6-5.4a.77.77 0 0 0-1.17.66Z" />
    </svg>
  ),
  pause: () => (
    <svg viewBox="0 0 16 16" fill="currentColor" {...common}>
      <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
    </svg>
  ),
  shuffle: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <path d="M2 4.5h2.3c1.4 0 2.3.7 3 2l1.4 3c.7 1.3 1.6 2 3 2H14M2 11.5h2.3c.9 0 1.6-.3 2.2-.9M9.5 5.4c.6-.6 1.3-.9 2.2-.9H14M12 2.5l2 2-2 2M12 9.5l2 2-2 2" />
    </svg>
  ),
  external: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3c0 .55-.45 1-1 1H3.5c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h3" />
    </svg>
  ),
  down: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  ),
  x: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...common}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  ),
  grip: () => (
    <svg viewBox="0 0 16 16" fill="currentColor" {...common}>
      <circle cx="6" cy="4" r="1.2" />
      <circle cx="10" cy="4" r="1.2" />
      <circle cx="6" cy="8" r="1.2" />
      <circle cx="10" cy="8" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="10" cy="12" r="1.2" />
    </svg>
  ),
  download: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <path d="M8 2v8M5 7.5l3 3 3-3M3 13.5h10" />
    </svg>
  ),
  volume: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...common}>
      <path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z" fill="currentColor" />
      <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" strokeLinecap="round" />
    </svg>
  ),
  mute: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...common}>
      <path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z" fill="currentColor" />
      <path d="m11 6 4 4M15 6l-4 4" strokeLinecap="round" />
    </svg>
  ),
  keyboard: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" {...common}>
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
      <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4.5 9.5h7" />
    </svg>
  ),
  sun: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...common}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
    </svg>
  ),
  moon: () => (
    <svg viewBox="0 0 16 16" fill="currentColor" {...common}>
      <path d="M13.5 10.2A5.8 5.8 0 0 1 5.8 2.5a5.8 5.8 0 1 0 7.7 7.7z" />
    </svg>
  ),
  auto: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...common}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </svg>
  ),
};

const LAYOUT_ART: Record<string, React.ReactNode> = {
  editorial: (
    <>
      <path d="M1.5 4a9 9 0 0 1 0 18z" fill="currentColor" />
      <path d="M19 8h15M19 13h10M19 18h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  deck: (
    <>
      <path d="M1.5 1.5h20l-5 23h-15z" fill="currentColor" opacity=".3" />
      <circle cx="20" cy="13" r="7.5" fill="currentColor" />
    </>
  ),
  poster: (
    <>
      <rect x="13" y="1.5" width="14" height="23" fill="currentColor" opacity=".3" />
      <path d="M14.5 24.5a5.5 5.5 0 0 1 11 0z" fill="currentColor" />
    </>
  ),
};

export function LayoutIcon({ layout }: { layout: string }) {
  return (
    <svg viewBox="0 0 40 26" {...common}>
      {LAYOUT_ART[layout]}
      <rect x=".75" y=".75" width="38.5" height="24.5" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
