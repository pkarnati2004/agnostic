import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PICK_FOLDER_CHANNEL, RECHECK_CHANNEL } from "./ipc-channels.js";

// Electron is replaced at the module boundary; the preloads only reach it through these two.
const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const send = vi.fn();
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, send },
}));

type Exposed = Record<string, (...args: unknown[]) => unknown>;

async function load(protocol: string, preload: "./preload-workspace.js" | "./preload-status.js") {
  vi.stubGlobal("location", { protocol });
  vi.resetModules();
  await import(preload);
}

function exposed(): { key: string; api: Exposed }[] {
  return exposeInMainWorld.mock.calls.map(([key, api]) => ({ key, api }) as never);
}

beforeEach(() => {
  exposeInMainWorld.mockClear();
  invoke.mockReset();
  send.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("preload-workspace", () => {
  it("exposes pickFolder on the daemon's http page, and it invokes the pick channel", async () => {
    await load("http:", "./preload-workspace.js");
    const [only, ...rest] = exposed();
    expect(rest).toEqual([]);
    expect(only?.key).toBe("agnostic");
    expect(Object.keys(only?.api ?? {})).toEqual(["pickFolder"]);
    invoke.mockResolvedValue("/Users/dev/petal");
    expect(await only?.api.pickFolder?.({ defaultPath: "/Users/dev" })).toBe("/Users/dev/petal");
    expect(invoke).toHaveBeenCalledWith(PICK_FOLDER_CHANNEL, { defaultPath: "/Users/dev" });
  });

  it("exposes nothing on the status page from disk or on any other protocol", async () => {
    for (const protocol of ["file:", "https:", "about:"]) {
      await load(protocol, "./preload-workspace.js");
    }
    expect(exposeInMainWorld).not.toHaveBeenCalled();
  });
});

describe("preload-status", () => {
  it("exposes recheck on the status page, and it sends the recheck channel", async () => {
    await load("file:", "./preload-status.js");
    const [only, ...rest] = exposed();
    expect(rest).toEqual([]);
    expect(only?.key).toBe("agnosticStatus");
    expect(Object.keys(only?.api ?? {})).toEqual(["recheck"]);
    only?.api.recheck?.();
    expect(send).toHaveBeenCalledWith(RECHECK_CHANNEL);
  });

  it("exposes nothing to a page from the web", async () => {
    for (const protocol of ["http:", "https:"]) {
      await load(protocol, "./preload-status.js");
    }
    expect(exposeInMainWorld).not.toHaveBeenCalled();
  });
});
