import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGN_MANAGED_MARKER, removeManagedFile, writeManagedFile } from "./managed-file.js";

/** The marker rule is Orca's `src/main/pi/titlebar-extension-service.ts`, which skips a user's
 *  file of the same name; agn refuses it out loud instead. */

const TEXT = `${AGN_MANAGED_MARKER}\nexport default function () {}\n`;

let temp = "";
const file = () => join(temp, "nested", "agn-status.ts");

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "agn-managed-"));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe("a file agn owns whole", () => {
  it("is written into a directory that is not there yet", async () => {
    expect(await writeManagedFile(file(), TEXT, AGN_MANAGED_MARKER)).toBe(true);
    expect(await readFile(file(), "utf8")).toBe(TEXT);
  });

  it("is rewritten only when the text differs", async () => {
    await writeManagedFile(file(), TEXT, AGN_MANAGED_MARKER);
    expect(await writeManagedFile(file(), TEXT, AGN_MANAGED_MARKER)).toBe(false);
    expect(await writeManagedFile(file(), `${TEXT}// more\n`, AGN_MANAGED_MARKER)).toBe(true);
  });

  it("is refused when the file of that name is the user's, down to the byte", async () => {
    await writeManagedFile(file(), TEXT, AGN_MANAGED_MARKER);
    // CRLF, no trailing newline and a byte outside ASCII: a rewrite of any kind would show here.
    const mine = Buffer.from("// mine \u00e9\r\nexport default function () {}", "utf8");
    await writeFile(file(), mine);

    await expect(writeManagedFile(file(), TEXT, AGN_MANAGED_MARKER)).rejects.toMatchObject({
      code: "hook-config-unwritable",
    });
    expect(await readFile(file())).toEqual(mine);
  });

  it("is removed only while it still carries the marker", async () => {
    await writeManagedFile(file(), TEXT, AGN_MANAGED_MARKER);
    expect(await removeManagedFile(file(), AGN_MANAGED_MARKER)).toBe(true);
    expect(await removeManagedFile(file(), AGN_MANAGED_MARKER)).toBe(false);
    await writeFile(file(), "// mine\n", "utf8");
    expect(await removeManagedFile(file(), AGN_MANAGED_MARKER)).toBe(false);
    expect(await readFile(file(), "utf8")).toBe("// mine\n");
  });
});
