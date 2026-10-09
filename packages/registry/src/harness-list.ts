// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { HarnessId } from "@agnostic/core";
import { codexWorktreeTrustArgs } from "./codex-worktree-trust.js";
import { parseClaudePlan, parseCodexPlan } from "./detect-plan.js";
import { RegistryError } from "./error.js";
import type { HarnessDefinition, PromptDelivery } from "./harness-definition.js";
import { harnessIdentity } from "./harness-identity.js";
import { familyDefinition, familySources } from "./harness-list-families.js";
import { tier2Definition, tier2Sources } from "./harness-list-tier2.js";
import {
  claudeModelListRequest,
  parseClaudeModelList,
  parseCodexModelList,
  parseOpenCodeModelList,
  parsePiModelList,
} from "./model-list-parsers.js";

const argv: PromptDelivery = { kind: "argv" };

/** The harnesses agn both hooks and reads transcripts for; the other tier-1 rows are the families. */
const full: HarnessDefinition[] = [
  {
    ...harnessIdentity("claude-code"),
    binary: "claude",
    aliases: [],
    processNames: ["claude"],
    launch: [],
    // Checked against `claude --help` here: `-p` takes `--output-format` and `--permission-mode`.
    headless: ["-p", "--output-format", "text", "--permission-mode", "plan"],
    prompt: argv,
    modelFlag: "--model",
    modelSource: {
      args: ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"],
      stdin: claudeModelListRequest,
      parse: parseClaudeModelList,
    },
    routes: ["native", "anthropic-gateway"],
    resume: { args: (id) => ["--resume", id], evidence: "transcript-name" },
    sessionCapture: { source: "hook", key: "session_id", form: "id" },
    hooks: { container: "settings-json", file: ".claude/settings.local.json", scope: "repo" },
    authFile: ".claude.json",
    planSource: { file: ".claude.json", parse: parseClaudePlan },
    usageSource: { kind: "transcripts", dir: ".claude/projects" },
    limitSource: "statusline",
    worktreeTrust: null,
    mcp: { file: ".mcp.json", scope: "repo", syntax: "mcp-json" },
    headlessDetect: {
      kind: "flag",
      flags: ["-p", "--print", "--output-format"],
      beforeSeparator: true,
    },
    tier: 1,
  },
  {
    ...harnessIdentity("codex"),
    binary: "codex",
    aliases: [],
    // node-pty reports Codex's packaged platform binary, e.g. `codex-aarch64-apple-darwin`.
    processNames: ["codex", "codex-"],
    launch: [],
    // `exec -s read-only` is unverified here (no codex installed): drop a flag this build rejects.
    headless: ["exec", "--skip-git-repo-check", "-s", "read-only"],
    prompt: argv,
    modelFlag: "-m",
    modelSource: { args: ["debug", "models"], stdin: null, parse: parseCodexModelList },
    routes: ["native", "local"],
    resume: { args: (id) => ["resume", id], evidence: "transcript-name" },
    sessionCapture: { source: "hook", key: "session_id", form: "id" },
    hooks: { container: "codex-hooks", file: ".codex/hooks.json" },
    authFile: ".codex/auth.json",
    planSource: { file: ".codex/auth.json", parse: parseCodexPlan },
    usageSource: { kind: "transcripts", dir: ".codex/sessions" },
    limitSource: "rollout",
    worktreeTrust: { args: codexWorktreeTrustArgs },
    mcp: { file: ".codex/config.toml", scope: "user", syntax: "codex-toml" },
    headlessDetect: { kind: "subcommand", name: "exec" },
    tier: 1,
  },
  {
    ...harnessIdentity("pi"),
    binary: "pi",
    aliases: [],
    processNames: ["pi"],
    launch: [],
    // `--no-session --mode text` is unverified here (no pi installed): drop a flag it rejects.
    headless: ["--print", "--no-session", "--mode", "text"],
    prompt: argv,
    modelFlag: "--model",
    modelSource: { args: ["--list-models"], stdin: null, parse: parsePiModelList },
    routes: ["native", "openrouter"],
    // Pi resumes by the transcript file its extension reports, not by the id in the same payload.
    resume: { args: (file) => ["--session", file], evidence: "transcript-path" },
    sessionCapture: { source: "hook", key: "session_file", form: "file" },
    hooks: { container: "pi-extension", dir: ".pi/agent/extensions" },
    authFile: ".pi/agent/auth.json",
    // Pi and OpenCode are billed per provider key, so there is no plan to read.
    planSource: null,
    usageSource: { kind: "transcripts", dir: ".pi/agent/sessions" },
    limitSource: null,
    worktreeTrust: null,
    mcp: null,
    headlessDetect: { kind: "flag", flags: ["-p", "--print"], beforeSeparator: false },
    tier: 1,
  },
  {
    ...harnessIdentity("opencode"),
    binary: "opencode",
    aliases: [],
    processNames: ["opencode"],
    launch: [],
    // `run --format default` is unverified here (no opencode installed): drop a flag it rejects.
    headless: ["run", "--format", "default"],
    prompt: { kind: "flag", flag: "--prompt" },
    modelFlag: "--model",
    modelSource: { args: ["models"], stdin: null, parse: parseOpenCodeModelList },
    routes: ["native", "openrouter"],
    resume: { args: (id) => ["--session", id], evidence: "unchecked" },
    sessionCapture: { source: "hook", key: "sessionID", form: "id" },
    hooks: { container: "opencode-plugin", dir: ".config/opencode/plugins" },
    authFile: ".local/share/opencode/auth.json",
    planSource: null,
    usageSource: { kind: "transcripts", dir: ".local/share/opencode" },
    limitSource: null,
    worktreeTrust: null,
    mcp: { file: "opencode.json", scope: "repo", syntax: "opencode-json" },
    headlessDetect: { kind: "subcommand", name: "run" },
    tier: 1,
  },
];

