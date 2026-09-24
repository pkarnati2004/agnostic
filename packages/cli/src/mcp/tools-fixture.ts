// The rows, the temporary home and the call helper the two tool test files share.
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgnosticPaths,
  agnosticPaths,
  type DaemonClient,
  type RepoListRow,
  type Task,
  type UsageSum,
} from "@agnostic/core";
import type { CliContext } from "../context.js";
import { createTestContext } from "../test-context.js";
import { findTool } from "./tools.js";

export const REPO: RepoListRow = {
  id: "r7k2m4pqrs",
  path: "/work/api",
  kind: "git",
  name: "api",
  addedAt: "2026-09-11T10:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

export const OTHER_REPO: RepoListRow = {
  ...REPO,
  id: "z9q8w7e6r5",
  path: "/work/web",
  name: "web",
};

export const TASK: Task = {
  id: "t3n9v2wxyz",
  repoId: REPO.id,
  title: "add a --verbose flag",
  prompt: "add a --verbose flag",
  profileId: "claude-code:default:native",
  worktreePath: "/w/one",
  branch: "agn/flag",
  status: "running",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

export const USAGE: UsageSum = {
  tokens: 12,
  tokensInput: 8,
  tokensOutput: 4,
  tokensCacheRead: 0,
  tokensCacheWrite: 0,
  costUsd: null,
};

export type Sandbox = { root: string; paths: AgnosticPaths };

/** A home of its own per test, because the cwd under it is how a tool reads its defaults. */
export async function sandbox(): Promise<Sandbox> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "agn-mcp-")));
  return { root, paths: agnosticPaths(join(root, "home")) };
}

export function context(box: Sandbox, client: Partial<DaemonClient>, cwd = box.root) {
  return createTestContext({ client, cwd, paths: box.paths });
}

/** The worktree of `TASK`, which names both its repo and itself. */
export function worktree(box: Sandbox): string {
  return join(box.paths.worktrees, REPO.id, TASK.id);
}

/** What the server does with a `tools/call`: parse the arguments, then run the tool. */
export async function call(ctx: CliContext, name: string, args: unknown = {}): Promise<unknown> {
  const tool = findTool(name);
  if (tool === null) {
    throw new Error(`${name} is not a tool`);
  }
  return await tool.run(ctx, tool.schema.parse(args));
}
