import { ProcessError, type RunResult, type run } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { ENV_MARKER, fallbackEnv, loginShellEnv, parseEnvBlock } from "./shell-env.js";

describe("parseEnvBlock", () => {
  it("ignores rc-file output before the marker and splits records on NUL", () => {
    const output = `Welcome back\n${ENV_MARKER}PATH=/opt/homebrew/bin:/usr/bin\0HOME=/Users/dev\0`;
    expect(parseEnvBlock(output)).toEqual({
      PATH: "/opt/homebrew/bin:/usr/bin",
      HOME: "/Users/dev",
    });
  });

  it("keeps a value that holds a newline or an equals sign whole", () => {
    const output = `${ENV_MARKER}NOTE=line one\nline=two\0EMPTY=\0`;
    expect(parseEnvBlock(output)).toEqual({ NOTE: "line one\nline=two", EMPTY: "" });
  });

  it("returns null without the marker", () => {
    expect(parseEnvBlock("PATH=/usr/bin\0")).toBeNull();
  });
});

describe("fallbackEnv", () => {
  it("puts Homebrew and /usr/local first on PATH, once each", () => {
    const env = fallbackEnv({ PATH: "/usr/bin:/usr/local/bin:/bin", HOME: "/Users/dev" });
    expect(env).toEqual({
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      HOME: "/Users/dev",
    });
  });

  it("writes a PATH when the app had none", () => {
    expect(fallbackEnv({}).PATH).toBe("/opt/homebrew/bin:/usr/local/bin");
  });
});

describe("loginShellEnv", () => {
  const base = { PATH: "/usr/bin:/bin", HOME: "/Users/dev" };

  it("returns the login shell's env, asked once with -ilc and a timeout", async () => {
    const fake = vi.fn(
      async (): Promise<RunResult> => ({
        stdout: `motd\n${ENV_MARKER}PATH=/opt/homebrew/bin:/usr/bin\0ANTHROPIC_API_KEY=fixture\0`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
    );
    const result = await loginShellEnv({ shell: "/bin/zsh", base, run: fake as typeof run });
    expect(result).toEqual({
      env: { PATH: "/opt/homebrew/bin:/usr/bin", ANTHROPIC_API_KEY: "fixture" },
      source: "login-shell",
    });
    expect(fake).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-ilc", expect.stringContaining("command env -0")],
      expect.objectContaining({ env: base, inheritEnv: false, timeoutMs: 10_000 }),
    );
  });

  it("falls back when the shell times out", async () => {
    const timedOut = vi.fn(async (): Promise<RunResult> => {
      throw new ProcessError("zsh timed out", {
        code: "process-timeout",
        command: "/bin/zsh",
        args: [],
        exitCode: null,
        stderr: "",
      });
    });
    const result = await loginShellEnv({ shell: "/bin/zsh", base, run: timedOut as typeof run });
    expect(result.source).toBe("fallback");
    expect(result.env.PATH).toBe("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
  });

  it("falls back when the output has no marker", async () => {
    const silent = vi.fn(
      async (): Promise<RunResult> => ({
        stdout: "nothing",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
    );
    const result = await loginShellEnv({ shell: "/bin/zsh", base, run: silent as typeof run });
    expect(result.source).toBe("fallback");
  });

  it("falls back when the shell exits non-zero, even after it printed the marker", async () => {
    const failing = vi.fn(async (): Promise<RunResult> => {
      throw new ProcessError("zsh exited 1", {
        code: "process-failed",
        command: "/bin/zsh",
        args: [],
        exitCode: 1,
        stderr: "",
      });
    });
    const result = await loginShellEnv({ shell: "/bin/zsh", base, run: failing as typeof run });
    expect(result.source).toBe("fallback");
  });

  it("passes timeoutMs on and never logs a value it read", async () => {
    const logged = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
    ];
    const fake = vi.fn(
      async (): Promise<RunResult> => ({
        stdout: `${ENV_MARKER}SECRET_VALUE=example-not-a-key\0`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
    );
    await loginShellEnv({ shell: "/bin/zsh", base, run: fake as typeof run, timeoutMs: 50 });
    expect(fake).toHaveBeenCalledWith(
      "/bin/zsh",
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 50 }),
    );
    for (const spy of logged) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
