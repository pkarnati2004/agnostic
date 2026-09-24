import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type GhShim = {
  /** Where the shim sits, which is what a detection fixture reports as gh's path. */
  path: string;
  /** The exit code `gh auth status` answers with; 0 is a logged-in gh. */
  auth(exitCode: number): Promise<void>;
  /** `gh pr view`: exit 0 with this URL when a pull request is open, non-zero when none is. */
  view(exitCode: number, url?: string): Promise<void>;
  create(answer: { exitCode?: number; url?: string; stderr?: string }): Promise<void>;
  /** Every gh argv, in order. */
  calls(): Promise<string[][]>;
  /** What `--body-file` held on the last create, or null when nothing was created. */
  body(): Promise<string | null>;
};

/**
 * A `gh` that answers from files in its own directory, so one test daemon serves cases that need
 * different answers. It records every argv, and copies the `--body-file` it is handed, which is
 * how a test reads the description agn composed.
 */
export async function installGhShim(dir: string): Promise<GhShim> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "gh");
  await writeFile(path, script(process.execPath, dir), "utf8");
  await chmod(path, 0o755);
  await writeFile(join(dir, "calls.jsonl"), "", "utf8");
  const put = (name: string, value: string) => writeFile(join(dir, name), value, "utf8");
  const read = (name: string) => readFile(join(dir, name), "utf8").catch(() => null);
  return {
    path,
    auth: (exitCode) => put("auth-exit", String(exitCode)),
    view: async (exitCode, url = "") => {
      await put("view-exit", String(exitCode));
      await put("view-url", url);
    },
    create: async (answer) => {
      await put("create-exit", String(answer.exitCode ?? 0));
      await put("create-url", answer.url ?? "https://github.com/o/r/pull/7");
      await put("create-stderr", answer.stderr ?? "");
    },
    calls: async () =>
      ((await read("calls.jsonl")) ?? "")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as string[]),
    body: () => read("body.md"),
  };
}

function script(node: string, dir: string): string {
  return `#!${node}
const { appendFileSync, copyFileSync, readFileSync, writeSync } = require("node:fs");
const { join } = require("node:path");
const DIR = ${JSON.stringify(dir)};
const argv = process.argv.slice(2);
appendFileSync(join(DIR, "calls.jsonl"), JSON.stringify(argv) + "\\n");
const file = (name, fallback) => {
  try {
    return readFileSync(join(DIR, name), "utf8");
  } catch {
    return fallback;
  }
};
const command = argv.slice(0, 2).join(" ");
if (command === "auth status") {
  process.exit(Number(file("auth-exit", "0")));
}
if (command === "pr view") {
  const code = Number(file("view-exit", "1"));
  if (code === 0) {
    writeSync(1, JSON.stringify({ url: file("view-url", "") }) + "\\n");
  }
  process.exit(code);
}
if (command === "pr create") {
  const at = argv.indexOf("--body-file");
  if (at !== -1) {
    copyFileSync(argv[at + 1], join(DIR, "body.md"));
  }
  const code = Number(file("create-exit", "0"));
  writeSync(code === 0 ? 1 : 2, code === 0 ? file("create-url", "") + "\\n" : file("create-stderr", "gh refused"));
  process.exit(code);
}
writeSync(2, "this gh shim does not answer " + command + "\\n");
process.exit(1);
`;
}
