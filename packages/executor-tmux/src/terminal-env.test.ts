import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, type ExecutorProvider } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTmuxExecutor } from "./executor.js";
import { waitFor } from "./test-tmux.js";

// The exact argv and environment `openTerminal` hands to the pty: pinned through a stub `tmux` on
// PATH rather than a real server, since chunk 01 spawns the tmux client itself (ADR 025).

function logText(log: string): Promise<string> {
  return readFile(log, "utf8").catch(() => "");
}

describe("the pty's environment", () => {
  it("runs the attach argv with no TMUX or TMUX_PANE, even when the daemon has them", async () => {
    // A `tmux` on PATH that records its argv and environment; it never talks to a server.
    const dir = await mkdtemp(join(tmpdir(), "agn-terminal-stub-"));
    const script = join(dir, "tmux");
    await writeFile(
      script,
      `#!/bin/sh\nprintf '%s|%s|%s\\n' "\${TMUX-unset}" "\${TMUX_PANE-unset}" "$*" >> "${dir}/calls"\nexit 0\n`,
    );
    await chmod(script, 0o755);
    const home = await mkdtemp(join(tmpdir(), "agn-terminal-home-"));
    const saved = { ...process.env };
    process.env.PATH = `${dir}:${saved.PATH ?? ""}`;
    process.env.TMUX = "/tmp/leaked-session,1,0";
    process.env.TMUX_PANE = "%3";
    let leaky: ExecutorProvider | null = null;
    try {
      leaky = createTmuxExecutor({ paths: agnosticPaths(home), socketName: "agn-terminal-stub" });
      const stream = await leaky.terminal(
        {
          taskId: "termenvwxy",
          tmuxSession: "agn-termenvwxy",
          tmuxSocket: "agn-terminal-stub",
          launchId: null,
          cwd: home,
        },
        { cols: 80, rows: 24 },
      );
      await waitFor("the pty's tmux ran", async () =>
        (await logText(join(dir, "calls"))).includes("attach-session"),
      );
      stream.close();
    } finally {
      restoreEnv(saved);
      await leaky?.close();
    }
    const attach = (await logText(join(dir, "calls")))
      .split("\n")
      .filter((line) => line.includes("attach-session"));
    expect(attach).toEqual([
      "unset|unset|-u -L agn-terminal-stub attach-session -t agn-termenvwxy",
    ]);
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("spawns the pty as xterm-256color from /", async () => {
    // Same stub-tmux pattern, recording $TERM and the working directory the pty gave it.
    const dir = await mkdtemp(join(tmpdir(), "agn-terminal-stub2-"));
    const script = join(dir, "tmux");
    await writeFile(
      script,
      `#!/bin/sh\nprintf '%s|%s\\n' "\${TERM-unset}" "$(pwd)" >> "${dir}/calls"\nexit 0\n`,
    );
    await chmod(script, 0o755);
    const home = await mkdtemp(join(tmpdir(), "agn-terminal-home2-"));
    const saved = { ...process.env };
    process.env.PATH = `${dir}:${saved.PATH ?? ""}`;
    let leaky: ExecutorProvider | null = null;
    try {
      leaky = createTmuxExecutor({ paths: agnosticPaths(home), socketName: "agn-terminal-stub2" });
      const stream = await leaky.terminal(
        {
          taskId: "termcwdxyz",
          tmuxSession: "agn-termcwdxyz",
          tmuxSocket: "agn-terminal-stub2",
          launchId: null,
          cwd: home,
        },
        { cols: 80, rows: 24 },
      );
      await waitFor("the pty's tmux ran", async () => (await logText(join(dir, "calls"))) !== "");
      stream.close();
    } finally {
      restoreEnv(saved);
      await leaky?.close();
    }
    expect(await logText(join(dir, "calls"))).toBe("xterm-256color|/\n");
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });
});

function restoreEnv(saved: NodeJS.ProcessEnv): void {
  for (const key of ["PATH", "TMUX", "TMUX_PANE"]) {
    const value = saved[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("the pty's size", () => {
  it("falls back to 80x24 and ignores a resize node-pty would reject", async () => {
    // The stub tmux reports its own window size in a loop, so every accepted resize shows up.
    const dir = await mkdtemp(join(tmpdir(), "agn-terminal-size-"));
    const script = join(dir, "tmux");
    await writeFile(
      script,
      `#!/bin/sh\ncase "$*" in\n  *attach-session*) while :; do stty size >> "${dir}/size"; sleep 0.1; done ;;\n  *) exit 0 ;;\nesac\n`,
    );
    await chmod(script, 0o755);
    const home = await mkdtemp(join(tmpdir(), "agn-terminal-home3-"));
    const saved = { ...process.env };
    process.env.PATH = `${dir}:${saved.PATH ?? ""}`;
    let leaky: ExecutorProvider | null = null;
    const sizeLog = join(dir, "size");
    const lastSize = async () =>
      (await logText(sizeLog))
        .split("\n")
        .filter((line) => line.trim() !== "")
        .at(-1);
    try {
      leaky = createTmuxExecutor({ paths: agnosticPaths(home), socketName: "agn-terminal-stub3" });
      const stream = await leaky.terminal(
        {
          taskId: "termsizeabc",
          tmuxSession: "agn-termsizeabc",
          tmuxSocket: "agn-terminal-stub3",
          launchId: null,
          cwd: home,
        },
        { cols: 0, rows: -5 },
      );
      try {
        await waitFor("the unusable initial size became 80x24", async () => {
          return (await lastSize()) === "24 80";
        });
        for (const size of [
          { cols: 0, rows: 24 },
          { cols: 80, rows: 0 },
          { cols: -1, rows: -1 },
          { cols: Number.NaN, rows: 24 },
          { cols: Number.POSITIVE_INFINITY, rows: 24 },
          { cols: 80.5, rows: 24 },
          { cols: 1001, rows: 24 },
        ]) {
          expect(() => stream.resize(size)).not.toThrow();
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(await lastSize()).toBe("24 80");
        stream.resize({ cols: 1000, rows: 25 });
        await waitFor("a size in range still gets through", async () => {
          return (await lastSize()) === "25 1000";
        });
      } finally {
        stream.close();
      }
    } finally {
      restoreEnv(saved);
      await leaky?.close();
    }
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });
});
