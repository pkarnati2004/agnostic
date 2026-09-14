import type { HarnessId } from "@agnostic/core";
import { RegistryError } from "./error.js";
import type { HarnessDefinition, PromptDelivery } from "./harness-definition.js";
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
 * `agent-session-resume.ts`, `agent-process-recognition.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

const argv: PromptDelivery = { kind: "argv" };
const argvAfterSeparator: PromptDelivery = { kind: "argv", separator: "--" };
const typeAfterStart: PromptDelivery = { kind: "type-after-start" };

const tier1: HarnessDefinition[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    binary: "claude",
    aliases: [],
    processNames: ["claude"],
    launch: [],
    prompt: argv,
    modelFlag: "--model",
    modelSource: {
      args: ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"],
      stdin: claudeModelListRequest,
      parse: parseClaudeModelList,
    },
    routes: ["native", "anthropic-gateway"],
    resume: (sessionId) => ["--resume", sessionId],
    sessionCapture: { source: "hook", key: "session_id" },
    hooks: "claude-settings",
    authFile: ".claude.json",
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
    prompt: argv,
    modelFlag: "-m",
    modelSource: { args: ["debug", "models"], stdin: null, parse: parseCodexModelList },
    routes: ["native", "local"],
    resume: (sessionId) => ["resume", sessionId],
    sessionCapture: { source: "hook", key: "session_id" },
    hooks: "codex-hooks",
    authFile: ".codex/auth.json",
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
    prompt: argv,
    modelFlag: "--model",
    modelSource: { args: ["--list-models"], stdin: null, parse: parsePiModelList },
    routes: ["native", "openrouter"],
    // Pi resumes by session file, which only a hook reports; chunk 9 does not install one yet.
    resume: null,
    sessionCapture: { source: "hook", key: "session_id" },
    hooks: "pi-extension",
    authFile: ".pi/agent/auth.json",
    transcriptsDir: null,
    tier: 1,
  },
  {
    id: "opencode",
    name: "OpenCode",
    binary: "opencode",
    aliases: [],
    processNames: ["opencode"],
    launch: [],
    prompt: { kind: "flag", flag: "--prompt" },
    modelFlag: "--model",
    modelSource: { args: ["models"], stdin: null, parse: parseOpenCodeModelList },
    routes: ["native", "openrouter"],
    resume: null,
    sessionCapture: { source: "hook", key: "sessionID" },
    hooks: "opencode-plugin",
    authFile: ".local/share/opencode/auth.json",
    transcriptsDir: null,
    tier: 1,
  },
];

/** Tier 2 is launch and attach only: no model flag, no probe, no hooks, no resume. */
type Tier2Source = {
  id: string;
  name: string;
  binary?: string;
  aliases?: string[];
  launch?: string[];
  prompt?: PromptDelivery;
  processNames?: string[];
};

const tier2Sources: Tier2Source[] = [
  { id: "openclaude", name: "OpenClaude", prompt: argv },
  { id: "autohand", name: "Autohand" },
  {
    id: "mimo-code",
    name: "Mimo Code",
    binary: "mimo",
    prompt: { kind: "flag", flag: "--prompt" },
  },
  { id: "omp", name: "OMP", prompt: argv },
  { id: "gemini", name: "Gemini CLI", prompt: { kind: "flag", flag: "-i" } },
  { id: "antigravity", name: "Antigravity", binary: "agy", prompt: { kind: "flag", flag: "-i" } },
  { id: "aider", name: "Aider" },
  { id: "goose", name: "Goose" },
  { id: "amp", name: "Amp" },
  { id: "kilo", name: "Kilocode" },
  // The Kiro installer ships `kiro-cli`, and its trust flags hang off the `chat` subcommand.
  { id: "kiro", name: "Kiro", binary: "kiro-cli", launch: ["chat", "--tui"] },
  { id: "crush", name: "Crush" },
  { id: "aug", name: "Auggie", binary: "auggie" },
  { id: "cline", name: "Cline" },
  { id: "codebuff", name: "Codebuff" },
  // `--trust` skips the first-run prompt that would otherwise swallow the task text.
  { id: "command-code", name: "Command Code", launch: ["--trust"], prompt: argv },
  // Continue's binary is `cn`; `continue` is a shell keyword.
  { id: "continue", name: "Continue", binary: "cn" },
  { id: "cursor", name: "Cursor Agent", binary: "cursor-agent", prompt: argv },
  { id: "droid", name: "Factory Droid", prompt: argv },
  { id: "kimi", name: "Kimi CLI", aliases: ["kimi-code"] },
  { id: "mistral-vibe", name: "Mistral Vibe", binary: "vibe", aliases: ["mistral-vibe"] },
  { id: "qwen-code", name: "Qwen Code", binary: "qwen" },
  { id: "rovo", name: "Rovo Dev" },
  // Bare `hermes` opens the old REPL; `--tui` starts the full-screen agent.
  { id: "hermes", name: "Hermes", launch: ["--tui"] },
  { id: "openclaw", name: "OpenClaw" },
  { id: "copilot", name: "GitHub Copilot CLI", prompt: { kind: "flag", flag: "-i" } },
  { id: "grok", name: "Grok CLI", prompt: argvAfterSeparator, processNames: ["grok", "grok-"] },
  // `devin -- <prompt>` submits immediately, so the prompt is typed into the REPL instead.
  { id: "devin", name: "Devin CLI" },
  // `ante --prompt` is headless.
  { id: "ante", name: "Ante" },
  // TRAE CN's CLI is `traecli`; the unrelated trae-agent installs `trae-cli`.
  { id: "trae", name: "Trae CLI", binary: "traecli", prompt: argvAfterSeparator },
  { id: "prime-agent", name: "Prime Agent", prompt: argvAfterSeparator },
];

function tier2Definition(source: Tier2Source): HarnessDefinition {
  const binary = source.binary ?? source.id;
  const aliases = source.aliases ?? [];
  return {
    id: `other:${source.id}`,
    name: source.name,
    binary,
    aliases,
    processNames: source.processNames ?? [binary, ...aliases],
    launch: source.launch ?? [],
    prompt: source.prompt ?? typeAfterStart,
    modelFlag: null,
    modelSource: null,
    routes: ["native"],
    resume: null,
    sessionCapture: null,
    hooks: null,
    authFile: null,
    transcriptsDir: null,
    tier: 2,
  };
}

export const harnesses: readonly HarnessDefinition[] = [
  ...tier1,
  ...tier2Sources.map(tier2Definition),
];

const byId = new Map(harnesses.map((definition) => [definition.id, definition]));

const OTHER_PREFIX = "other:";

/** A binary name, not a path and not something the shell would split. */
const BINARY_NAME = /^[^\s/\\]+$/;

export function harnessDefinition(id: HarnessId): HarnessDefinition {
  const definition = byId.get(id);
  if (definition) {
    return definition;
  }
  const binary = id.startsWith(OTHER_PREFIX) ? id.slice(OTHER_PREFIX.length) : "";
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
    prompt: typeAfterStart,
    modelFlag: null,
    modelSource: null,
    routes: ["native"],
    resume: null,
    sessionCapture: null,
    hooks: null,
    authFile: null,
    transcriptsDir: null,
    tier: 2,
  };
}
