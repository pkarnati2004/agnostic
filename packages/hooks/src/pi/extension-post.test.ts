import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgnosticPaths, agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { piExtensionSource } from "./extension-source.js";
import {
  type Handler,
  loadExtension,
  type Post,
  piContext,
  settle,
  writeDaemonFiles,
} from "./test-extension.js";

/**
 * What the extension does with the daemon: where it posts, what it carries, and what it does when
 * the daemon is absent, refusing or silent. None of it may reach into the turn pi is having.
 */

const PORT = 59_997;
const TOKEN = "a-token";

let temp = "";
let paths: AgnosticPaths;
let posts: Post[] = [];
let savedOwner: string | undefined;

/** Records the request and hands back whatever the test says the daemon does about it. */
function stubFetch(respond: () => Promise<Response>): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    posts.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    return respond();
  });
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "agn-pi-post-"));
  paths = agnosticPaths(join(temp, ".agnostic"));
  posts = [];
  savedOwner = process.env.AGN_PI_STATUS_OWNER;
  delete process.env.AGN_PI_STATUS_OWNER;
  vi.stubEnv("AGN_TASK_ID", "task_1");
  stubFetch(() => Promise.resolve(new Response(null, { status: 200 })));
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

function register(): Promise<Map<string, Handler>> {
  return loadExtension(temp, paths, "pi");
}

function context(): unknown {
  return piContext(join(temp, "missing.jsonl"));
}

describe("what the Pi extension posts", () => {
  it("bakes both paths in and neither the port nor the token", () => {
    const source = piExtensionSource(paths, "pi");
    expect(source).toContain(JSON.stringify(paths.daemon));
    expect(source).toContain(JSON.stringify(paths.authToken));
    expect(source).not.toContain(TOKEN);
    expect(source).not.toContain(String(PORT));
  });

  it("posts nothing while agn's daemon file is not there", async () => {
    const handlers = await register();
    handlers.get("agent_start")?.({}, context());
    await settle();
    expect(posts).toEqual([]);
  });

  it("carries the task id and the event name, and reaches no address but the daemon's", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register();
    handlers.get("agent_start")?.({}, context());
    await settle();
    handlers.get("ui_prompt_start")?.({}, context());
    await settle();

    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.url).toBe(`http://127.0.0.1:${PORT}/hooks/pi`);
      expect(post.headers["X-Agn-Task-Id"]).toBe("task_1");
    }
    expect(posts[0]?.body.hook_event_name).toBe("agent_start");
    expect(posts[0]?.body.cwd).toBe(process.cwd());
  });

  it("spells the token only as the bearer header", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    const handlers = await register();
    handlers.get("agent_start")?.({}, context());
    await settle();

    const post = posts[0];
    expect(post?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const { Authorization: _bearer, ...rest } = post?.headers ?? {};
    expect(JSON.stringify({ url: post?.url, rest, body: post?.body })).not.toContain(TOKEN);
  });

  it("holds one post in flight and one waiting, whatever the burst behind them", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    let release = (): void => {};
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 200 }));
        }),
    );
    const handlers = await register();
    handlers.get("agent_start")?.({}, context());
    for (let at = 1; at <= 9; at += 1) {
      handlers.get("tool_call")?.({ toolName: `tool-${at}` }, context());
    }
    await settle();

    // Ten events, one request: the nine behind it collapsed into the one waiting slot.
    expect(posts).toHaveLength(1);
    release();
    await settle();
    expect(posts).toHaveLength(2);
    expect(posts[1]?.body.tool_name).toBe("tool-9");
  });

  it("keeps pi's turn going when the daemon refuses the post", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    stubFetch(() => Promise.reject(new Error("connection refused")));
    const handlers = await register();

    expect(() => handlers.get("agent_start")?.({}, context())).not.toThrow();
    await settle();
    expect(posts).toHaveLength(1);
    // The refusal was swallowed, so the next event is posted rather than stuck behind it.
    handlers.get("agent_end")?.({}, context());
    await settle();
    expect(posts).toHaveLength(2);
  });

  it("keeps pi's turn going when the daemon never answers", async () => {
    await writeDaemonFiles(paths, PORT, TOKEN);
    stubFetch(() => new Promise<Response>(() => undefined));
    const handlers = await register();

    expect(() => handlers.get("agent_start")?.({}, context())).not.toThrow();
    expect(() => handlers.get("agent_end")?.({}, context())).not.toThrow();
    await settle();
    expect(posts).toHaveLength(1);
  });
});
