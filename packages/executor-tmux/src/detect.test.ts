import { chmod, copyFile, mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DetectedHarness,
  type ExecutorProvider,
  type ProcessMatcher,
  spawn,
} from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectHarnesses, matchesName, parsePaneOwners, processName } from "./detect.js";
import { parsePsOutput } from "./process-table.js";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

const MATCHERS: ProcessMatcher[] = [
  { harness: "claude-code", processNames: ["claude"] },
  { harness: "codex", processNames: ["codex", "codex-"] },
];

let tmux: TestTmux;
let executor: ExecutorProvider;
let root: string;
let underTmux: string;
let outsideTmux: string;
let sibling: string;
// The type comes from core's spawn, so this package needs no dependency on execa itself.
let outside: ReturnType<typeof spawn>;
let elsewhere: ReturnType<typeof spawn>;

async function harnessNamed(name: string): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "agn-detect-bin-"));
  const path = join(bin, name);
  await copyFile(FAKE_AGENT, path);
  await chmod(path, 0o755);
  return path;
}

beforeAll(async () => {
  tmux = await createTestTmux();
  executor = tmux.executor();
  root = await mkdtemp(join(tmpdir(), "agn-detect-"));
  underTmux = join(root, "under-tmux");
  outsideTmux = join(root, "outside-tmux");
  sibling = await mkdtemp(join(tmpdir(), "agn-detect-sibling-"));
  await mkdir(underTmux);
  await mkdir(outsideTmux);

  const claude = await harnessNamed("claude");
  outside = spawn(claude, [], { cwd: outsideTmux, env: tmux.env, inheritEnv: false });
  elsewhere = spawn(claude, [], { cwd: sibling, env: tmux.env, inheritEnv: false });
  await executor.launch({
    taskId: "detectwxyz",
    cwd: underTmux,
    command: {
      command: await harnessNamed("codex-aarch64"),
      args: ["--model", "gpt-5"],
      env: tmux.env,
      promptAfterStart: null,
    },
  });
  await waitFor("both harnesses are running", async () => {
    const found = await executor.detect(root, MATCHERS);
    return found.length === 2;
  });
}, 60_000);

afterAll(async () => {
  outside.kill("SIGKILL");
  elsewhere.kill("SIGKILL");
  await Promise.allSettled([outside, elsewhere]);
  await tmux.cleanup();
});

describe("processName", () => {
  it("takes the binary's own name", () => {
    expect(processName(["/usr/local/bin/claude", "--model", "sonnet"])).toBe("claude");
  });

  it("takes the script's name when an interpreter runs it", async () => {
    const rows = parsePsOutput(
      "1204 871 node /Users/dev/.nvm/versions/node/v22/bin/claude --model",
    );
    expect(processName(rows[0]?.args ?? [])).toBe("claude");
    expect(processName(["/usr/bin/python3", "/home/dev/.local/bin/pi"])).toBe("pi");
  });

  it("keeps the interpreter when it is running a flag, not a script", () => {
    expect(processName(["node", "--version"])).toBe("node");
    expect(processName([])).toBeNull();
  });
});

describe("matchesName", () => {
  it("matches exactly, or as a prefix for a name that ends in a dash", () => {
    expect(matchesName("codex", ["codex", "codex-"])).toBe(true);
    expect(matchesName("codex-aarch64-apple-darwin", ["codex", "codex-"])).toBe(true);
    expect(matchesName("codexify", ["codex", "codex-"])).toBe(false);
  });
});

describe("parsePaneOwners", () => {
  it("maps a pane's process to its session", () => {
    expect(parsePaneOwners("123|agn-t3n9v2wxyz\n456|work\n\n")).toEqual(
      new Map([
        [123, "agn-t3n9v2wxyz"],
        [456, "work"],
      ]),
    );
  });
});

describe("detect", () => {
  it("finds both harnesses under the path, with their cwd, args and tmux session", async () => {
    // `lsof` can be slow enough under load to miss a pid, and a detection that missed one is a
    // detection to repeat rather than a failure, so this reads until the machine agrees.
    let found: DetectedHarness[] = [];
    await waitFor("detect reports both harnesses with their tmux session", async () => {
      found = await executor.detect(root, MATCHERS);
      return found.length === 2 && found.some((row) => row.tmux !== null);
    });
    expect(found).toHaveLength(2);
    const claude = found.find((row) => row.harness === "claude-code");
    const codex = found.find((row) => row.harness === "codex");
    expect(claude).toMatchObject({
      pid: outside.pid,
      cwd: await realpath(outsideTmux),
      tmux: null,
    });
    expect(codex).toMatchObject({
      cwd: await realpath(underTmux),
      tmux: { socket: tmux.socketName, session: "agn-detectwxyz" },
    });
    expect(codex?.args.slice(-2)).toEqual(["--model", "gpt-5"]);
    expect(found.map((row) => row.pid)).toEqual(
      [...found.map((row) => row.pid)].sort((a, b) => a - b),
    );
  });

  it("leaves out a harness running in a sibling directory", async () => {
    expect((await executor.detect(root, MATCHERS)).map((row) => row.pid)).not.toContain(
      elsewhere.pid,
    );
    expect((await pidsUnder(sibling)).map((row) => row.pid)).toEqual([elsewhere.pid]);
  });

  it("follows a symlinked path to the same processes", async () => {
    const link = join(await mkdtemp(join(tmpdir(), "agn-detect-link-")), "link");
    await symlink(root, link);
    const found = await pidsUnder(link, 2);
    expect(found.map((row) => row.harness).sort()).toEqual(["claude-code", "codex"]);
  });

  it("finds nothing when no matcher names a running program", async () => {
    expect(await executor.detect(root, [{ harness: "pi", processNames: ["pi"] }])).toEqual([]);
  });

  it("has no rows for a path with no harness in it", async () => {
    expect(await detectHarnesses([tmux.client], [], root, MATCHERS)).toEqual([]);
  });
});

/** The same tolerance for a slow `lsof` as the first test, for the counts that must be exact. */
async function pidsUnder(path: string, expected = 1): Promise<DetectedHarness[]> {
  let found: DetectedHarness[] = [];
  await waitFor(`detect reports ${expected} harness(es) under ${path}`, async () => {
    found = await executor.detect(path, MATCHERS);
    return found.length === expected;
  });
  return found;
}
