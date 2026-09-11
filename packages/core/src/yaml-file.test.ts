import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readYamlFile, writeYamlFile } from "./yaml-file.js";

const Schema = z.strictObject({ name: z.string(), count: z.number() });
const HINT = "Fix the file or delete it to use the defaults.";

async function tempFile(contents?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agnostic-yaml-file-"));
  const file = join(dir, "nested", "settings.yaml");
  if (contents !== undefined) {
    await writeYamlFile(file, {}, "placeholder");
    await writeFile(file, contents, "utf8");
  }
  return file;
}

describe("readYamlFile", () => {
  it("returns null when the file is not there", async () => {
    expect(await readYamlFile(await tempFile(), Schema, HINT)).toBeNull();
  });

  it("reads a file that matches the schema", async () => {
    const file = await tempFile("name: agnostic\ncount: 2\n");
    expect(await readYamlFile(file, Schema, HINT)).toEqual({ name: "agnostic", count: 2 });
  });

  it("reports a yaml syntax error against the file it came from", async () => {
    const file = await tempFile('name: "agnostic\ncount: 2\n');
    await expect(readYamlFile(file, Schema, HINT)).rejects.toMatchObject({
      name: "ConfigError",
      code: "ag-file-malformed",
      file,
      hint: HINT,
    });
  });

  it("names the key that failed the schema", async () => {
    const file = await tempFile("name: agnostic\ncount: two\n");
    await expect(readYamlFile(file, Schema, HINT)).rejects.toMatchObject({
      code: "ag-file-invalid",
      file,
      hint: HINT,
      message: expect.stringContaining("count"),
    });
  });
});

describe("writeYamlFile", () => {
  it("creates the directory, leads with the header comment and round-trips", async () => {
    const file = await tempFile();
    await writeYamlFile(file, { name: "agnostic", count: 2 }, "what this file is for");
    const text = await readFile(file, "utf8");
    expect(text.split("\n")[0]).toBe("# what this file is for");
    expect(text.endsWith("\n")).toBe(true);
    expect(await readYamlFile(file, Schema, HINT)).toEqual({ name: "agnostic", count: 2 });
  });
});
