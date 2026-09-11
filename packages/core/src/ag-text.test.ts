import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readAgText } from "./ag-text.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/ag", import.meta.url));

describe("readAgText", () => {
  it("returns the text of both files", async () => {
    expect(await readAgText(`${FIXTURES}/complete`, "instructions.md")).toContain("Small commits.");
    expect(await readAgText(`${FIXTURES}/complete`, "decisions.md")).toContain(
      "SQLite over Postgres",
    );
  });

  it("returns null when the repo has no .ag", async () => {
    expect(await readAgText(`${FIXTURES}/none`, "instructions.md")).toBeNull();
    expect(await readAgText(`${FIXTURES}/none`, "decisions.md")).toBeNull();
  });

  it("tells an empty file apart from a missing one", async () => {
    expect(await readAgText(`${FIXTURES}/empty-files`, "instructions.md")).toBe("");
    expect(await readAgText(`${FIXTURES}/empty-files`, "decisions.md")).toBe("");
  });

  it("never trims: agents receive the file as written", async () => {
    const text = await readAgText(`${FIXTURES}/complete`, "instructions.md");
    expect(text?.startsWith("# Instructions")).toBe(true);
    expect(text?.endsWith("\n")).toBe(true);
  });
});
