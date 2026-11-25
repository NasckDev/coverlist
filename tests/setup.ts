import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// O jsdom não implementa mídia: o player só precisa que pause/load/play existam.
if (typeof HTMLMediaElement !== "undefined") {
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value() {} });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value() {} });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
}
