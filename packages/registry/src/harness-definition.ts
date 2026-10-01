import type { LimitSource, McpTargetFile, Plan, Route } from "@agnostic/core";
import type { HarnessIdentity } from "./harness-identity.js";

export type Tier = 1 | 2;

export type LoginState = "logged-in" | "logged-out" | "unknown";

/** How a harness takes the first prompt: on the command line, behind a flag, or typed once it is up. */
export type PromptDelivery =
  | { kind: "argv"; separator?: "--" }
  | { kind: "flag"; flag: string }
  | { kind: "type-after-start" };

/**
 * Where a harness reads the hook agn installs: the family it belongs to and the file or directory
 * that family keeps its hooks in (ADR 035). Paths are relative to the user's home unless `scope`
 * is `"repo"`. The events, their status mapping and the write format per member belong to the
 * hooks package; this row says only which file to open.
 */
export type HookMechanism =
  | { container: "settings-json"; file: string; scope: "repo" | "user" }
  | { container: "codex-hooks"; file: ".codex/hooks.json" }
  | { container: "hooks-toml"; file: string }
  // The CLI merges every *.json in the directory, so agn owns `<dir>/agn.json` and nothing else.
  | { container: "hooks-dir"; dir: string }
  | { container: "pi-extension"; dir: string }
  | { container: "opencode-plugin"; dir: string };

/**
 * The payload key a hook reports its session under, so a later run can resume it. `form` is
 * `"file"` when the value is the transcript path the CLI resumes from rather than an id.
 */
export type SessionCapture = { source: "hook"; key: string; form: "id" | "file" };

/** How a session is handed back to the harness, and how the daemon checks it is still there. */
export type ResumeSpec = {
  args: (session: string) => string[];
  /**
   * `transcript-name`: a file named after the id under the row's transcripts directory.
   * `transcript-path`: the session is itself a path, which has to sit inside it. `unchecked`: agn cannot
   * tell, so a native resume is tried rather than refused.
   */
  evidence: "transcript-name" | "transcript-path" | "unchecked";
};

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

/**
 * The one-launch arguments that tell a harness to trust a worktree agn made. An argument builder
 * rather than a path template, because Codex needs the path quoted inside a TOML key and a harness
 * that cannot express the path at all has to answer with nothing.
 */
export type WorktreeTrust = { args: (worktreePath: string) => string[] };

/**
 * Where a harness's token counts come from: a directory of transcripts under the user's home, or
 * an event its hook reports. Null on a row agn cannot count tokens for at all.
 */
export type UsageSource = { kind: "transcripts"; dir: string } | { kind: "hook"; event: string };

/** How agn recognises a one-shot read-only run of this harness in a command line. */
export type HeadlessDetect =
  /** `--print` and `--output-format=json` both count; `beforeSeparator` stops at a `--`. */
  | { kind: "flag"; flags: string[]; beforeSeparator: boolean }
  /** The first operand after the binary, as in `codex exec`. */
  | { kind: "subcommand"; name: string };

export type HarnessDefinition = HarnessIdentity & {
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
  /** How a session is resumed; null means a fresh start with the task's context instead. */
  resume: ResumeSpec | null;
  sessionCapture: SessionCapture | null;
  hooks: HookMechanism | null;
  /** Relative to home; `detect-login.ts` knows how to read each one. */
  authFile: string | null;
  planSource: PlanSource | null;
  usageSource: UsageSource | null;
  /** Where this harness reports its plan's own meter; null for one that reports none. */
  limitSource: LimitSource | null;
  /** Null for a harness that needs no extra argument to run in a worktree agn made. */
  worktreeTrust: WorktreeTrust | null;
  /** The file this harness reads MCP servers from; null for one that reads none. */
  mcp: Omit<McpTargetFile, "harness"> | null;
  headlessDetect: HeadlessDetect | null;
  tier: Tier;
};
