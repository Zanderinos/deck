import type { DeckApi } from "./index.js";

declare global {
  interface Window {
    deck: DeckApi;
  }
}

export {};
