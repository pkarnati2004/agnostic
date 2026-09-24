import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CopyShims = {
  /** A PATH holding these tools and nothing else. */
  dir: string;
  /** What the named tool was handed on stdin, or null when it was never run. */
  received(tool: string): Promise<string | null>;
};

/**
 * Clipboard tools that write what they are given to a file beside them, so a test can see which
 * one `agn pr` reached for and what it handed over. An empty list is a machine with none.
 */
export async function installCopyShims(tools: string[]): Promise<CopyShims> {
  const dir = await mkdtemp(join(tmpdir(), "agn-clipboard-"));
  for (const tool of tools) {
    const file = join(dir, tool);
    await writeFile(file, script(process.execPath, join(dir, `${tool}.txt`)), "utf8");
    await chmod(file, 0o755);
  }
  return {
    dir,
    received: (tool) => readFile(join(dir, `${tool}.txt`), "utf8").catch(() => null),
  };
}

function script(node: string, target: string): string {
  return `#!${node}
const { readFileSync, writeFileSync } = require("node:fs");
writeFileSync(${JSON.stringify(target)}, readFileSync(0, "utf8"));
`;
}
