import { capturePane, type TmuxClient } from "./tmux-client.js";

/**
 * Screens that own the keyboard. tmux's bracketed paste never reaches a composer behind one of
 * these, and the Enter that follows the paste answers the screen instead - on Codex's directory
 * trust screen that means picking whatever option is highlighted. Each line is one harness's own
 * wording, matched as a substring of the pane's visible text.
 */
const GATE_PHRASES = [
  "Do you trust the contents of this directory",
  "Hooks need review",
  "Trust all and continue",
  "Do you trust the files in this folder",
];

const POLL_MS = 250;
/** A composer still painting swallows a paste, so the pane has to hold still this long first. */
const QUIET_MS = 500;
/** A pane that never settles - a spinner, a running turn - must not hold a launch forever. */
const CEILING_MS = 15_000;

export type ComposerWait = {
  /** The pane stopped changing and shows nothing that would swallow a paste. */
  ready: boolean;
  /** The gate phrase on screen, when one is what makes the pane unready. */
  gate: string | null;
};

export type ComposerWaitOptions = {
  pollMs?: number;
  quietMs?: number;
  ceilingMs?: number;
};

/**
 * Waits until a session's pane is worth pasting into: the visible text unchanged for `quietMs` and
 * no gate phrase on it. The pane settling on a gate answers at once, because only the user can
 * clear that. The ceiling answers `ready: false` with whatever the pane last showed.
 */
export async function waitForComposer(
  client: TmuxClient,
  session: string,
  opts: ComposerWaitOptions = {},
): Promise<ComposerWait> {
  const pollMs = opts.pollMs ?? POLL_MS;
  const quietMs = opts.quietMs ?? QUIET_MS;
  const deadline = Date.now() + (opts.ceilingMs ?? CEILING_MS);
  let shown: string | null = null;
  let steadyAt = Date.now();
  for (;;) {
    const text = await capturePane(client, session);
    const now = Date.now();
    if (text !== shown) {
      shown = text;
      steadyAt = now;
    }
    const gate = gatePhrase(text);
    if (now - steadyAt >= quietMs) {
      return { ready: gate === null, gate };
    }
    if (now >= deadline) {
      return { ready: false, gate };
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, deadline - now)));
  }
}

/**
 * The gate phrase a pane shows right now, or null. A turn typed into a running session needs
 * only this check: a harness mid-turn repaints without pause, so waiting for it to hold still
 * would run to the ceiling on every click, and harnesses queue input typed during a turn.
 */
export async function gateOnPane(client: TmuxClient, session: string): Promise<string | null> {
  return gatePhrase(await capturePane(client, session));
}

function gatePhrase(text: string): string | null {
  return GATE_PHRASES.find((phrase) => text.includes(phrase)) ?? null;
}
