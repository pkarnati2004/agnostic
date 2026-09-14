import type { Profile, Task } from "@agnostic/core";
import { RegistryError } from "@agnostic/registry";
import { describe, expect, it } from "vitest";
import { resumeLaunchCommand } from "./launch-command.js";

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "add a --verbose flag",
  prompt: "add a --verbose flag",
  profileId: "claude-code:default:native",
  worktreePath: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  branch: "agn/flag",
  status: "stopped",
  origin: "agn",
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
  session: {
    harness: "claude-code",
    sessionId: "sess-42",
    tmuxSession: null,
    tmuxSocket: null,
    launchId: null,
    pid: null,
    cwd: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
    lastSeenAt: "2026-09-11T10:00:00.000Z",
  },
};

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "claude-code:default:native",
    harness: "claude-code",
    model: null,
    route: "native",
    billing: "subscription",
    available: true,
    evidence: "binary",
    tier: 1,
    ...overrides,
  };
}

const ENV = { PATH: "/opt/bin" };

describe("resumeLaunchCommand", () => {
  it("is null when the task never captured a session id, so the caller composes a fresh prompt", () => {
    const noSession = { ...task, session: { ...task.session, sessionId: null } } as Task;
    expect(resumeLaunchCommand(noSession, profile(), ENV)).toBeNull();
  });

  it("hands the session id back to a harness that supports native resume", () => {
    const command = resumeLaunchCommand(task, profile(), ENV);
    expect(command).toEqual({
      command: "claude",
      args: ["--resume", "sess-42"],
      // The resumed session reports its hooks under the same task as the launch it continues.
      env: { ...ENV, AGN_TASK_ID: task.id },
      promptAfterStart: null,
    });
  });

  it("falls back to fresh when the harness has no resume route at all", () => {
    // Pi's registry entry carries `resume: null` (ADR 008): no hooks capture its session file yet.
    const pi = { ...task, session: { ...task.session, harness: "pi" as const } } as Task;
    expect(resumeLaunchCommand(pi, profile({ id: "pi:default:native", harness: "pi" }), ENV)).toBe(
      null,
    );
  });

  it("falls back to fresh when the recorded route cannot resume by id (Codex on local)", () => {
    const codex = { ...task, session: { ...task.session, harness: "codex" as const } } as Task;
    const local = profile({ id: "codex:default:local", harness: "codex", route: "local" });
    expect(resumeLaunchCommand(codex, local, ENV)).toBeNull();
  });

  it("falls back to fresh when the recorded session id cannot be passed to a harness", () => {
    const invalid = { ...task, session: { ...task.session, sessionId: "-not-a-real-id" } } as Task;
    expect(resumeLaunchCommand(invalid, profile(), ENV)).toBeNull();
  });

  it("lets a provider-key-missing failure propagate instead of falling back", () => {
    const gateway = profile({
      id: "claude-code:default:anthropic-gateway",
      route: "anthropic-gateway",
    });
    expect(() => resumeLaunchCommand(task, gateway, ENV)).toThrowError(
      expect.objectContaining({ code: "provider-key-missing" }),
    );
  });

  it("lets any other registry refusal propagate too", () => {
    // route-unsupported is not in the fallback set: a profile the daemon should never have built.
    const unsupported = profile({ id: "claude-code:default:local", route: "local" });
    expect(() => resumeLaunchCommand(task, unsupported, ENV)).toThrowError(
      expect.objectContaining({ code: "route-unsupported" }),
    );
  });

  it("is a RegistryError in every propagating case", () => {
    const gateway = profile({
      id: "claude-code:default:anthropic-gateway",
      route: "anthropic-gateway",
    });
    try {
      resumeLaunchCommand(task, gateway, ENV);
      throw new Error("expected resumeLaunchCommand to throw");
    } catch (cause) {
      expect(cause).toBeInstanceOf(RegistryError);
    }
  });
});