export const harnesses: readonly HarnessDefinition[] = [
  ...full,
  ...familySources.map(familyDefinition),
  ...tier2Sources.map(tier2Definition),
];

const byId = new Map(harnesses.map((definition) => [definition.id, definition]));

const OTHER_PREFIX = "other:";

/** A binary name, not a path and not something the shell would split. */
const BINARY_NAME = /^[^\s/\\]+$/;

/** The one id that changed spelling when its harness was promoted out from under `other:`. */
const RENAMED: Record<string, string> = { cursor: "cursor-agent" };

export function harnessDefinition(id: HarnessId): HarnessDefinition {
  const definition = byId.get(id);
  if (definition) {
    return definition;
  }
  const binary = id.startsWith(OTHER_PREFIX) ? id.slice(OTHER_PREFIX.length) : "";
  const promoted = RENAMED[binary] ?? (byId.has(binary) ? binary : null);
  if (promoted !== null) {
    throw new RegistryError(`agn knows that harness as ${promoted}, not "${id}"`, {
      code: "harness-unknown",
      hint: `Name it ${promoted}: every harness agn has a row for has a plain id, and other: is only for an executable agn knows nothing about.`,
    });
  }
  if (!BINARY_NAME.test(binary)) {
    throw new RegistryError(`no harness named "${id}"`, {
      code: "harness-unknown",
      hint: "Run agn doctor to see the harnesses agn knows about, or name any executable on PATH as other:<binary>.",
    });
  }
  return openHarness(binary);
}

/**
 * Any executable on PATH runs as `other:<binary>`: agn starts it and attaches, and knows nothing
 * else about it, so the prompt is typed into the session it opens.
 */
function openHarness(binary: string): HarnessDefinition {
  return {
    ...harnessIdentity(`${OTHER_PREFIX}${binary}`),
    binary,
    aliases: [],
    processNames: [binary],
    launch: [],
    headless: null,
    prompt: { kind: "type-after-start" },
    modelFlag: null,
    modelSource: null,
    routes: ["native"],
    resume: null,
    sessionCapture: null,
    hooks: null,
    authFile: null,
    planSource: null,
    usageSource: null,
    limitSource: null,
    worktreeTrust: null,
    mcp: null,
    headlessDetect: null,
    tier: 2,
  };
}
