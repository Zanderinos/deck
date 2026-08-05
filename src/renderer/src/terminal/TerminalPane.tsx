import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

const theme = {
  background: "#0c0d10",
  foreground: "#e6e6e9",
  cursor: "#7aa2f7",
  selectionBackground: "#33467c",
  black: "#15151a",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#c0caf5",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#e6e6e9",
};

export interface TerminalPaneProps {
  termId: string;
  active: boolean;
  onTitle: (title: string) => void;
}

// One xterm instance per pty, mounted once and kept alive across tab
// switches (hidden, not unmounted) so scrollback survives.
export function TerminalPane({ termId, active, onTitle }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon>();
  const termRef = useRef<Terminal>();

  useEffect(() => {
    const host = hostRef.current!;
    const term = new Terminal({
      theme,
      fontFamily: "ui-monospace, Menlo, monospace",
      fontSize: 13,
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 10_000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL can be unavailable (e.g. GPU disabled); canvas fallback is fine.
    }
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const offData = window.deck.term.onData((id, data) => {
      if (id === termId) term.write(data);
    });
    const onInput = term.onData((data) => window.deck.term.input(termId, data));
    const onTitleChange = term.onTitleChange(onTitle);
    const onResize = term.onResize(({ cols, rows }) => window.deck.term.resize(termId, cols, rows));
    window.deck.term.resize(termId, term.cols, term.rows);

    const observer = new ResizeObserver(() => {
      if (host.clientWidth > 0) fit.fit();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      offData();
      onInput.dispose();
      onTitleChange.dispose();
      onResize.dispose();
      term.dispose();
    };
  }, [termId]);

  useEffect(() => {
    if (active) {
      fitRef.current?.fit();
      termRef.current?.focus();
    }
  }, [active]);

  return <div ref={hostRef} className={`h-full w-full ${active ? "" : "hidden"}`} />;
}
