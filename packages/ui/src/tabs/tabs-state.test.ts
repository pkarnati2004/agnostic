import type { RepoListRow, RepoStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import {
  compareIdOf,
  compareTabId,
  NEW_TASK_TAB,
  NO_TABS,
  readTabs,
  TABS_KEY,
  tabbableTasks,
  tabsReducer,
  writeTabs,
} from "./tabs-state";

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
    expect(tabsReducer(three, { type: "prune", keep: new Set(["a", "c"]) })).toEqual({
      open: ["a", "c"],
      active: "c",
    });
    expect(tabsReducer(three, { type: "prune", keep: new Set(["a", "b", "c"]) })).toBe(three);
  });

  it("opens a compare tab like any other and closes it the same way, mixed ids and all", () => {
    const mixed = { open: ["t1", "compare:cmp1", "t2"], active: "t1" };
    const opened = tabsReducer(mixed, { type: "open", taskId: "compare:cmp1" });
    expect(opened).toEqual({ open: mixed.open, active: "compare:cmp1" });

    const reopened = tabsReducer(NO_TABS, { type: "open", taskId: "compare:cmp1" });
    expect(reopened).toEqual({ open: ["compare:cmp1"], active: "compare:cmp1" });

    // Closing the active compare tab hands the front to its right neighbour, a task tab.
    expect(tabsReducer(opened, { type: "close", taskId: "compare:cmp1" })).toEqual({
      open: ["t1", "t2"],
      active: "t2",
    });
    // With nothing to its right, its left neighbour takes over instead.
    const last = { open: ["t1", "compare:cmp1"], active: "compare:cmp1" };
    expect(tabsReducer(last, { type: "close", taskId: "compare:cmp1" })).toEqual({
      open: ["t1"],
      active: "t1",
    });
  });
});

describe("the next-tab binding", () => {
  it("moves one to the right and wraps at the end", () => {
    expect(tabsReducer(three, { type: "next" }).active).toBe("c");
    expect(tabsReducer({ ...three, active: "c" }, { type: "next" }).active).toBe("a");
  });

  it("changes nothing with one tab or none", () => {
    const one = { open: ["a"], active: "a" };
    expect(tabsReducer(one, { type: "next" })).toEqual(one);
    expect(tabsReducer(NO_TABS, { type: "next" })).toEqual(NO_TABS);
  });

  it("leaves the open list alone", () => {
    expect(tabsReducer(three, { type: "next" }).open).toEqual(["a", "b", "c"]);
  });
});

describe("tabbableTasks", () => {
  const repo = (id: string, status: RepoStatus): RepoListRow => ({
    id,
    name: id,
    path: `/tmp/${id}`,
    kind: "git",
    addedAt: "2026-09-01T00:00:00.000Z",
    status,
    testCommand: null,
    pathPresent: true,
  });
  const tasks = {
    a: { repoId: "one", compareId: null },
    b: { repoId: "one", compareId: null },
    c: { repoId: "two", compareId: null },
  };

  it("closes the tabs of a removed repo and hands the active one to its neighbour", () => {
    const keep = tabbableTasks([repo("one", "removed"), repo("two", "active")], tasks);
    expect(tabsReducer(three, { type: "prune", keep })).toEqual({ open: ["c"], active: "c" });
  });

  it("leaves the tabs of a closed repo open", () => {
    const keep = tabbableTasks([repo("one", "archived"), repo("two", "active")], tasks);
    expect(tabsReducer(three, { type: "prune", keep })).toBe(three);
  });

  it("closes the tabs of a repo removed before the page loaded, which no list names", () => {
    expect(tabbableTasks([repo("two", "active")], tasks)).toEqual(new Set([NEW_TASK_TAB, "c"]));
  });

  it("keeps the composer's tab, which belongs to no repo and no task", () => {
    const keep = tabbableTasks([repo("one", "removed")], tasks);
    expect(keep.has(NEW_TASK_TAB)).toBe(true);
    expect(
      tabsReducer({ open: [NEW_TASK_TAB, "a"], active: "a" }, { type: "prune", keep }),
    ).toEqual({ open: [NEW_TASK_TAB], active: NEW_TASK_TAB });
  });

  it("keeps the compare tab of a group whose siblings it keeps, and drops it with them", () => {
    const siblings = {
      a: { repoId: "one", compareId: "cmp1" },
      b: { repoId: "one", compareId: "cmp1" },
      c: { repoId: "two", compareId: null },
    };
    const both = tabbableTasks([repo("one", "active"), repo("two", "active")], siblings);
    expect(both).toEqual(new Set([NEW_TASK_TAB, "a", "b", "c", "compare:cmp1"]));
    const gone = tabbableTasks([repo("one", "removed"), repo("two", "active")], siblings);
    expect(gone).toEqual(new Set([NEW_TASK_TAB, "c"]));
  });

  it("keeps the compare tab while one sibling of the group is still kept", () => {
    // 'a' and 'b' are one compare's siblings; only 'a' survives the repo filter, and that alone
    // is enough to keep 'compare:cmp1' drawn.
    const siblings = {
      a: { repoId: "one", compareId: "cmp1" },
      b: { repoId: "two", compareId: "cmp1" },
    };
    const oneLeft = tabbableTasks([repo("one", "active"), repo("two", "removed")], siblings);
    expect(oneLeft).toEqual(new Set([NEW_TASK_TAB, "a", "compare:cmp1"]));
  });

  it("drops the compare tab once every sibling of the group has left", () => {
    const siblings = {
      a: { repoId: "one", compareId: "cmp1" },
      b: { repoId: "two", compareId: "cmp1" },
    };
    const noneLeft = tabbableTasks([repo("one", "removed"), repo("two", "removed")], siblings);
    expect(noneLeft).toEqual(new Set([NEW_TASK_TAB]));
  });
});

