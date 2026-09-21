import { readlink } from "node:fs/promises";
import { platform } from "node:os";
import { isProcessAlive, run, spawn } from "@agnostic/core";
import { ExecutorError } from "./error.js";

/** args are what `ps` prints: whitespace-separated, so an argument with a space is two here. */
export type ProcessRow = { pid: number; ppid: number; args: string[] };

export async function readProcessTable(): Promise<ProcessRow[]> {
  try {
    const result = await run("ps", ["-axo", "pid=,ppid=,args="], { timeoutMs: 5_000 });
    return parsePsOutput(result.stdout);
  } catch (cause) {
    throw new ExecutorError("could not read the process table with `ps`", {
      code: "process-table-failed",
      hint: "Check that `ps` is on PATH.",
      cause,
    });
  }
}

export function parsePsOutput(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    const command = match?.[3]?.trim();
    if (match === null || command === undefined || command === "") {
      continue;
    }
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), args: command.split(/\s+/) });
  }
  return rows;
}

/** Only the processes that matched a harness name are asked for, so this stays one small call. */
export async function readCwds(pids: number[]): Promise<Map<number, string>> {
  if (pids.length === 0) {
    return new Map();
  }
  if (platform() === "linux") {
    return readProcCwds(pids);
  }
  // lsof exits non-zero when any one of the pids has gone away but still prints the others, so
  // what it wrote matters more than how it exited.
  const args = ["-a", "-d", "cwd", "-Fn", "-p", pids.join(",")];
  const output = await spawn("lsof", args, { cwd: "/", timeoutMs: 10_000 }).then(
    (result) => String(result.stdout),
    (cause: unknown) => stdoutOf(cause),
  );
  return parseLsofCwd(output);
}

/** `lsof -Fn` prints one field per line: `p<pid>`, then `f<fd>` and `n<path>` for each descriptor. */
export function parseLsofCwd(text: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("p")) {
      const parsed = Number(line.slice(1));
      pid = Number.isInteger(parsed) ? parsed : null;
    } else if (line.startsWith("n") && pid !== null && !cwds.has(pid)) {
      cwds.set(pid, line.slice(1));
    }
  }
  return cwds;
}

function stdoutOf(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "stdout" in cause) {
    return typeof cause.stdout === "string" ? cause.stdout : "";
  }
  return "";
}

async function readProcCwds(pids: number[]): Promise<Map<number, string>> {
  const cwds = new Map<number, string>();
  for (const pid of pids) {
    const path = await readlink(`/proc/${pid}/cwd`).catch(() => null);
    if (path !== null) {
      cwds.set(pid, path);
    }
  }
  return cwds;
}

/** One pid's command line, read the way `readProcessTable` reads every one of them. */
export async function readProcessArgs(pid: number): Promise<string[] | null> {
  const result = await run("ps", ["-p", String(pid), "-o", "args="], { timeoutMs: 5_000 }).catch(
    () => null,
  );
  const line = result?.stdout.trim();
  return line === undefined || line === "" ? null : line.split(/\s+/);
}

/** What `stop` needs to know about processes, so a test can hand it a table it controls. */
export type ProcessProbe = {
  descendants(pid: number): Promise<number[]>;
  /** The process's own name, for the pid-reuse guard: a recycled pid is a different program. */
  comm(pid: number): Promise<string | null>;
  alive(pid: number): boolean;
  /** Signals the pid's process group, falling back to the pid when it leads no group. */
  signal(pid: number, signal: NodeJS.Signals): void;
};

export function processProbe(): ProcessProbe {
  return {
    async descendants(pid: number): Promise<number[]> {
      return descendantsOf(await readProcessTable(), pid);
    },
    async comm(pid: number): Promise<string | null> {
      const result = await run("ps", ["-p", String(pid), "-o", "comm="], {
        timeoutMs: 5_000,
      }).catch(() => null);
      const name = result?.stdout.trim();
      return name === undefined || name === "" ? null : name;
    },
    alive: isProcessAlive,
    signal(pid: number, signal: NodeJS.Signals): void {
      try {
        process.kill(-pid, signal);
      } catch {
        try {
          process.kill(pid, signal);
        } catch {
          // Already gone, or not ours to signal: the caller verifies with a liveness check.
        }
      }
    },
  };
}

export function descendantsOf(rows: ProcessRow[], pid: number): number[] {
  const children = new Map<number, number[]>();
  for (const row of rows) {
    children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid]);
  }
  const found: number[] = [];
  const queue = [pid];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) {
      break;
    }
    for (const child of children.get(next) ?? []) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}
