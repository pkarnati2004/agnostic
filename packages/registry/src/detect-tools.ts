import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolReport } from "@agnostic/core";
import { findOnPath, readVersion } from "./detect-binary.js";

export type DetectToolsOptions = {
  env: Record<string, string>;
  home: string;
  versionTimeoutMs?: number;
};

const VERSION_TIMEOUT_MS = 5_000;

/** Where the GitHub CLI records the hosts it is logged in to; one file for every host. */
const GH_HOSTS = join(".config", "gh", "hosts.yml");

/** A host entry carries the account name and, unless the keyring holds it, the token itself. */
const LOGGED_IN = /^\s*(oauth_token|user):/m;

/**
 * The tools that are not harnesses but that agn reports on. `gh` is the only one in v0: chunk 13
 * opens pull requests with it. Login is read from gh's own file and never from `gh auth status`,
 * which calls the network (ADR 002).
 */
export async function detectTools(opts: DetectToolsOptions): Promise<ToolReport[]> {
  const path = await findOnPath(["gh"], opts.env.PATH ?? "");
  if (path === null) {
    return [{ tool: "gh", path: null, version: null, login: "unknown" }];
  }
  return [
    {
      tool: "gh",
      path,
      version: await readVersion(path, opts.versionTimeoutMs ?? VERSION_TIMEOUT_MS),
      login: await ghLogin(opts.home),
    },
  ];
}

async function ghLogin(home: string): Promise<ToolReport["login"]> {
  const hosts = await readFile(join(home, GH_HOSTS), "utf8").catch(() => null);
  if (hosts === null) {
    // gh can also authenticate from GH_TOKEN, which leaves no file: absent proves nothing.
    return "unknown";
  }
  return LOGGED_IN.test(hosts) ? "logged-in" : "logged-out";
}
