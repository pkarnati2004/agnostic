import { readFile } from "node:fs/promises";

/** Missing is a value everywhere under `.ag/`, so only ENOENT becomes null; other errors surface. */
export async function readTextFile(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return null;
    }
    throw cause;
  }
}
