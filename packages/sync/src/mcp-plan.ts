import {
  type HarnessId,
  looksLikeSecret,
  type McpConfig,
  type McpServer,
  type McpSyncRow,
  type McpTargetFile,
  type McpValue,
  type SyncWrite,
} from "@agnostic/core";
import { SyncError } from "./error.js";
import type { McpExisting } from "./mcp-files.js";
import { type McpExistingTarget, type McpSyntaxRow, mcpSyntaxes } from "./mcp-syntax.js";

/** A file outside the repo that this sync would write; `file` is absolute. */
export type McpUserWrite = { harness: HarnessId; file: string; text: string };

export type McpSyncPlan = {
  writes: SyncWrite[];
  userWrites: McpUserWrite[];
  rows: McpSyncRow[];
};

export type McpSyncInputs = {
  config: McpConfig | null;
  repoId: string;
  targets: McpTargetFile[];
  existing: McpExisting;
};

/** One target, the file behind it, and what this sync makes of it. */
type Planned = {
  target: McpTargetFile;
  existing: McpExistingTarget;
  text: string | null;
  rows: McpSyntaxRow[];
};

/**
 * What one sync makes of `.ag/mcp.yaml`. Secrets first: a value that looks like a credential is
 * never written to any target, and the other servers still go out.
 */
export function planMcpSync(inputs: McpSyncInputs): McpSyncPlan {
  const { config, repoId, targets, existing } = inputs;
  const servers = config === null ? null : config.servers.filter((s) => secretIn(s) === null);
  const planned = inRepoFirst(targets).map((target) => plan(target, existing, repoId, servers));
  return {
    writes: planned.flatMap(repoWrite),
    userWrites: planned.flatMap(userWrite),
    rows: config === null ? [] : config.servers.flatMap((server) => rowsFor(server, planned)),
  };
}

/** The order the sync works in and reports in: the repo's own files, then the files outside it. */
function inRepoFirst(targets: McpTargetFile[]): McpTargetFile[] {
  return [
    ...targets.filter((t) => t.scope === "repo"),
    ...targets.filter((t) => t.scope === "user"),
  ];
}

function plan(
  target: McpTargetFile,
  existing: McpExisting,
  repoId: string,
  servers: McpServer[] | null,
): Planned {
  const file = existing.get(target.harness);
  if (file === undefined) {
    throw new SyncError(`agn read no MCP config for ${target.harness}`, {
      code: "mcp-target-unread",
      hint: "Run `agn sync` again; if it persists, report it.",
    });
  }
  return { target, existing: file, ...mcpSyntaxes[target.syntax].plan(file, repoId, servers) };
}

/** Never a conflict: agn owns the entries it names in these files and not the files themselves. */
function repoWrite(planned: Planned): SyncWrite[] {
  const { existing, text } = planned;
  if (planned.target.scope !== "repo" || text === null) {
    return [];
  }
  if (existing.text === null) {
    return [{ file: existing.file, action: "create", content: text, reason: null }];
  }
  const action = existing.text === text ? "unchanged" : "update";
  return [{ file: existing.file, action, content: text, reason: null }];
}

function userWrite(planned: Planned): McpUserWrite[] {
  if (planned.target.scope !== "user" || planned.text === null) {
    return [];
  }
  return [{ harness: planned.target.harness, file: planned.existing.path, text: planned.text }];
}

/** One row per target for this server, the repo's files first, whatever each target made of it. */
function rowsFor(server: McpServer, planned: Planned[]): McpSyncRow[] {
  const secret = secretIn(server);
  if (secret !== null) {
    const reason = `${secret} looks like a secret; write $NAME and set NAME in your shell`;
    return planned.map((target) => ({
      server: server.name,
      action: "skipped",
      reason,
      target: target.target.harness,
      file: target.existing.file,
    }));
  }
  return planned.flatMap((target) =>
    target.rows
      .filter((row) => row.server === server.name)
      .map((row) => ({ ...row, target: target.target.harness, file: target.existing.file })),
  );
}

/** The key or header whose literal value must not be copied into a config file, or null. */
function secretIn(server: McpServer): string | null {
  const values = server.kind === "stdio" ? server.env : server.headers;
  for (const [key, value] of Object.entries<McpValue>(values)) {
    if (value.kind === "literal" && looksLikeSecret(value.value)) {
      return key;
    }
  }
  return null;
}
