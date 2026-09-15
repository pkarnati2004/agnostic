import { realpath } from "node:fs/promises";
import { basename, sep } from "node:path";
import type { DetectedHarness, ProcessMatcher } from "@agnostic/core";
import { type ProcessRow, readCwds } from "./process-table.js";
import type { TmuxClient } from "./tmux-client.js";

/**
 * Flags an interpreter reads before the script: `value` ones take the next token, so it is not the
 * script, and `inline` ones mean the code itself is next and there is no script at all. Which is
 * which depends on the interpreter - `-e` is node's eval but sh's errexit.
 */
type Flags = { value: string[]; inline: string[] };
const JS: Flags = {
  value: ["-r", "--require", "--loader", "--import", "--experimental-loader"],
  inline: ["-e", "--eval", "-p", "--print"],
};
const DASH_C: Flags = { value: [], inline: ["-c"] };

// A harness installed as a script runs under its interpreter, so the name is the script's.
const INTERPRETERS = new Map<string, Flags>([
  ["node", JS],
  ["bun", JS],
  ["deno", JS],
  ["python", DASH_C],
  ["python3", DASH_C],
  ["sh", DASH_C],
  ["bash", DASH_C],
  ["zsh", DASH_C],
]);
// What a script is called, not what its file is called: `codex.js` under node is codex running.
const SCRIPT_SUFFIXES = [".js", ".mjs", ".cjs", ".ts", ".py", ".sh"];
const MAX_PARENT_WALK = 20;

export function processName(args: string[]): string | null {
  const first = args[0];
  if (first === undefined) {
    return null;
  }
  const name = basename(first);
  const flags = INTERPRETERS.get(name);
  if (flags === undefined) {
    return name;
  }
  const script = scriptArg(args.slice(1), flags);
  return script === null ? name : scriptName(script);
}

/** `#!/usr/bin/env -S node --enable-source-maps` and `#!/bin/sh -e` put flags before the script. */
function scriptArg(args: string[], flags: Flags): string | null {
  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? "";
    index += 1;
    if (!arg.startsWith("-")) {
      return arg;
    }
    const flag = arg.split("=")[0] ?? arg;
    if (flags.inline.includes(flag)) {
      return null;
    }
    // `--require=./shim.js` carries its own value; `--require ./shim.js` swallows the next token.
    if (flags.value.includes(flag) && !arg.includes("=")) {
      index += 1;
    }
  }
  return null;
}

function scriptName(path: string): string {
  const name = basename(path);
  const suffix = SCRIPT_SUFFIXES.find((ending) => name.endsWith(ending));
  return suffix === undefined ? name : name.slice(0, -suffix.length);
}

/** A registry name ending in `-` is a prefix: `codex-` matches the `codex-aarch64` builds. */
export function matchesName(name: string, processNames: string[]): boolean {
  return processNames.some((wanted) =>
    wanted.endsWith("-") ? name.startsWith(wanted) : name === wanted,
  );
}

/** Every match is returned: the daemon asks the user which one to adopt. */
export async function detectHarnesses(
  clients: TmuxClient[],
  rows: ProcessRow[],
  path: string,
  matchers: ProcessMatcher[],
): Promise<DetectedHarness[]> {
  const candidates = rows.flatMap((row) => {
    const name = processName(row.args);
    if (name === null) {
      return [];
    }
    const matcher = matchers.find((m) => matchesName(name, m.processNames));
    return matcher === undefined ? [] : [{ row, harness: matcher.harness }];
  });
  if (candidates.length === 0) {
    return [];
  }
  const root = await resolved(path);
  const cwds = await readCwds(candidates.map((candidate) => candidate.row.pid));
  const owners = await paneOwners(clients);
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const found: DetectedHarness[] = [];
  for (const { row, harness } of candidates) {
    const cwd = cwds.get(row.pid);
    if (cwd === undefined || !(await isUnder(cwd, root))) {
      continue;
    }
    found.push({ harness, pid: row.pid, cwd, args: row.args, tmux: paneOf(row, byPid, owners) });
  }
  return found.sort((a, b) => a.pid - b.pid);
}

type PaneOwner = { socket: string | null; session: string };

/** A harness is in a session when one of its ancestors is a pane's own process. */
function paneOf(
  row: ProcessRow,
  byPid: Map<number, ProcessRow>,
  owners: Map<number, PaneOwner>,
): PaneOwner | null {
  let current: ProcessRow | undefined = row;
  for (let step = 0; step < MAX_PARENT_WALK && current !== undefined; step += 1) {
    const owner = owners.get(current.pid);
    if (owner !== undefined) {
      return owner;
    }
    current = byPid.get(current.ppid);
  }
  return null;
}

async function paneOwners(clients: TmuxClient[]): Promise<Map<number, PaneOwner>> {
  const owners = new Map<number, PaneOwner>();
  for (const client of clients) {
    const result = await client.run(
      ["list-panes", "-a", "-F", "#{pane_pid}|#{session_name}"],
      // No server running on that socket is no panes, not a failure.
      { allowFailure: true },
    );
    if (result.exitCode !== 0) {
      continue;
    }
    for (const [pid, session] of parsePaneOwners(result.stdout)) {
      owners.set(pid, { socket: client.socket, session });
    }
  }
  return owners;
}

export function parsePaneOwners(stdout: string): Map<number, string> {
  const panes = new Map<number, string>();
  for (const line of stdout.split("\n")) {
    const [rawPid, session] = line.trim().split("|");
    const pid = Number(rawPid);
    if (Number.isInteger(pid) && pid > 0 && session !== undefined && session !== "") {
      panes.set(pid, session);
    }
  }
  return panes;
}

async function isUnder(cwd: string, root: string): Promise<boolean> {
  const real = await resolved(cwd);
  return real === root || real.startsWith(`${root}${sep}`);
}

async function resolved(path: string): Promise<string> {
  return await realpath(path).catch(() => path);
}
