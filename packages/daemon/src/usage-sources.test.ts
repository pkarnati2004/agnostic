import { hookInstaller, hookParser } from "@agnostic/hooks";
import { harnesses } from "@agnostic/registry";
import { statusLineParser, transcriptParser } from "@agnostic/usage";
import { describe, expect, it } from "vitest";

/**
 * The registry row says where a harness's usage comes from and the usage package holds the parser
 * that reads it. A row with a source and no parser would report `full` support in doctor and count
 * nothing, so the two sides are pinned to each other here rather than in either package alone.
 */
describe("usage sources and their parsers", () => {
  it("gives every row with a transcripts source a transcript parser", () => {
    for (const def of harnesses.filter((row) => row.usageSource?.kind === "transcripts")) {
      expect(transcriptParser(def.id), def.id).not.toBeNull();
    }
  });

  it("gives every transcript parser a row that names its directory", () => {
    const sources = harnesses.filter((row) => row.usageSource?.kind === "transcripts");
    const parsed = harnesses.filter((row) => transcriptParser(row.id) !== null);

    expect(parsed.map((row) => row.id)).toEqual(sources.map((row) => row.id));
  });

  it("gives every row that reports limits to a status line a status-line parser", () => {
    const reporting = harnesses.filter((row) => row.limitSource === "statusline");

    expect(reporting.length).toBeGreaterThan(0);
    for (const def of reporting) {
      expect(statusLineParser(def.id), def.id).not.toBeNull();
    }
  });

  it("leaves no status-line parser without a row that says the harness reports one", () => {
    for (const def of harnesses.filter((row) => statusLineParser(row.id) !== null)) {
      expect(def.limitSource, def.id).toBe("statusline");
    }
  });

  it("gives every row that reports limits to a status line a writer for its own file", () => {
    // A member without one would otherwise take another member's: the slot's path belongs to the
    // harness, so the member brings the adapter that writes it.
    for (const def of harnesses.filter((row) => row.limitSource === "statusline")) {
      expect(hookInstaller(def.id)?.userStatusLine, def.id).toBeDefined();
    }
  });

  it("gives every row whose tokens come from a hook a parser that reads that hook", () => {
    const hooked = harnesses.filter((row) => row.usageSource?.kind === "hook");

    expect(hooked.length).toBeGreaterThan(0);
    for (const def of hooked) {
      expect(hookParser(def.id), def.id).not.toBeNull();
    }
  });
});
