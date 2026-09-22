import { chmod, lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeConfigFile } from "./config-file.js";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agn-config-file-"));
});

afterEach(async () => {
  // A read-only-directory test leaves the mode behind it; restore it before rm cleans up.
  await chmod(dir, 0o755).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

describe("writeConfigFile", () => {
  it("writes a new file that did not exist", async () => {
    const file = join(dir, "settings.json");
    await writeConfigFile(file, '{"a":1}\n');
    expect(await readFile(file, "utf8")).toBe('{"a":1}\n');
  });

  it("keeps the mode of the file it replaces", async () => {
    const file = join(dir, "settings.json");
    await writeFile(file, "{}\n", { mode: 0o600 });
    await writeConfigFile(file, '{"a":1}\n');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("writes through a config file that is a symlink, leaving its target's own content unchanged", async () => {
    const target = join(dir, "real-settings.json");
    await writeFile(target, "{}\n", "utf8");
    const link = join(dir, "settings.json");
    await symlink(target, link);

    await writeConfigFile(link, '{"a":1}\n');

    // The path agn was given now holds the new content, whatever became of the symlink itself.
    expect(await readFile(link, "utf8")).toBe('{"a":1}\n');
    expect((await lstat(link)).isSymbolicLink()).toBe(false);
    // A rename onto a symlink path replaces the symlink entry itself, not the file it pointed to,
    // so the file the link used to point at is untouched.
    expect(await readFile(target, "utf8")).toBe("{}\n");
  });

  it("refuses a file it cannot write, as hook-config-unwritable", async () => {
    const file = join(dir, "settings.json");
    await writeFile(file, "{}\n", "utf8");
    // The write goes through a temp file in the same directory, so a read-only file's own mode does
    // not block it - only a directory with no write permission does.
    await chmod(dir, 0o555);
    await expect(writeConfigFile(file, '{"a":1}\n')).rejects.toMatchObject({
      code: "hook-config-unwritable",
    });
  });
});
