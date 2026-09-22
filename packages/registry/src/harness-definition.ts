import type { HarnessId, Plan, Route } from "@agnostic/core";

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
   * `transcript-name`: a file named after the id under `transcriptsDir`. `transcript-path`: the
   * session is itself a path, which has to sit inside `transcriptsDir`. `unchecked`: agn cannot
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
  /** How a session is resumed; null means a fresh start with the task's context instead. */
  resume: ResumeSpec | null;
  sessionCapture: SessionCapture | null;
  hooks: HookMechanism | null;
  /** Relative to home; `detect-login.ts` knows how to read each one. */
  authFile: string | null;
  planSource: PlanSource | null;
  /** Relative to home; chunk 14 scans it for usage. */
  transcriptsDir: string | null;
  tier: Tier;
};
