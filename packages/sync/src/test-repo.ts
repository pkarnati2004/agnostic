import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@agnostic/core";
import type { McpSyntaxAdapter } from "./mcp-syntax.js";

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

/**
 * One syntax adapter's plan for a file holding `text`, as `readMcpExisting` would hand it over.
 * The paths are what the plan prints and never opened, so a test names them freely.
 */
export function planFor(
  adapter: McpSyntaxAdapter,
  text: string | null,
  repoId: string,
  servers: McpServer[] | null,
): ReturnType<McpSyntaxAdapter["plan"]> {
  return adapter.plan({ path: "/fixture", file: "fixture", text, blocked: null }, repoId, servers);
}

/** The file that plan would write, or the file as it stands when the plan would write nothing. */
export function textFor(
  adapter: McpSyntaxAdapter,
  text: string | null,
  repoId: string,
  servers: McpServer[],
): string {
  return planFor(adapter, text, repoId, servers).text ?? text ?? "";
}
