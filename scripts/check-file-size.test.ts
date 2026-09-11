// The script is an entry point, not a library, so it is exercised the way CI runs it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProcessError, run } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const scriptPath = join(repoRoot, "scripts", "check-file-size.ts");
const tsxPath = join(repoRoot, "node_modules", ".bin", "tsx");

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

// No trailing newline: the script counts lines by splitting on "\n", so a trailing
// newline would add a phantom empty line and throw off the exact counts below.
function fileOfLines(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, i) => `const x${i} = ${i};`).join("\n");
}

describe("scripts/check-file-size.ts", () => {
  it("reports a file over 300 lines and exits non-zero", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "agnostic-file-size-"));
    const srcDir = join(tmpDir, "packages", "sample", "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "too-long.ts"), fileOfLines(301));

    const error = await run(tsxPath, [scriptPath], { cwd: tmpDir }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ProcessError);
    const processError = error as ProcessError;
    expect(processError.exitCode).toBe(1);
    expect(processError.stderr).toContain("too-long.ts: 301 lines (max 300)");
  });

  it("passes when every file is at or under 300 lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "agnostic-file-size-"));
    const srcDir = join(tmpDir, "packages", "sample", "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "fine.ts"), fileOfLines(300));

    const result = await run(tsxPath, [scriptPath], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });
});
