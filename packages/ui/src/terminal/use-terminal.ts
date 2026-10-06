import type { TerminalSize } from "@agnostic/core";
import { DEFAULT_TERMINAL_SIZE } from "@agnostic/core/browser";
import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import { useMemo } from "react";
import { MONO_STACK } from "./terminal-theme";

// tmux holds the session's whole history; this is what one tab can scroll back through (ADR 025).
const SCROLLBACK_LINES = 5000;

/** What the page's theme and its terminal settings say the pane should be drawn with. */
export type TerminalStyle = { theme: ITheme; fontFamily: string; fontSize: number };

export type TerminalHandle = {
  attach(el: HTMLElement): void;
  /** Takes the page's current style; before the first attach it is what the terminal is built with. */
  restyle(style: TerminalStyle): void;
  /** Null while the pane has no usable size; the socket waits for a real one (ADR 025). */
  fit(): TerminalSize | null;
  focus(): void;
  write(bytes: Uint8Array): void;
  onInput(cb: (bytes: Uint8Array) => void): () => void;
  dispose(): void;
};

/** One terminal for the life of a tab: it keeps its buffer while the tab is hidden. */
export function useTerminal(): TerminalHandle {
  return useMemo(createTerminalHandle, []);
}

function createTerminalHandle(): TerminalHandle {
  const listeners = new Set<(bytes: Uint8Array) => void>();
  const encoder = new TextEncoder();
  let terminal: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  // Set before the first attach by the pane, and again on every theme or font change after it.
  let style: TerminalStyle | null = null;

  const emit = (bytes: Uint8Array) => {
    for (const listener of listeners) {
      listener(bytes);
    }
  };

  // Created on the first attach and again after a dispose, so the listeners outlive the terminal
  // and a remount (React's strict mode does one) types into the socket the tab already holds.
  const create = (element: HTMLElement) => {
    const term = new Terminal({
      scrollback: SCROLLBACK_LINES,
      cursorBlink: true,
      fontSize: style?.fontSize ?? DEFAULT_TERMINAL_SIZE,
      fontFamily: style?.fontFamily ?? MONO_STACK,
      theme: style?.theme,
      allowProposedApi: false,
      // tmux runs with `mouse on` and takes every drag, so Option+drag is what is left for
      // selecting text. xterm.js ignores that modifier on macOS unless this option is set.
      macOptionClickForcesSelection: true,
    });
    const addon = new FitAddon();
    term.loadAddon(addon);
    term.onData((text) => emit(encoder.encode(text)));
    term.onBinary((text) => emit(latin1(text)));
    term.open(element);
    terminal = term;
    fitAddon = addon;
  };

  return {
    attach: (element) => {
      if (terminal === null) {
        create(element);
      }
    },
    restyle: (next) => {
      style = next;
      if (terminal === null) {
        return;
      }
      terminal.options.theme = next.theme;
      terminal.options.fontFamily = next.fontFamily;
      terminal.options.fontSize = next.fontSize;
    },
    fit: () => (terminal === null || fitAddon === null ? null : fitTo(terminal, fitAddon)),
    focus: () => terminal?.focus(),
    write: (bytes) => terminal?.write(bytes),
    onInput: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    dispose: () => {
      terminal?.dispose();
      terminal = null;
      fitAddon = null;
    },
  };
}

/** A pane that is hidden or not laid out yet proposes nothing, and a 0x0 resize is a refused frame. */
function fitTo(terminal: Terminal, fitAddon: FitAddon): TerminalSize | null {
  const proposed = fitAddon.proposeDimensions();
  if (proposed === undefined || !usable(proposed.cols) || !usable(proposed.rows)) {
    return null;
  }
  fitAddon.fit();
  return { cols: terminal.cols, rows: terminal.rows };
}

function usable(value: number): boolean {
  return Number.isFinite(value) && value >= 1;
}

/** `onBinary` hands over bytes already, one per code unit, which is how they go on the wire. */
function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}
