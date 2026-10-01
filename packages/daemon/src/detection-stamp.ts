import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessReport } from "@agnostic/core";
import { harnesses } from "@agnostic/registry";

/** The files detection reads to learn a login and a plan, in a fixed order. */
function authFiles(): string[] {
  const files = new Set<string>();
  for (const def of harnesses) {
    if (def.authFile) {
      files.add(def.authFile);
    }
    if (def.planSource) {
      files.add(def.planSource.file);
    }
  }
  return [...files];
}

/**
 * A fingerprint of every harness auth file. A re-login or a plan change rewrites one of them, so
 * comparing this against the last detection's is how the cached answer is known to be stale -
 * four stats, rather than shelling out to every harness on every request.
 */
export async function authFilesStamp(home: string): Promise<string> {
  const stamps = await Promise.all(
    authFiles().map(async (file) => `${file}:${await fileStamp(join(home, file))}`),
  );
  return stamps.join("|");
}

/**
 * A fingerprint of the harness binaries one detection resolved: the path it found on PATH, and
 * that file's size and mtime. An upgrade rewrites or relinks the file, which is when a harness's
 * model list can change, so this is what makes the next read re-probe - one stat per harness, and
 * no `--version` run.
 */
export async function harnessBinariesStamp(reports: HarnessReport[]): Promise<string> {
  const stamps = await Promise.all(
    reports.map(async (report) =>
      report.path === null
        ? `${report.harness}:-`
        : `${report.harness}:${report.path}:${await fileStamp(report.path)}`,
    ),
  );
  return stamps.join("|");
}

/** Size and mtime; `-` for a file that is absent or that cannot be read at all. */
async function fileStamp(path: string): Promise<string> {
  try {
    const info = await stat(path);
    return `${info.mtimeMs}:${info.size}`;
  } catch {
    return "-";
  }
}
