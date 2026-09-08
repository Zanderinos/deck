import { useExtensions } from "../extensions/ExtensionProvider.js";
import { useDisplayMode } from "../chrome/DisplayMode.js";
import { useTerminalAppearance } from "../lib/useTerminalAppearance.js";
import { onTerminalAction } from "./actions.js";
import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";


export interface TerminalPaneProps {
  termId: string;
  active: boolean;
  focused?: boolean;
  onTitle: (title: string) => void;
}

// One xterm instance per pty, mounted once and kept alive across tab
// switches (hidden, not unmounted) so scrollback survives.
export function TerminalPane({ termId, active, focused = active, onTitle }: TerminalPaneProps) {
  const { theme } = useExtensions();
  const { mode, presentationSize } = useDisplayMode();
  const appearance = useTerminalAppearance();
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState("");
  const searchPosition = useRef(-1);
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon>();
  const termRef = useRef<Terminal>();

  useEffect(() => {
    const host = hostRef.current!;
    const term = new Terminal({
      theme: theme.terminal,
      ...appearance,
      macOptionIsMeta: true,
      scrollback: 10_000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    term.attachCustomKeyEventHandler((event) => !(event.metaKey && /^(?:[1-9]|[bdefjkpstw]|,)$/i.test(event.key)));

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL can be unavailable (e.g. GPU disabled); canvas fallback is fine.
    }
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let restored = false;
    let disposed = false;
    let live: { data: string; sequence: number }[] = [];
    const offData = window.deck.term.onData((id, data, sequence) => {
      if (id !== termId) return;
      if (restored) term.write(data); else live.push({ data, sequence });
    });
    const onInput = term.onData((data) => window.deck.term.input(termId, data));
    const onTitleChange = term.onTitleChange(onTitle);
    const onResize = term.onResize(({ cols, rows }) => window.deck.term.resize(termId, cols, rows));
    // One pty can be shown by two panes (a PR's agent panel and its terminal
    // tab). Only a visible pane may size the pty; a hidden one cannot measure
    // itself and would push a bogus size to the process.
    const claimSize = () => { if (host.clientWidth > 0) window.deck.term.resize(termId, term.cols, term.rows); };
    claimSize();
    void window.deck.term.attach(termId).then(({ buffer, sequence }) => {
      if (disposed) return;
      if (buffer) term.write(buffer);
      for (const chunk of live) if (chunk.sequence > sequence) term.write(chunk.data);
      live = []; restored = true;
    }).catch((error) => { if (!disposed) term.writeln(`\r\nCould not restore terminal: ${String(error)}`); });

    // Reclaim the pty on every reveal too: another pane may have resized it
    // meanwhile, and xterm only reports a resize when its own grid changed.
    const observer = new ResizeObserver(() => {
      if (host.clientWidth === 0) return;
      fit.fit();
      claimSize();
    });
    observer.observe(host);

    return () => {
      disposed = true;
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
      if (focused && !finding) termRef.current?.focus();
    }
  }, [active, focused, finding]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = mode === "presentation" ? presentationSize : appearance.fontSize;
    term.options.lineHeight = mode === "presentation" ? 1.25 : appearance.lineHeight;
    const frame = requestAnimationFrame(() => { if (active) fitRef.current?.fit(); });
    return () => cancelAnimationFrame(frame);
  }, [mode, presentationSize, active, appearance.fontSize, appearance.lineHeight]);

  useEffect(() => { if (termRef.current) termRef.current.options.theme = theme.terminal; }, [theme]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = appearance.fontFamily;
    term.options.fontWeight = appearance.fontWeight;
    term.options.fontWeightBold = appearance.fontWeightBold;
    term.options.cursorBlink = appearance.cursorBlink;
    term.options.cursorStyle = appearance.cursorStyle;
    if (active) fitRef.current?.fit();
  }, [appearance.fontFamily, appearance.fontWeight, appearance.fontWeightBold, appearance.cursorBlink, appearance.cursorStyle, active]);

  const find = (backwards = false) => {
    const term = termRef.current;
    if (!term || !query) return;
    const matches: { line: number; column: number }[] = [];
    for (let line = 0; line < term.buffer.active.length; line++) {
      const text = term.buffer.active.getLine(line)?.translateToString(true) ?? "";
      let column = text.toLowerCase().indexOf(query.toLowerCase());
      while (column >= 0) {
        matches.push({ line, column });
        column = text.toLowerCase().indexOf(query.toLowerCase(), column + Math.max(query.length, 1));
      }
    }
    if (!matches.length) { setMatch("No matches"); term.clearSelection(); return; }
    searchPosition.current = (searchPosition.current + (backwards ? -1 : 1) + matches.length) % matches.length;
    const found = matches[searchPosition.current];
    term.select(found.column, found.line, query.length);
    term.scrollToLine(Math.max(0, found.line - 2));
    setMatch(`${searchPosition.current + 1} / ${matches.length}`);
  };

  useEffect(() => onTerminalAction((action) => {
    if (!active || !focused) return;
    const term = termRef.current;
    if (!term) return;
    if (action === "find") setFinding((open) => !open);
    if (action === "clear") term.clear();
    if (action === "focus") term.focus();
    if (action === "export") {
      const lines = Array.from({ length: term.buffer.active.length }, (_, index) => term.buffer.active.getLine(index)?.translateToString(true) ?? "");
      const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
      const link = document.createElement("a"); link.href = url; link.download = `deck-terminal-${termId}.txt`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }), [active, focused, termId]);

  return <div className={`relative h-full w-full ${active ? "" : "hidden"}`}>
    {finding && <div className="absolute right-1 top-0 z-20 flex items-center gap-2 rounded-md border border-edge3 bg-overlay px-2 py-1.5 font-sans text-[11px] shadow-lg">
      <input aria-label="Find terminal output" autoFocus placeholder="Find in terminal…" value={query} onChange={(event) => { setQuery(event.target.value); searchPosition.current = -1; setMatch(""); }} onKeyDown={(event) => { if (event.key === "Enter") find(event.shiftKey); if (event.key === "Escape") { setFinding(false); termRef.current?.focus(); } }} className="w-40 bg-transparent text-soft outline-none" />
      <span className="text-dim">{match}</span><button title="Previous match" onClick={() => find(true)}>↑</button><button title="Next match" onClick={() => find()}>↓</button><button title="Close find" onClick={() => setFinding(false)}>×</button>
    </div>}
    <div ref={hostRef} className="h-full w-full" />
  </div>;
}
