import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, spawn } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createContext, writeJson } from "./context.js";
import { stubEntry } from "./test-context.js";

const IO = { out: () => undefined, err: () => undefined };

describe("createContext", () => {
  it("starts with no daemon connection at all", () => {
    const ctx = createContext({
      paths: agnosticPaths("/tmp/agn-test-home"),
      cwd: "/work",
      env: { PATH: "/usr/bin" },
      io: IO,
      entry: stubEntry(),
      spawn,
    });
    expect(ctx.json).toBe(false);
    expect(ctx.exitCode).toBe(0);
    expect(ctx.cwd).toBe("/work");
  });
});

describe("writeJson", () => {
  it("writes the pretty-printed value one line at a time", () => {
    const lines: string[] = [];
    writeJson({ out: (line) => lines.push(line), err: () => undefined }, { repos: [] });
    expect(lines).toEqual(["{", '  "repos": []', "}"]);
    expect(JSON.parse(lines.join("\n"))).toEqual({ repos: [] });
  });
});

describe("client", () => {
  it("connects once and hands the same promise to every caller", async () => {
    const ctx = createContext({
      paths: agnosticPaths(mkdtempSync(join(tmpdir(), "agn-context-"))),
      cwd: "/work",
      env: { PATH: "/usr/bin" },
      io: IO,
      entry: stubEntry(),
      spawn,
    });
    const first = ctx.client();
    expect(ctx.client()).toBe(first);
    // The stub exits 0 without writing daemon.json, which is what a daemon failing to come up does.
    await expect(first).rejects.toThrow("the agn daemon could not be started");
  });
});
