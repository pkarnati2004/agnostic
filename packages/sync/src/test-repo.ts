import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/", import.meta.url));

export function fixtureRepo(name: string): string {
  return join(FIXTURES, "sync", name);
}

/** The `.ag/mcp.yaml` repos and the target files each of them compiles to. */
export function mcpFixture(...parts: string[]): string {
  return join(FIXTURES, "mcp", ...parts);
}

const copies: string[] = [];

/** A writable copy of one fixture repo; every test that writes works on its own. */
export async function copyFixture(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `agn-sync-${name}-`));
  await cp(fixtureRepo(name), dir, { recursive: true });
  copies.push(dir);
  return dir;
}

export async function removeCopies(): Promise<void> {
  for (const dir of copies.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
}
