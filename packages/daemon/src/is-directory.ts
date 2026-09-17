import { stat } from "node:fs/promises";

/** A path that is not there, or is not a directory, is the same answer to every caller here. */
export function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}
