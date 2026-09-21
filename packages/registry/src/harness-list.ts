import type { HarnessId } from "@agnostic/core";
import { parseClaudePlan, parseCodexPlan } from "./detect-plan.js";
import { RegistryError } from "./error.js";
import type { HarnessDefinition, PromptDelivery } from "./harness-definition.js";
import { familyDefinition, familySources } from "./harness-list-families.js";
import { tier2Definition, tier2Sources } from "./harness-list-tier2.js";
import {
  claudeModelListRequest,
  parseClaudeModelList,
  parseCodexModelList,
  parseOpenCodeModelList,
  parsePiModelList,
} from "./model-list-parsers.js";

/**
 * The binary names, launch tokens, prompt delivery, resume argv and hook payload keys below are
 * ported from Orca's agent table (`src/shared/tui-agent.ts`, `tui-agent-config.ts`,
 * `agent-session-resume.ts`, `agent-process-recognition.ts`), and the headless argv from its
 * `commit-message-agent-specs-primary.ts`.
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

const argv: PromptDelivery = { kind: "argv" };

/** The harnesses agn both hooks and reads transcripts for; the other tier-1 rows are the families. */
const full: HarnessDefinition[] = [
  {
    id: "claude-code",
    name: "Claude Code",
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
    transcriptsDir: ".claude/projects",
    tier: 1,
  },
  {
    id: "codex",
    name: "Codex CLI",
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
    transcriptsDir: ".codex/sessions",
    tier: 1,
  },
  {
    id: "pi",
    name: "Pi",
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
    transcriptsDir: ".pi/agent/sessions",
    tier: 1,
  },
  {
    id: "opencode",
    name: "OpenCode",
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
    transcriptsDir: ".local/share/opencode",
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
    id: `${OTHER_PREFIX}${binary}`,
    name: binary,
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
    transcriptsDir: null,
    tier: 2,
  };
}
