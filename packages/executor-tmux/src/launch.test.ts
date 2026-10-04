import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LaunchCommand, LaunchRequest, RunResult } from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchSession, newSessionArgs, paneDiedHook } from "./launch.js";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";
import { hasSession, paneDead, panePid, type TmuxClient } from "./tmux-client.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

let tmux: TestTmux;
let taskSequence = 0;

beforeAll(async () => {
  tmux = await createTestTmux();
});

afterAll(async () => {
  await tmux.cleanup();
});

function taskId(): string {
  taskSequence += 1;
  return `launch${taskSequence}xyz`.slice(0, 10);
}

async function request(overrides: Partial<LaunchCommand> = {}): Promise<LaunchRequest> {
  const cwd = await mkdtemp(join(tmpdir(), "agn-launch-"));
  return {
    taskId: taskId(),
    cwd,
    command: {
      command: FAKE_AGENT,
      args: ["--log", join(cwd, "agent.log")],
      env: { ...tmux.env, AGN_TEST: "1" },
      promptAfterStart: null,
      ...overrides,
    },
  };
}

function logOf(req: LaunchRequest): Promise<string> {
  return readFile(join(req.cwd, "agent.log"), "utf8").catch(() => "");
}

/** A client that answers instead of running tmux, so the argv sequence itself can be asserted. */
function recordingClient(opts: { paneDead?: boolean } = {}): {
  client: TmuxClient;
  calls: { args: string[]; at: number }[];
} {
  const calls: { args: string[]; at: number }[] = [];
  return {
    calls,
    client: {
      socket: "agn-recording",
      async run(args: string[]): Promise<RunResult> {
        calls.push({ args, at: Date.now() });
        const stdout = recordedStdout(args, opts.paneDead === true);
        // has-session answers "no session", so launch takes the fresh-start path.
        return { stdout, stderr: "", exitCode: args[0] === "has-session" ? 1 : 0, durationMs: 0 };
      },
    },
  };
}

function recordedStdout(args: string[], paneIsDead: boolean): string {
  if (args[0] === "-V") {
    return "tmux 3.7b";
  }
  // list-panes carries `#{session_name}|#{pane_dead}`, which is what paneDead reads.
  return args[0] === "list-panes" ? `agn-recorded|${paneIsDead ? "1" : "0"}` : "";
}

describe("newSessionArgs", () => {
  it("sizes the window explicitly and passes the command as separate tokens", async () => {
    const req = await request({ args: ["--log", "/tmp/x", "hello world"] });
    const args = newSessionArgs("agn-x", req);
    expect(args.slice(0, 6)).toEqual(["new-session", "-d", "-s", "agn-x", "-c", req.cwd]);
    expect(args).toContain("-x");
    expect(args).toContain("200");
    expect(args).toContain("-y");
    expect(args).toContain("50");
    expect(args.slice(args.indexOf("--"))).toEqual([
      "--",
      FAKE_AGENT,
      "--log",
      "/tmp/x",
      "hello world",
    ]);
  });

  it("passes one -e per environment entry", async () => {
    const req = await request({ env: { PATH: "/usr/bin", AGN_TEST: "1" } });
    expect(newSessionArgs("agn-x", req)).toContain("PATH=/usr/bin");
    expect(newSessionArgs("agn-x", req)).toContain("AGN_TEST=1");
  });
});

describe("paneDiedHook", () => {
  it("quotes the exit file for tmux and for the shell run-shell hands it to", () => {
    expect(paneDiedHook("/home/dev/.agnostic/sessions/agn-x.exit")).toBe(
      "run-shell \"echo '#{pane_dead_status} #{pane_dead_signal}' > '/home/dev/.agnostic/sessions/agn-x.exit'\"",
    );
    expect(paneDiedHook("/home/o'neil/a b/agn-x.exit")).toContain(`'/home/o'\\"'\\"'neil/a b/`);
    expect(paneDiedHook("/home/dev/$HOME #1/agn-x.exit")).toContain("\\$HOME \\#1");
  });
});

describe("launchSession against a client that only records", () => {
  it("sets remain-on-exit and nothing else, then the pane-died hook", async () => {
    const { client, calls } = recordingClient();
    await launchSession(client, "/tmp/sessions", await request());
    const commands = calls.map((call) => call.args[0]);
    expect(commands).toEqual(["-V", "has-session", "new-session", "set-option", "set-hook"]);
    expect(calls[3]?.args).toEqual([
      "set-option",
      "-w",
      "-t",
      expect.stringContaining("agn-"),
      "remain-on-exit",
      "on",
    ]);
  });

  it("pastes the prompt and sends Enter 100ms later, never send-keys -l", async () => {
    const { client, calls } = recordingClient();
    await launchSession(client, "/tmp/sessions", await request({ promptAfterStart: "do it" }));
    const last = calls.slice(-3);
    expect(last.map((call) => call.args[0])).toEqual(["load-buffer", "paste-buffer", "send-keys"]);
    expect(last[2]?.args).toEqual(["send-keys", "-t", expect.stringContaining("agn-"), "Enter"]);
    // The wait is 100ms; a timer may fire a millisecond early, so the assertion is the gap, not
    // the exact number. The order of the three calls above is what has to be right.
    expect((last[2]?.at ?? 0) - (last[1]?.at ?? 0)).toBeGreaterThanOrEqual(90);
    expect(calls.flatMap((call) => call.args)).not.toContain("-l");
  });

  it("types nothing into a pane whose process exited while the wait was polling", async () => {
    const { client, calls } = recordingClient({ paneDead: true });
    const req = await request({ promptAfterStart: "do it" });

    await expect(launchSession(client, "/tmp/sessions", req)).rejects.toMatchObject({
      name: "ExecutorError",
      code: "session-not-running",
    });
    expect(calls.map((call) => call.args[0])).not.toContain("paste-buffer");
  });
});

