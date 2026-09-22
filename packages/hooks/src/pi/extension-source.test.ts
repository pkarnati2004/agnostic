import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgnosticPaths, agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Handler,
  loadExtension,
  type Post,
  piContext,
  settle,
  writeDaemonFiles,
} from "./test-extension.js";

/**
 * The extension runs inside pi, so it is tested the way pi loads it: written to disk, imported as
 * a module, and handed a `pi` object that records what it registers. The cases are Orca's
 * `src/main/pi/agent-status-extension-source.test.ts`, `agent-status-ui-prompt.test.ts` and
 * `agent-status-extension-omp-lifecycle.test.ts`, checked against our own payloads. What the
 * extension does with the daemon is in `extension-post.test.ts`.
 */

const PORT = 59_999;
const TOKEN = "a-token";

let temp = "";
let paths: AgnosticPaths;
let posts: Post[] = [];
let savedOwner: string | undefined;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "agn-pi-extension-"));
  paths = agnosticPaths(join(temp, ".agnostic"));
  posts = [];
  savedOwner = process.env.AGN_PI_STATUS_OWNER;
  delete process.env.AGN_PI_STATUS_OWNER;
  vi.stubEnv("AGN_TASK_ID", "task_1");
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    posts.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    return Promise.resolve(new Response(null, { status: 200 }));
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (savedOwner === undefined) {
    delete process.env.AGN_PI_STATUS_OWNER;
  } else {
    process.env.AGN_PI_STATUS_OWNER = savedOwner;
  }
  await rm(temp, { recursive: true, force: true });
});

function register(kind: "pi" | "omp"): Promise<Map<string, Handler>> {
  return loadExtension(temp, paths, kind);
}

function context(sessionFile: string, isIdle?: boolean): unknown {
  return piContext(sessionFile, isIdle);
}

/** A host whose session is already torn down: every method the extension calls on it throws. */
function brokenContext(): unknown {
  const throws = (): never => {
    throw new Error("this session is gone");
  };
  return { sessionManager: { getSessionId: throws, getSessionFile: throws }, isIdle: throws };
}

describe("the Pi extension source", () => {
  it("registers pi's events, and OMP's approval pair instead of the modal pair", async () => {
    expect([...(await register("pi")).keys()].sort()).toEqual([
      "agent_end",
      "agent_settled",
      "agent_start",
      "before_agent_start",
      "message_end",
      "session_start",
      "tool_call",
      "tool_execution_end",
      "tool_execution_start",
      "ui_prompt_end",
      "ui_prompt_start",
    ]);
    expect([...(await register("omp")).keys()].sort()).toEqual([
      "agent_end",
      "agent_settled",
      "agent_start",
      "before_agent_start",
      "message_end",
      "tool_approval_requested",
      "tool_approval_resolved",
      "tool_call",
      "tool_execution_end",
      "tool_execution_start",
    ]);
  });

  it("registers nothing in a child process another pi owns", async () => {
    process.env.AGN_PI_STATUS_OWNER = "999999";
    expect((await register("pi")).size).toBe(0);
  });

  it("reports the transcript path only once pi has written the file", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const missing = join(temp, "missing.jsonl");
    const written = join(temp, "written.jsonl");
    await writeFile(written, "", "utf8");
    const handlers = await register("pi");
    handlers.get("agent_start")?.({}, context(missing));
    await settle();
    expect(posts[0]?.body).not.toHaveProperty("session_file");
    expect(posts[0]?.body.session_id).toBe("pi-abc");
    handlers.get("agent_start")?.({}, context(written));
    await settle();
    expect(posts[1]?.body.session_file).toBe(written);
  });

  it("reports OMP's session whatever the transcript file is doing", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register("omp");
    handlers.get("agent_start")?.({}, context(join(temp, "missing.jsonl")));
    await settle();
    expect(posts[0]?.body.session_id).toBe("pi-abc");
  });

  it("posts without the session when pi's own session manager throws at it", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    for (const kind of ["pi", "omp"] as const) {
      const handlers = await register(kind);
      for (const handler of handlers.values()) {
        expect(() => handler({ message: { role: "assistant" } }, brokenContext())).not.toThrow();
      }
      await settle();
    }

    // The status still gets through; only the id and the file it could not read are missing.
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(post.body).not.toHaveProperty("session_id");
      expect(post.body).not.toHaveProperty("session_file");
      expect(post.body.hook_event_name).toEqual(expect.any(String));
    }
  });

  it("treats a reload as no turn boundary", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register("pi");
    handlers.get("session_start")?.({ reason: "reload" }, context(join(temp, "missing.jsonl")));
    await settle();
    expect(posts).toEqual([]);
    handlers.get("session_start")?.({}, context(join(temp, "missing.jsonl")));
    await settle();
    expect(posts.map((post) => post.body.hook_event_name)).toEqual(["session_start"]);
  });

  it("ends a turn once, and not at all while pi means to continue", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register("pi");
    const ctx = context(join(temp, "missing.jsonl"));
    handlers.get("agent_start")?.({}, ctx);
    handlers.get("agent_end")?.({ willContinue: true }, ctx);
    await settle();
    expect(posts.map((post) => post.body.hook_event_name)).toEqual(["agent_start"]);
    handlers.get("agent_settled")?.({}, ctx);
    await settle();
    handlers.get("agent_end")?.({}, ctx);
    await settle();
    expect(posts.map((post) => post.body.hook_event_name)).toEqual(["agent_start", "agent_end"]);
  });

  it("reports the modal's own idle flag when it closes", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register("pi");
    handlers.get("ui_prompt_start")?.({}, context(join(temp, "missing.jsonl")));
    await settle();
    handlers.get("ui_prompt_end")?.({}, context(join(temp, "missing.jsonl"), true));
    await settle();
    expect(posts.map((post) => post.body.hook_event_name)).toEqual([
      "ui_prompt_start",
      "ui_prompt_end",
    ]);
    expect(posts[1]?.body.is_idle).toBe(true);
  });

  it("posts the tool name a question blocks on", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register("pi");
    handlers.get("tool_call")?.({ toolName: "ask_user_question" }, context(join(temp, "no.jsonl")));
    await settle();
    expect(posts[0]?.body.tool_name).toBe("ask_user_question");
  });

  it("posts OMP's approval question and its answer", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register("omp");
    const ctx = context(join(temp, "missing.jsonl"));
    handlers.get("tool_approval_requested")?.({ toolName: "bash" }, ctx);
    await settle();
    handlers.get("tool_approval_resolved")?.({ toolName: "bash", approved: true }, ctx);
    await settle();
    expect(posts.map((post) => post.body.hook_event_name)).toEqual([
      "tool_approval_requested",
      "tool_approval_resolved",
    ]);
    expect(posts[1]?.body.approved).toBe(true);
  });
});
