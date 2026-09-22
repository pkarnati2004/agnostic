import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type AgnosticPaths, agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { opencodePluginSource } from "./plugin-source.js";

/**
 * OpenCode loads this file and calls one of its two exports, so the tests load it the same way.
 * The cases are Orca's `src/main/opencode/hook-plugin-module-contract.test.ts` and
 * `hook-plugin-lifecycle-delivery.test.ts`, driven by the SDK events under
 * `tests/fixtures/hooks/payloads/opencode/sdk/`.
 */

const SDK = fileURLToPath(
  new URL("../../../../tests/fixtures/hooks/payloads/opencode/sdk/", import.meta.url),
);

type Plugin = { event: (input: { event: unknown }) => Promise<void>; dispose: () => Promise<void> };
type PluginModule = {
  AgnStatusPlugin: (ctx: unknown) => Promise<Plugin>;
  default: { id: string; server: (ctx: unknown) => Promise<Plugin> };
};
type Post = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

const PORT = 59_998;
const TOKEN = "a-token";

let temp = "";
let paths: AgnosticPaths;
let loads = 0;
let posts: Post[] = [];

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
  temp = await mkdtemp(join(tmpdir(), "agn-opencode-plugin-"));
  paths = agnosticPaths(join(temp, ".agnostic"));
  posts = [];
  await mkdir(paths.home, { recursive: true });
  await writeFile(paths.daemon, JSON.stringify({ port: PORT, pid: 1 }), "utf8");
  await writeFile(paths.authToken, TOKEN, "utf8");
  stubFetch(() => Promise.resolve(new Response(null, { status: 200 })));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(temp, { recursive: true, force: true });
});

async function load(harness: "opencode" | "mimo-code"): Promise<PluginModule> {
  loads += 1;
  const file = join(temp, `agn-status-${loads}.mjs`);
  await writeFile(file, opencodePluginSource(paths, harness), "utf8");
  return (await import(pathToFileURL(file).href)) as PluginModule;
}

async function start(harness: "opencode" | "mimo-code" = "opencode"): Promise<Plugin> {
  const module = await load(harness);
  // OpenCode calls the factory with no context while it starts up.
  return await module.AgnStatusPlugin(undefined);
}

async function sdkEvent(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`${SDK}${name}.json`, "utf8")) as unknown;
}

function names(): string[] {
  return posts.map((post) => String(post.body.hook_event_name));
}

