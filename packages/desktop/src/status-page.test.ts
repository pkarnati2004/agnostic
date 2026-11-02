import { describe, expect, it } from "vitest";
import { statusUrl } from "./status-page.js";

function query(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

describe("statusUrl", () => {
  const file = "/Applications/agnostic.app/Contents/Resources/app/status.html";

  it("is a file URL to the page", () => {
    const url = new URL(statusUrl(file, { kind: "starting" }));
    expect(url.protocol).toBe("file:");
    expect(url.pathname).toBe(file);
    expect(query(url.href)).toEqual({ state: "starting" });
  });

  it("carries the tmux version when one was found, and none otherwise", () => {
    expect(query(statusUrl(file, { kind: "tmux", version: "3.2a" }))).toEqual({
      state: "tmux",
      version: "3.2a",
    });
    expect(query(statusUrl(file, { kind: "tmux", version: null }))).toEqual({ state: "tmux" });
  });

  it("encodes the log path and the foreign home", () => {
    expect(
      query(statusUrl(file, { kind: "failed", logFile: "/Users/a b/.agnostic/logs/agnd.log" })),
    ).toEqual({
      state: "failed",
      log: "/Users/a b/.agnostic/logs/agnd.log",
    });
    expect(query(statusUrl(file, { kind: "foreign", home: "/tmp/other&x", port: 7431 }))).toEqual({
      state: "foreign",
      home: "/tmp/other&x",
      port: "7431",
    });
  });
});
