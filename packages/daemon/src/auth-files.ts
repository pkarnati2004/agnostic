import { stat } from "node:fs/promises";
import { join } from "node:path";
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
    authFiles().map(async (file) => {
      try {
        const info = await stat(join(home, file));
        return `${file}:${info.mtimeMs}:${info.size}`;
      } catch {
        return `${file}:-`;
      }
    }),
  );
  return stamps.join("|");
}