describe("the OpenCode plugin source", () => {
  it("offers both exports OpenCode's two loaders look for", async () => {
    const module = await load("opencode");
    expect(typeof module.AgnStatusPlugin).toBe("function");
    expect(module.default.id).toBe("agn-status");
    expect(typeof module.default.server).toBe("function");
    await expect(module.default.server(undefined)).resolves.toMatchObject({
      event: expect.any(Function),
      dispose: expect.any(Function),
    });
  });

  it("reports a session it started, and posts to the route of its own harness", async () => {
    const plugin = await start();
    await plugin.event({ event: await sdkEvent("session-created") });
    expect(posts[0]?.url).toBe(`http://127.0.0.1:${PORT}/hooks/opencode`);
    expect(posts[0]?.body).toMatchObject({
      hook_event_name: "SessionStart",
      sessionID: "ses_root",
    });
  });

  it("says nothing about a session Mimo Code started, which announces none", async () => {
    const plugin = await start("mimo-code");
    await plugin.event({ event: await sdkEvent("session-created") });
    expect(posts).toEqual([]);
    await plugin.event({ event: await sdkEvent("session-status-busy") });
    expect(posts[0]?.url).toBe(`http://127.0.0.1:${PORT}/hooks/mimo-code`);
    expect(names()).toEqual(["SessionBusy"]);
  });

  it("maps the session's own status, and the deprecated idle event with it", async () => {
    const plugin = await start();
    await plugin.event({ event: await sdkEvent("session-created") });
    await plugin.event({ event: await sdkEvent("session-status-busy") });
    await plugin.event({ event: await sdkEvent("permission-asked") });
    await plugin.event({ event: await sdkEvent("session-status-idle") });
    await plugin.event({ event: await sdkEvent("session-idle") });
    await plugin.event({ event: await sdkEvent("session-error") });
    expect(names()).toEqual([
      "SessionStart",
      "SessionBusy",
      "PermissionRequest",
      "SessionIdle",
      "SessionIdle",
    ]);
  });

  it("drops a child session's own lifecycle, which rolls up to the one the user started", async () => {
    const plugin = await start();
    await plugin.event({ event: await sdkEvent("session-created") });
    await plugin.event({ event: await sdkEvent("session-created-child") });
    await plugin.event({ event: await sdkEvent("session-status-busy-child") });
    expect(names()).toEqual(["SessionStart"]);
  });

  it("reports a session it has never seen, because it can be loaded mid-session", async () => {
    const plugin = await start();
    await plugin.event({ event: await sdkEvent("session-status-busy") });
    expect(names()).toEqual(["SessionBusy"]);
  });

  it("closes a busy session on the way out, and posts nothing twice", async () => {
    const plugin = await start();
    await plugin.event({ event: await sdkEvent("session-status-busy") });
    await plugin.dispose();
    await plugin.dispose();
    expect(names()).toEqual(["SessionBusy", "SessionIdle"]);
    expect(posts[1]?.body.sessionID).toBe("ses_root");
  });

  it("leaves an idle session alone on the way out, and stops reporting once closed", async () => {
    const plugin = await start();
    await plugin.event({ event: await sdkEvent("session-status-idle") });
    await plugin.dispose();
    await plugin.event({ event: await sdkEvent("session-status-busy") });
    expect(names()).toEqual(["SessionIdle"]);
  });

  it("bakes both paths in and neither the port nor the token", () => {
    const source = opencodePluginSource(paths, "opencode");
    expect(source).toContain(JSON.stringify(paths.daemon));
    expect(source).toContain(JSON.stringify(paths.authToken));
    expect(source).not.toContain(TOKEN);
    expect(source).not.toContain(String(PORT));
  });

  it("spells the token only as the bearer header, and posts nowhere but the daemon", async () => {
    const plugin = await start();
    await plugin.event({ event: await sdkEvent("session-status-busy") });

    const post = posts[0];
    expect(post?.url).toBe(`http://127.0.0.1:${PORT}/hooks/opencode`);
    expect(post?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const { Authorization: _bearer, ...rest } = post?.headers ?? {};
    expect(JSON.stringify({ url: post?.url, rest, body: post?.body })).not.toContain(TOKEN);
  });

  it("keeps OpenCode running when the daemon refuses the post", async () => {
    stubFetch(() => Promise.reject(new Error("connection refused")));
    const plugin = await start();

    const posted = plugin.event({ event: await sdkEvent("session-status-busy") });
    await expect(posted).resolves.toBeUndefined();
    await expect(plugin.dispose()).resolves.toBeUndefined();
    expect(posts).toHaveLength(2);
  });

  it("holds one post in flight and one waiting, whatever the burst behind them", async () => {
    let release = (): void => {};
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 200 }));
        }),
    );
    const plugin = await start();
    const busy = (id: string): unknown => ({
      type: "session.status",
      properties: { sessionID: id, status: { type: "busy" } },
    });
    // The first post never answers, so the nine behind it queue and only the last one survives.
    void plugin.event({ event: busy("ses_0") });
    for (let at = 1; at <= 9; at += 1) {
      await plugin.event({ event: busy(`ses_${at}`) });
    }

    expect(posts).toHaveLength(1);
    release();
    await new Promise((resume) => setTimeout(resume, 0));
    expect(posts).toHaveLength(2);
    expect(posts[1]?.body.sessionID).toBe("ses_9");
  });
});
