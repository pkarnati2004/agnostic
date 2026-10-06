import type { TaskListRow, TerminalSize } from "@agnostic/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import type { TaskNotice } from "../store/task-notices";
import { type OverlayPhase, SessionOverlay } from "./session-overlay";
import { type SessionTarget, sessionTarget } from "./terminal-phase";
import { type SessionPhase, startSession, type TerminalSession } from "./terminal-session";
import { xtermFont, xtermTheme } from "./terminal-theme";
import { type TerminalHandle, type TerminalStyle, useTerminal } from "./use-terminal";
import { watchRootStyle } from "./watch-root-style";

// Long enough that a drag of the window sends one resize frame and not thirty. A fit is not only
// `fitAddon.fit()`: it sends the size to the daemon, which resizes the PTY and makes the harness
// redraw its whole TUI, so a pane drag waits for the pointer to pause rather than fitting a frame.
const FIT_DEBOUNCE_MS = 100;

type TerminalViewProps = {
  task: TaskListRow;
  token: string;
  /** A hidden tab keeps its terminal, its buffer and its socket; only the element is hidden. */
  active: boolean;
  client: WorkspaceClient;
  /** What the last resume of this task said, null when it had nothing to say. */
  resumeNotice: string | null;
  /** This task's latest failure; named apart from the close notice the socket sets below. */
  failure: TaskNotice | null;
  onResume: () => Promise<void>;
  /** The overlay's Hand off, which opens the dialog the task header owns. */
  onHandoff: () => void;
};

/** One tab's pane: the terminal, the socket behind it, and what to say when there is none. */
export function TerminalView(props: TerminalViewProps) {
  const { task, token, active, client } = props;
  const terminal = useTerminal();
  const sizeRef = useRef<TerminalSize | null>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const [sized, setSized] = useState(false);
  const [phase, setPhase] = useState<SessionPhase>("connecting");
  const [closeNotice, setCloseNotice] = useState<string | null>(null);
  const target = sessionTarget(task);

  const measure = useCallback(() => {
    const size = terminal.fit();
    if (size === null) {
      return;
    }
    sizeRef.current = size;
    sessionRef.current?.resize(size);
    setSized(true);
  }, [terminal]);

  const paneRef = usePane(terminal, measure);

  useEffect(() => {
    const size = sizeRef.current;
    if (target !== "attach" || !sized || size === null) {
      return;
    }
    setCloseNotice(null);
    const session = startSession({
      taskId: task.id,
      token,
      size,
      readStatus: (id) => client.getTask(id).then(({ task: row }) => row.status, noAnswer),
      events: { onPhase: setPhase, onNotice: setCloseNotice, onData: terminal.write },
    });
    sessionRef.current = session;
    const stopInput = terminal.onInput(session.write);
    return () => {
      stopInput();
      session.stop();
      sessionRef.current = null;
    };
  }, [target, sized, task.id, token, client, terminal]);

  useEffect(() => {
    if (!active) {
      return;
    }
    measure();
    if (phase === "live" && target === "attach") {
      terminal.focus();
    }
  }, [active, phase, target, measure, terminal]);

  const overlay = overlayPhase(target, phase);
  // The resume's own line stands until the socket's next close has something of its own to say.
  const notice = closeNotice ?? props.resumeNotice;
  return (
    <div
      ref={paneRef}
      hidden={!active}
      className="relative min-h-0 flex-1 overflow-hidden p-2 pb-4"
    >
      {overlay !== null && <SessionOverlay {...overlayProps(props, overlay, notice)} />}
    </div>
  );
}

/** All the overlay needs but the two things only the pane knows: where the session got to. */
function overlayProps(props: TerminalViewProps, phase: OverlayPhase, notice: string | null) {
  const { task, failure, onResume, onHandoff } = props;
  return { phase, task, notice, failure, onResume, onHandoff };
}

/** The element the terminal lives in, fitted on every layout change while the tab is mounted. */
function usePane(terminal: TerminalHandle, measure: () => void) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) {
      return;
    }
    // Before the attach, so the terminal is built with the page's theme and font and never
    // repaints from a default one. After it, a theme or font pick comes through the same call.
    terminal.restyle(pageStyle());
    terminal.attach(pane);
    measure();
    const unwatch = watchRootStyle(document.documentElement, () => {
      terminal.restyle(pageStyle());
      measure();
    });
    // The observer covers the window, the sidebar collapsing, and the tab becoming visible.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(measure, FIT_DEBOUNCE_MS);
    });
    observer.observe(pane);
    return () => {
      unwatch();
      observer.disconnect();
      if (timer !== null) {
        clearTimeout(timer);
      }
      terminal.dispose();
    };
  }, [terminal, measure]);
  return paneRef;
}

/** The task row decides first; the socket only says what it is doing while the task is live. */
function overlayPhase(target: SessionTarget, phase: SessionPhase): OverlayPhase | null {
  if (target !== "attach") {
    return target;
  }
  return phase === "reconnecting" || phase === "ended" ? phase : null;
}

/** The colours and the font the page is drawn with right now, read from `<html>`. */
function pageStyle(): TerminalStyle {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name);
  return { theme: xtermTheme(read), ...xtermFont(read) };
}

/** A read that failed says nothing about the task, so the tab waits and asks again. */
function noAnswer(): null {
  return null;
}
