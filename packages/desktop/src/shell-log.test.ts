import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { redact, shellLog } from "./shell-log.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "agn-shell-log-"));
  dirs.push(dir);
  return join(dir, "logs", "desktop.log");
}

describe("redact", () => {
  it("replaces every occurrence of the secret", () => {
    expect(redact("a tok b tok", "tok")).toBe("a … b …");
  });

  it("leaves the text alone for an empty secret", () => {
    expect(redact("plain", "")).toBe("plain");
  });
});

describe("shellLog", () => {
  it("writes the line as is with a null secret, creating the directory", () => {
    const file = tempFile();
    shellLog(file, null)("start: home /tmp/x");
    expect(readFileSync(file, "utf8")).toMatch(/^\S+ start: home \/tmp\/x\n$/);
  });

  it("redacts the secret from every line", () => {
    const file = tempFile();
    const log = shellLog(file, "secret-token");
    log("loaded http://127.0.0.1:1/ui#token=secret-token");
    expect(readFileSync(file, "utf8")).not.toContain("secret-token");
  });
});
