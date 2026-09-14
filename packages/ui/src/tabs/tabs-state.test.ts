import { describe, expect, it } from "vitest";
import { NO_TABS, readTabs, TABS_KEY, tabsReducer, writeTabs } from "./tabs-state";

const three = { open: ["a", "b", "c"], active: "b" };

describe("tabsReducer", () => {
  it("opens a task once and activates it", () => {
    const first = tabsReducer(NO_TABS, { type: "open", taskId: "a" });
    expect(first).toEqual({ open: ["a"], active: "a" });
    const second = tabsReducer(tabsReducer(first, { type: "open", taskId: "b" }), {
      type: "open",
      taskId: "a",
    });
    expect(second).toEqual({ open: ["a", "b"], active: "a" });
  });

  it("activates only a tab that is open", () => {
    expect(tabsReducer(three, { type: "activate", taskId: "c" }).active).toBe("c");
    expect(tabsReducer(three, { type: "activate", taskId: "z" })).toBe(three);
  });

  it("hands the active tab to its right neighbour, then its left, then nothing", () => {
    expect(tabsReducer(three, { type: "close", taskId: "b" })).toEqual({
      open: ["a", "c"],
      active: "c",
    });
    expect(tabsReducer({ open: ["a", "b"], active: "b" }, { type: "close", taskId: "b" })).toEqual({
      open: ["a"],
      active: "a",
    });
    expect(tabsReducer({ open: ["a"], active: "a" }, { type: "close", taskId: "a" })).toEqual({
      open: [],
      active: null,
    });
  });

  it("leaves the active tab alone when another one closes", () => {
    expect(tabsReducer(three, { type: "close", taskId: "a" })).toEqual({
      open: ["b", "c"],
      active: "b",
    });
    expect(tabsReducer(three, { type: "close", taskId: "z" })).toBe(three);
  });

  it("drops tabs for tasks the daemon no longer has", () => {
    expect(tabsReducer(three, { type: "prune", existing: new Set(["a", "c"]) })).toEqual({
      open: ["a", "c"],
      active: "c",
    });
    expect(tabsReducer(three, { type: "prune", existing: new Set(["a", "b", "c"]) })).toBe(three);
  });
});

describe("readTabs", () => {
  const storage = (value: string | null) => ({ getItem: () => value });

  it("starts empty on anything it did not write", () => {
    expect(readTabs(storage(null))).toEqual(NO_TABS);
    expect(readTabs(storage("garbage"))).toEqual(NO_TABS);
    expect(readTabs(storage('{"open":"x"}'))).toEqual(NO_TABS);
    expect(readTabs(storage('{"open":["a",2]}'))).toEqual(NO_TABS);
  });

  it("forgets an active tab that is not open", () => {
    expect(readTabs(storage('{"open":["a"],"active":"b"}'))).toEqual({ open: ["a"], active: null });
  });

  it("round-trips what the page wrote", () => {
    let written: string | null = null;
    const storage = {
      setItem: (_key: string, value: string) => {
        written = value;
      },
    };
    writeTabs(storage, three);
    expect(readTabs({ getItem: () => written })).toEqual(three);
    expect(TABS_KEY).toBe("agn.tabs");
  });
});
