import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutorProvider, SessionHandle, TerminalStream } from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

// A server of its own, because a tmux server reads a config only once: the broken file has to be
// in place before anything starts this one.
let tmux: TestTmux;
let executor: ExecutorProvider;

beforeAll(async () => {
  tmux = await createTestTmux();
  await writeFile(
    join(tmux.home, ".tmux.conf"),
    'set -g no-such-option 1\nbind-key -T nosuchtable "" nonsense\n',
    "utf8",
  );
  executor = await tmux.executor();
});

afterAll(async () => {
  await tmux.cleanup();
});

async function startAgent(taskId: string): Promise<{ handle: SessionHandle; log: string }> {
  const cwd = await mkdtemp(join(tmpdir(), "agn-config-"));
  const log = join(cwd, "agent.log");
  const handle = await executor.launch({
    taskId,
    cwd,
    command: { command: FAKE_AGENT, args: ["--log", log], env: tmux.env, promptAfterStart: null },
  });
  await waitFor("the agent is ready", async () =>
    (await readFile(log, "utf8").catch(() => "")).includes("ready"),
  );
  return { handle, log };
}

function collect(stream: TerminalStream): () => string {
  const chunks: Uint8Array[] = [];
  stream.onData((data) => chunks.push(data));
  return () => Buffer.concat(chunks).toString("utf8");
}

async function option(args: string[]): Promise<string> {
  return (await tmux.client.run(args)).stdout.trim();
}

describe("a broken ~/.tmux.conf in the user's home", () => {
  it("never reaches agn's server, which runs on agn's own config", async () => {
    const { handle, log } = await startAgent("cfgbrokenx");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    const seen = collect(stream);
    try {
      await waitFor("the pane redraws for the new client", () =>
        seen().includes("fake-agent ready"),
      );
      expect(seen()).not.toContain("no-such-option");
      expect(seen()).not.toContain("unknown option");

      expect(await option(["show-options", "-g", "status"])).toBe("status off");
      expect(await option(["show-options", "-s", "escape-time"])).toBe("escape-time 0");

      stream.write(Buffer.from("hello\r", "utf8"));
      await waitFor("the typed line reached the agent", async () =>
        (await readFile(log, "utf8").catch(() => "")).includes("line: hello"),
      );
    } finally {
      stream.close();
    }
  }, 30_000);
});