describe("launchSession", () => {
  it("starts the harness as the pane process, in the right cwd, with the given env", async () => {
    const req = await request({ args: ["--log", "AGENT_LOG", 'hello "world" $HOME'] });
    const withLog = {
      ...req,
      command: {
        ...req.command,
        args: ["--log", join(req.cwd, "agent.log"), 'hello "world" $HOME'],
      },
    };
    const handle = await launchSession(tmux.client, tmux.paths.sessions, withLog);
    expect(handle).toEqual({
      taskId: req.taskId,
      tmuxSession: `agn-${req.taskId}`,
      tmuxSocket: tmux.socketName,
      // A fresh id per launch: the session name is reused by a resume, this never is.
      launchId: expect.stringMatching(/^[a-km-np-z2-9]{10}$/),
      cwd: req.cwd,
    });
    await waitFor("the agent logs that it started", async () =>
      (await logOf(req)).includes("ready"),
    );
    const log = await logOf(req);
    expect(log).toContain('prompt: hello "world" $HOME');
    expect(log).toContain("AGN_TEST=1");
    expect(log).toMatch(new RegExp(`cwd=(/private)?${req.cwd}`));
    expect(await hasSession(tmux.client, handle.tmuxSession)).toBe(true);
    expect(await paneDead(tmux.client, handle.tmuxSession)).toBe(false);
    expect(await panePid(tmux.client, handle.tmuxSession)).toBeGreaterThan(0);
  });

  it("delivers a CRLF prompt as three lines inside one bracketed paste", async () => {
    const req = await request({ promptAfterStart: "first line\r\nsecond line\rthird line" });
    await launchSession(tmux.client, tmux.paths.sessions, req);
    await waitFor("the third line arrives", async () => (await logOf(req)).includes("third line"));
    const lines = (await logOf(req)).split("\n");
    expect(lines).toContainEqual("line: \u001b[200~first line");
    expect(lines).toContainEqual("line: second line");
    expect(lines).toContainEqual("line: third line\u001b[201~");
  });

  it("refuses to start a second session for a task that is already running", async () => {
    const req = await request();
    await launchSession(tmux.client, tmux.paths.sessions, req);
    await expect(launchSession(tmux.client, tmux.paths.sessions, req)).rejects.toMatchObject({
      name: "ExecutorError",
      code: "session-exists",
    });
  });

  it("takes over a session whose pane has died", async () => {
    const req = await request({ args: [], promptAfterStart: null });
    const first = {
      ...req,
      command: { ...req.command, args: ["--log", join(req.cwd, "agent.log"), "--exit-after", "1"] },
    };
    await launchSession(tmux.client, tmux.paths.sessions, first);
    await waitFor(
      "the pane dies",
      async () => (await paneDead(tmux.client, `agn-${req.taskId}`)) === true,
    );
    const again = await launchSession(tmux.client, tmux.paths.sessions, first);
    expect(again.tmuxSession).toBe(`agn-${req.taskId}`);
    expect(await paneDead(tmux.client, again.tmuxSession)).toBe(false);
  });

  it("removes a stale exit file left under the session name before starting again", async () => {
    // A resume reuses the deterministic session name; a file left from the run before this one
    // must not be read as this run's death the moment the new pane's own hook is armed.
    const req = await request({ args: [], promptAfterStart: null });
    const name = `agn-${req.taskId}`;
    const exitFile = join(tmux.paths.sessions, `${name}.exit`);
    await mkdir(tmux.paths.sessions, { recursive: true });
    await writeFile(exitFile, "1 \n");

    await launchSession(tmux.client, tmux.paths.sessions, req);

    await expect(stat(exitFile)).rejects.toThrowError();
    expect(await hasSession(tmux.client, name)).toBe(true);
    expect(await paneDead(tmux.client, name)).toBe(false);
  });

  it("says the working directory is missing, and creates no session", async () => {
    const req = await request();
    const gone = { ...req, cwd: join(req.cwd, "not-here") };
    await expect(launchSession(tmux.client, tmux.paths.sessions, gone)).rejects.toMatchObject({
      code: "cwd-missing",
    });
    expect(await hasSession(tmux.client, `agn-${req.taskId}`)).toBe(false);
  });
});
