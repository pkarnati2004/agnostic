import type { AgnosticPaths, TmuxReport } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import type { EnsureResult, ensureDaemon } from "./daemon-launch.js";
import { nextPage, type StartDeps } from "./start-sequence.js";

const TOKEN = "fixture-token-0123456789";
const INFO = { pid: 4242, port: 7555, startedAt: "2026-11-01T00:00:00.000Z" };
const RUNNING: EnsureResult = { kind: "running", info: INFO, reused: false };

function deps(overrides: {
  ensure?: EnsureResult | Error;
  tmux?: TmuxReport | Error;
  env?: Record<string, string>;
}) {
  const lines: string[] = [];
  const ensure = vi.fn(async () => {
    const answer = overrides.ensure ?? RUNNING;
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  });
  const tmux = vi.fn(async () => {
    const answer = overrides.tmux ?? { version: "3.5a", ok: true };
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  });
  const built: StartDeps = {
    env: async () => ({
      env: overrides.env ?? {
        HOME: "/Users/dev",
        AGNOSTIC_HOME: "/tmp/agn-home",
        PATH: "/usr/bin",
      },
      source: "login-shell",
    }),
    appRoot: "/app",
    ensureDaemon: ensure as unknown as typeof ensureDaemon,
    readToken: async (_paths: AgnosticPaths) => TOKEN,
    tmux,
    log: (line) => lines.push(line),
  };
  return { built, lines, ensure, tmux };
}

describe("nextPage", () => {
  it("opens the workspace with the token in the fragment when tmux is fine", async () => {
    const { built, lines, tmux } = deps({});
    expect(await nextPage(built)).toEqual({
      kind: "workspace",
      url: `http://127.0.0.1:7555/ui#token=${TOKEN}`,
    });
    expect(tmux).toHaveBeenCalledWith("http://127.0.0.1:7555", TOKEN);
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("spawns under the captured home with ELECTRON_RUN_AS_NODE set", async () => {
    const { built, ensure } = deps({ env: { HOME: "/Users/dev", PATH: "/usr/bin" } });
    await nextPage(built);
    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        paths: expect.objectContaining({ home: "/Users/dev/.agnostic" }),
        argv: [process.execPath, "/app/agnd/agnd.js", "run"],
        env: {
          HOME: "/Users/dev",
          PATH: "/usr/bin",
          ELECTRON_RUN_AS_NODE: "1",
          AGNOSTIC_HOME: "/Users/dev/.agnostic",
        },
      }),
    );
  });

  it("shows the tmux page with the version the daemon found", async () => {
    const { built } = deps({ tmux: { version: "3.2a", ok: false } });
    expect(await nextPage(built)).toEqual({
      kind: "status",
      state: { kind: "tmux", version: "3.2a" },
    });
  });

  it("orders env, paths, daemon, token, then the tmux check", async () => {
    const calls: string[] = [];
    const { built } = deps({});
    const ordered: StartDeps = {
      ...built,
      env: async () => {
        calls.push("env");
        return built.env();
      },
      ensureDaemon: (async (opts) => {
        calls.push(`daemon:${opts.paths.home}`);
        return RUNNING;
      }) as typeof ensureDaemon,
      readToken: async () => {
        calls.push("token");
        return TOKEN;
      },
      tmux: async () => {
        calls.push("doctor");
        return { version: "3.5a", ok: true };
      },
    };
    const page = await nextPage(ordered);
    calls.push(page.kind);
    expect(calls).toEqual([
      "env",
      expect.stringMatching(/^daemon:.*agn-home$/),
      "token",
      "doctor",
      "workspace",
    ]);
  });

  it("neither reads the token nor runs the doctor when the daemon is not running", async () => {
    const { built, tmux } = deps({ ensure: { kind: "foreign", home: "/other", port: 7555 } });
    const readToken = vi.fn(async () => TOKEN);
    await nextPage({ ...built, readToken });
    expect(readToken).not.toHaveBeenCalled();
    expect(tmux).not.toHaveBeenCalled();
  });

  it("shows the tmux page without a version when tmux is missing", async () => {
    const { built } = deps({ tmux: { version: null, ok: false } });
    expect(await nextPage(built)).toEqual({
      kind: "status",
      state: { kind: "tmux", version: null },
    });
  });

  it("shows the foreign and failed pages from ensureDaemon", async () => {
    const foreign = deps({ ensure: { kind: "foreign", home: "/other", port: 7555 } });
    expect(await nextPage(foreign.built)).toEqual({
      kind: "status",
      state: { kind: "foreign", home: "/other", port: 7555 },
    });
    const failed = deps({ ensure: { kind: "failed", logFile: "/tmp/agn-home/logs/agnd.log" } });
    expect(await nextPage(failed.built)).toEqual({
      kind: "status",
      state: { kind: "failed", logFile: "/tmp/agn-home/logs/agnd.log" },
    });
    const thrown = deps({ ensure: new Error("spawn EACCES") });
    expect(await nextPage(thrown.built)).toEqual({
      kind: "status",
      state: { kind: "failed", logFile: "/tmp/agn-home/logs/agnd.log" },
    });
  });

  it("shows the failed page, and logs no token, when the tmux check throws", async () => {
    const { built, lines } = deps({ tmux: new Error(`POST /doctor refused token ${TOKEN}`) });
    expect(await nextPage(built)).toEqual({
      kind: "status",
      state: { kind: "failed", logFile: "/tmp/agn-home/logs/agnd.log" },
    });
    expect(lines.join("\n")).toContain("tmux check failed");
    expect(lines.join("\n")).not.toContain(TOKEN);
  });
});
