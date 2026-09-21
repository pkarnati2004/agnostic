import { stat } from "node:fs/promises";

/** A path that is not there, and a path that is a file, are the same answer to every caller. */
export function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}
