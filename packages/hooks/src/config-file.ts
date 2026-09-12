import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configUnwritable } from "./error.js";

const DEFAULT_MODE = 0o644;

/**
 * The one way agn writes a file a harness owns: a temp file in the same directory, then a rename,
 * so a harness reading the file mid-install sees one whole version or the other. The mode of an
 * existing file is kept, and anything the filesystem refuses becomes `hook-config-unwritable`.
 */
export async function writeConfigFile(file: string, text: string): Promise<void> {
  const temp = join(dirname(file), `.agn-${process.pid}.tmp`);
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temp, text, { encoding: "utf8", mode: await modeOf(file) });
    await rename(temp, file);
  } catch (cause) {
    throw configUnwritable(file, cause);
  }
}

async function modeOf(file: string): Promise<number> {
  return stat(file).then(
    (stats) => stats.mode & 0o777,
    () => DEFAULT_MODE,
  );
}
