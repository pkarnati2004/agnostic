import type { HarnessId, Plan, Route } from "@agnostic/core";

export type Tier = 1 | 2;

export type LoginState = "logged-in" | "logged-out" | "unknown";

/** How a harness takes the first prompt: on the command line, behind a flag, or typed once it is up. */
export type PromptDelivery =
  | { kind: "argv"; separator?: "--" }
  | { kind: "flag"; flag: string }
  | { kind: "type-after-start" };

/** Where a harness lets us install a hook; chunk 9 owns the installers. */
export type HookMethod = "claude-settings" | "codex-hooks" | "pi-extension" | "opencode-plugin";

/** The payload key a hook reports its session under, so a later run can resume it. */
export type SessionCapture = { source: "hook"; key: string };

/** A harness's own model-listing command. `parse` reads its stdout and returns ids for `--model`. */
export type ModelProbe = {
  args: string[];
  stdin: string | null;
  parse: (stdout: string) => string[];
};

/**
 * Where the user's plan can be read: a file under home and the one field in it that names a tier.
 * Null for a harness billed per provider key, which has no plan to read.
 */
export type PlanSource = { file: string; parse: (contents: unknown) => Plan | null };

export type HarnessDefinition = {
  id: HarnessId;
  name: string;
  binary: string;
  /** Other executable names that mean the same harness; any of them on PATH counts as installed. */
  aliases: string[];
  /** Exact process basenames plus prefixes such as `codex-` for packaged binaries; chunk 8 reads it. */
  processNames: string[];
  /** Tokens after the binary for a bare interactive start, e.g. `["chat", "--tui"]`. */
  launch: string[];
  /** Tokens after the binary for one read-only answer on stdout, prompt on stdin; null = no headless form. */
  headless: string[] | null;
  prompt: PromptDelivery;
  modelFlag: string | null;
  modelSource: ModelProbe | null;
  /** Routes `launchSpec` can build for this harness; `native` is always first. */
  routes: Route[];
  /** Args after the binary that resume a session; null means a fresh start with context instead. */
  resume: ((sessionId: string) => string[]) | null;
  sessionCapture: SessionCapture | null;
  hooks: HookMethod | null;
  /** Relative to home; `detect-login.ts` knows how to read each one. */
  authFile: string | null;
  planSource: PlanSource | null;
  /** Relative to home; chunk 14 scans it for usage. */
  transcriptsDir: string | null;
  tier: Tier;
};
