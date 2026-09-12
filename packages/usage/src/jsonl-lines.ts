import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * The lines of a `.jsonl` file, streamed: a transcript is routinely hundreds of megabytes and a
 * live session is appended to while it is read, so the last line can be half-written. Callers
 * parse each line themselves and skip the ones that do not parse.
 */
export async function* jsonlLines(path: string): AsyncIterable<{ n: number; text: string }> {
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let n = 0;
  for await (const text of lines) {
    n += 1;
    yield { n, text };
  }
}
