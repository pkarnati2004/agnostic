import { writeFileSync } from "node:fs";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findOnPath } from "@agnostic/registry";

export type PushAnswer = { exitCode?: number; stdout?: string; stderr?: string };

export type GitRecorder = {
  /** Where the shim lives: a daemon under test puts it on the PATH it runs git with. */
  dir: string;
  /** Every git argv this process has run since the recorder went on PATH, in order. */
  calls(): Promise<string[][]>;
  /** What the next `git push` answers with; anything else still runs the real git. */
  answerPush(answer: PushAnswer): void;
  /** `GIT_TERMINAL_PROMPT` as the last push saw it, or null when no push has run. */
  terminalPrompt(): Promise<string | null>;
  restore(): void;
};

// What the next push answers with, read by the shim from its own directory rather than from the
// environment: agn runs git with the daemon's environment, which a test does not write into.
const ANSWER_FILE = "push-answer.json";

/**
 * A `git` ahead of the real one on PATH that writes down every argv it is given and answers
 * `push` from the environment, so a test can watch what agn asked git to do to a remote without
 * one existing. Everything else is handed to the real git, found once, before the shim was
 * installed, so it cannot call itself.
 */
export async function recordGit(): Promise<GitRecorder> {
  const dir = await mkdtemp(join(tmpdir(), "agn-git-recorder-"));
  const calls = join(dir, "calls.jsonl");
  const real = await findOnPath(["git"], process.env.PATH ?? "");
  if (real === null) {
    throw new Error("these tests need git on PATH");
  }
  await writeFile(calls, "", "utf8");
  const shim = join(dir, "git");
  await writeFile(shim, recorder(process.execPath, real, dir), "utf8");
  await chmod(shim, 0o755);
  const original = process.env.PATH ?? "";
  process.env.PATH = `${dir}:${original}`;
  return {
    dir,
    calls: async () =>
      (await readFile(calls, "utf8"))
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as string[]),
    terminalPrompt: () => readFile(join(dir, "push-env.txt"), "utf8").catch(() => null),
    answerPush: (answer) => {
      writeFileSync(join(dir, ANSWER_FILE), JSON.stringify(answer), "utf8");
    },
    restore: () => {
      process.env.PATH = original;
    },
  };
}

/** Run by node itself, by absolute path: the shim must not depend on what is on PATH around it. */
function recorder(node: string, real: string, dir: string): string {
  return `#!${node}
const { appendFileSync, readFileSync, writeFileSync, writeSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const DIR = ${JSON.stringify(dir)};
const ANSWER = ${JSON.stringify(ANSWER_FILE)};
const argv = process.argv.slice(2);
appendFileSync(join(DIR, "calls.jsonl"), JSON.stringify(argv) + "\\n");
if (argv.includes("push")) {
  writeFileSync(join(DIR, "push-env.txt"), String(process.env.GIT_TERMINAL_PROMPT));
  const branch = argv[argv.length - 1];
  const line = "To origin\\n*\\trefs/heads/" + branch + ":refs/heads/" + branch + "\\t[new branch]\\nDone\\n";
  let answer = {};
  try {
    answer = JSON.parse(readFileSync(join(DIR, ANSWER), "utf8"));
  } catch {}
  writeSync(1, answer.stdout === undefined ? line : answer.stdout);
  writeSync(2, answer.stderr || "");
  process.exit(Number(answer.exitCode || 0));
}
process.exit(spawnSync(${JSON.stringify(real)}, argv, { stdio: "inherit" }).status ?? 1);
`;
}
