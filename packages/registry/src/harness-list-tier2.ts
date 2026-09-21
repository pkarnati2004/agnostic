import type { HarnessDefinition, PromptDelivery } from "./harness-definition.js";

/**
 * The launch-and-attach rows, ported from Orca's agent table (`src/shared/tui-agent.ts`,
 * `tui-agent-config.ts`, `agent-process-recognition.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

const argvAfterSeparator: PromptDelivery = { kind: "argv", separator: "--" };
const typeAfterStart: PromptDelivery = { kind: "type-after-start" };

/** Tier 2 is launch and attach only: no model flag, no probe, no hooks, no resume. */
export type Tier2Source = {
  id: string;
  name: string;
  binary?: string;
  aliases?: string[];
  launch?: string[];
  prompt?: PromptDelivery;
  processNames?: string[];
};

export const tier2Sources: Tier2Source[] = [
  { id: "autohand", name: "Autohand" },
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
  // Continue's binary is `cn`; `continue` is a shell keyword.
  { id: "continue", name: "Continue", binary: "cn" },
  { id: "mistral-vibe", name: "Mistral Vibe", binary: "vibe", aliases: ["mistral-vibe"] },
  { id: "qwen-code", name: "Qwen Code", binary: "qwen" },
  { id: "rovo", name: "Rovo Dev" },
  // Bare `hermes` opens the old REPL; `--tui` starts the full-screen agent.
  { id: "hermes", name: "Hermes", launch: ["--tui"] },
  { id: "openclaw", name: "OpenClaw" },
  // `ante --prompt` is headless.
  { id: "ante", name: "Ante" },
  // TRAE CN's CLI is `traecli`; the unrelated trae-agent installs `trae-cli`.
  { id: "trae", name: "Trae CLI", binary: "traecli", prompt: argvAfterSeparator },
  { id: "prime-agent", name: "Prime Agent", prompt: argvAfterSeparator },
  // Mastra Code hooks at ~/.mastracode/hooks.json; it stays tier 2 until agn reads its events.
  { id: "mastracode", name: "Mastra Code" },
  { id: "fx", name: "fx" },
  { id: "deepseek", name: "DeepSeek CLI", aliases: ["dsh"] },
];

export function tier2Definition(source: Tier2Source): HarnessDefinition {
  const binary = source.binary ?? source.id;
  const aliases = source.aliases ?? [];
  return {
    id: source.id,
    name: source.name,
    binary,
    aliases,
    processNames: source.processNames ?? [binary, ...aliases],
    launch: source.launch ?? [],
    // Tier 2 is launch and attach only: agn knows no read-only form to ask one for a spec.
    headless: null,
    prompt: source.prompt ?? typeAfterStart,
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
