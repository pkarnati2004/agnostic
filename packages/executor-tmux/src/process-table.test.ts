import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  descendantsOf,
  parseLsofCwd,
  parsePsOutput,
  processProbe,
  readProcessTable,
} from "./process-table.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/process-table", import.meta.url));

function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURES}/${name}`, "utf8");
}

describe("parsePsOutput", () => {
  it("reads pid, ppid and argv from darwin's ps", async () => {
    const rows = parsePsOutput(await fixture("ps-darwin.txt"));
    expect(rows).toHaveLength(6);
    expect(rows[3]).toEqual({
      pid: 1204,
      ppid: 871,
      args: ["node", "/Users/dev/.nvm/versions/node/v22.23.2/bin/claude", "--model", "sonnet"],
    });
  });

  it("reads linux's wider columns and a login shell's argv", async () => {
    const rows = parsePsOutput(await fixture("ps-linux.txt"));
    expect(rows[2]).toEqual({ pid: 912, ppid: 640, args: ["-bash"] });
    expect(rows.at(-1)).toEqual({ pid: 1180, ppid: 1, args: ["codex"] });
  });

  it("splits an argument that contains a space, because ps does not quote", async () => {
    const rows = parsePsOutput(await fixture("ps-darwin.txt"));
    expect(rows[4]?.args[0]).toBe("/Users/dev/Library/Application");
  });

  it("skips a line with no command", () => {
    expect(parsePsOutput("  1  0  \n\n  2 1 /bin/sh\n")).toEqual([
      { pid: 2, ppid: 1, args: ["/bin/sh"] },
    ]);
  });
});

describe("parseLsofCwd", () => {
  it("maps each pid to its cwd, spaces included", async () => {
    const cwds = parseLsofCwd(await fixture("lsof-cwd.txt"));
    expect(cwds.get(1204)).toBe("/Users/dev/code/agnostic");
    expect(cwds.get(1310)).toBe("/Users/dev/code/my project");
    expect(cwds.size).toBe(3);
  });

  it("is empty for output with no pid block", () => {
    expect(parseLsofCwd("")).toEqual(new Map());
  });
});

describe("descendantsOf", () => {
  it("walks children of children", async () => {
    const rows = parsePsOutput(await fixture("ps-darwin.txt"));
    expect(descendantsOf(rows, 502)).toEqual([871, 1204, 1422]);
    expect(descendantsOf(rows, 1204)).toEqual([]);
  });
});

describe("readProcessTable", () => {
  it("finds this test process and its parent", async () => {
    const rows = await readProcessTable();
    const self = rows.find((row) => row.pid === process.pid);
    expect(self?.ppid).toBe(process.ppid);
  });
});

describe("processProbe", () => {
  it("reads the name of a live process and nothing for a pid that is gone", async () => {
    const probe = processProbe();
    expect(await probe.comm(process.pid)).toContain("node");
    expect(probe.alive(process.pid)).toBe(true);
    expect(await probe.comm(2_147_483_5)).toBeNull();
  });
});
