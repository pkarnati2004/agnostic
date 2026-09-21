import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDirectory } from "./is-directory.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agn-is-directory-"));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

describe("isDirectory", () => {
  it("is true for a directory", async () => {
    expect(await isDirectory(dir)).toBe(true);
  });

  it("is false for a file", async () => {
    const file = join(dir, "note.md");
    await writeFile(file, "text", "utf8");
    expect(await isDirectory(file)).toBe(false);
  });

  it("is false for a path that is not there", async () => {
    expect(await isDirectory(join(dir, "gone"))).toBe(false);
  });
});
