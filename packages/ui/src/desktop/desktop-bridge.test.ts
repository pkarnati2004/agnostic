import { describe, expect, it } from "vitest";
import { desktopBridge } from "./desktop-bridge";

describe("desktopBridge", () => {
  it("is null in a browser, where nothing set window.agnostic", () => {
    expect(desktopBridge({})).toBeNull();
  });

  it("is null for an object without a pickFolder function", () => {
    expect(desktopBridge({ agnostic: {} })).toBeNull();
    expect(desktopBridge({ agnostic: { pickFolder: "/tmp" } })).toBeNull();
    expect(desktopBridge({ agnostic: null })).toBeNull();
  });

  it("is the bridge itself when pickFolder is a function", () => {
    const bridge = { pickFolder: () => Promise.resolve(null) };
    expect(desktopBridge({ agnostic: bridge })).toBe(bridge);
  });
});
