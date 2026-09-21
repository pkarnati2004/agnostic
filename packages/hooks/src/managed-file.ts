import { readFile, rm } from "node:fs/promises";
import { writeConfigFile } from "./config-file.js";
import { HooksError } from "./error.js";

/**
 * The first line of every whole file agn writes into a harness's own extension or plugin
 * directory. It is the only thing that says the file is agn's rather than the user's.
 */
export const AGN_MANAGED_MARKER =
  "// agn-managed: rewritten by agn hooks install; edits here are replaced";

/**
 * A file agn owns whole, in a directory the harness loads everything from. A file of the same
 * name that does not carry the marker belongs to the user and is refused, not replaced.
 */
export async function writeManagedFile(
  file: string,
  text: string,
  marker: string,
): Promise<boolean> {
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing !== null && !ours(existing, marker)) {
    throw notOurs(file);
  }
  if (existing === text) {
    return false;
  }
  await writeConfigFile(file, text);
  return true;
}

/** Removes only what agn wrote: a file the user has taken over stays where it is. */
export async function removeManagedFile(file: string, marker: string): Promise<boolean> {
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing === null || !ours(existing, marker)) {
    return false;
  }
  await rm(file, { force: true });
  return true;
}

function ours(text: string, marker: string): boolean {
  return text.split("\n", 1)[0]?.trim() === marker;
}

function notOurs(file: string): HooksError {
  return new HooksError(`${file} is not agn's`, {
    code: "hook-config-unwritable",
    hint: `Move ${file} aside, then run \`agn hooks install\` again: agn replaces that file only while its first line is agn's own marker.`,
  });
}
