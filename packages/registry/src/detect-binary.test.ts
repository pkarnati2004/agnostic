import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findOnPath, readVersion } from "./detect-binary.js";

const BIN = fileURLToPath(new URL("../../../tests/fixtures/bin", import.meta.url));

describe("findOnPath", () => {
  it("finds each installed binary under the fixture PATH", async () => {
    for (const name of ["claude", "codex", "pi", "opencode"]) {
      expect(await findOnPath([name], `${BIN}/tier1`)).toBe(`${BIN}/tier1/${name}`);
    }
  });

  it("takes the first hit in PATH order", async () => {
    const path = [`${BIN}/probe`, `${BIN}/tier1`].join(delimiter);
    expect(await findOnPath(["claude"], path)).toBe(`${BIN}/probe/claude`);
  });

  it("accepts any of the names a harness answers to", async () => {
    expect(await findOnPath(["kimi", "kimi-code"], `${BIN}/alias-only`)).toBe(
      `${BIN}/alias-only/kimi-code`,
    );
  });

  it("steps over empty entries and directories that are not there", async () => {
    const path = ["", `${BIN}/does-not-exist`, "", `${BIN}/tier1`].join(delimiter);
    expect(await findOnPath(["codex"], path)).toBe(`${BIN}/tier1/codex`);
  });

  it("ignores a file that is not executable and a directory with nothing in it", async () => {
    expect(await findOnPath(["claude"], `${BIN}/not-executable`)).toBeNull();
    expect(await findOnPath(["claude"], `${BIN}/none`)).toBeNull();
    expect(await findOnPath(["claude"], "")).toBeNull();
  });
});

describe("readVersion", () => {
  it("reads the version number out of whatever the binary prints", async () => {
    expect(await readVersion(`${BIN}/tier1/claude`, 5_000)).toBe("2.1.0");
    expect(await readVersion(`${BIN}/tier1/codex`, 5_000)).toBe("0.50.1");
    expect(await readVersion(`${BIN}/tier1/pi`, 5_000)).toBe("0.14.2");
    expect(await readVersion(`${BIN}/tier1/opencode`, 5_000)).toBe("0.4.9");
  });

  it("has no version for a binary that fails, prints no number, or is missing", async () => {
    expect(await readVersion(`${BIN}/fails/claude`, 5_000)).toBeNull();
    expect(await readVersion(`${BIN}/no-number/pi`, 5_000)).toBeNull();
    expect(await readVersion(`${BIN}/none/codex`, 5_000)).toBeNull();
  });

  it("gives up on a binary that hangs", async () => {
    const started = Date.now();
    expect(await readVersion(`${BIN}/hangs/codex`, 300)).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