describe("the composer's tab", () => {
  it("opens once and comes to the front on the second ask, keeping what is typed in it", () => {
    const first = tabsReducer(NO_TABS, { type: "open", taskId: NEW_TASK_TAB });
    const second = tabsReducer(tabsReducer(first, { type: "open", taskId: "a" }), {
      type: "open",
      taskId: NEW_TASK_TAB,
    });
    expect(second).toEqual({ open: [NEW_TASK_TAB, "a"], active: NEW_TASK_TAB });
  });
});

describe("compare tab ids", () => {
  it("round-trips a compare id and answers for nothing else", () => {
    expect(compareTabId("cmp1")).toBe("compare:cmp1");
    expect(compareIdOf(compareTabId("cmp1"))).toBe("cmp1");
    expect(compareIdOf("t3n9v2wxyz")).toBeNull();
    expect(compareIdOf("compare:")).toBeNull();
    expect(compareIdOf(null)).toBeNull();
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

  it("reads a list written before compares existed unchanged", () => {
    expect(readTabs(storage('{"open":["a","b"],"active":"b"}'))).toEqual({
      open: ["a", "b"],
      active: "b",
    });
  });

  it("reads a stored compare tab whose group is gone, ready for the load-time prune to drop it", () => {
    // readTabs itself does not know what a compare id stands for - it only checks the shape - so
    // the raw string survives the read; it is `tabbableTasks` plus a "prune" dispatch on load
    // (app.tsx) that drops it once no task in the store names that compareId any longer.
    const stored = readTabs(storage('{"open":["t1","compare:cmp1"],"active":"compare:cmp1"}'));
    expect(stored).toEqual({ open: ["t1", "compare:cmp1"], active: "compare:cmp1" });

    const tasks = { t1: { repoId: "one", compareId: null } };
    const repo: RepoListRow = {
      id: "one",
      name: "one",
      path: "/tmp/one",
      kind: "git",
      addedAt: "2026-09-01T00:00:00.000Z",
      status: "active",
      testCommand: null,
      pathPresent: true,
    };
    const pruned = tabsReducer(stored, { type: "prune", keep: tabbableTasks([repo], tasks) });
    expect(pruned).toEqual({ open: ["t1"], active: "t1" });
  });

  it("round-trips what the page wrote, compare tabs and all", () => {
    let written: string | null = null;
    const storage = {
      setItem: (_key: string, value: string) => {
        written = value;
      },
    };
    const withCompare = { open: ["a", "compare:cmp1"], active: "compare:cmp1" };
    writeTabs(storage, withCompare);
    expect(readTabs({ getItem: () => written })).toEqual(withCompare);
    writeTabs(storage, three);
    expect(readTabs({ getItem: () => written })).toEqual(three);
    expect(TABS_KEY).toBe("agn.tabs");
  });
});
