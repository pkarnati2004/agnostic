// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { HarnessDefinition, PromptDelivery, UsageSource } from "./harness-definition.js";
import { harnessIdentity } from "./harness-identity.js";

const argvAfterSeparator: PromptDelivery = { kind: "argv", separator: "--" };
const typeAfterStart: PromptDelivery = { kind: "type-after-start" };

/**
 * Tier 2 is launch and attach only: no model flag, no probe, no hooks and no resume. A row may
 * still name a usage source, because reading a file a harness writes needs nothing from the
 * harness in return. The name and the mark come from `harness-identity.ts`.
 */
export type Tier2Source = {
  id: string;
  binary?: string;
  aliases?: string[];
  launch?: string[];
  prompt?: PromptDelivery;
  processNames?: string[];
  usageSource?: UsageSource;
};

export const tier2Sources: Tier2Source[] = [
  { id: "autohand" },
  { id: "antigravity", binary: "agy", prompt: { kind: "flag", flag: "-i" } },
  { id: "aider" },
  { id: "goose" },
  { id: "amp" },
  { id: "kilo" },
  // The Kiro installer ships `kiro-cli`, and its trust flags hang off the `chat` subcommand.
  { id: "kiro", binary: "kiro-cli", launch: ["chat", "--tui"] },
  { id: "crush" },
  { id: "aug", binary: "auggie" },
  { id: "cline" },
  { id: "codebuff" },
  // Continue's binary is `cn`; `continue` is a shell keyword.
  { id: "continue", binary: "cn" },
  { id: "mistral-vibe", binary: "vibe", aliases: ["mistral-vibe"] },
  { id: "qwen-code", binary: "qwen" },
  { id: "rovo" },
  // Bare `hermes` opens the old REPL; `--tui` starts the full-screen agent.
  { id: "hermes", launch: ["--tui"] },
  { id: "openclaw" },
  // `ante --prompt` is headless.
  { id: "ante" },
  // TRAE CN's CLI is `traecli`; the unrelated trae-agent installs `trae-cli`.
  { id: "trae", binary: "traecli", prompt: argvAfterSeparator },
  { id: "prime-agent", prompt: argvAfterSeparator },
  // Mastra Code hooks at ~/.mastracode/hooks.json; it stays tier 2 until agn reads its events.
  { id: "mastracode" },
  // fx writes cumulative usage checkpoints to its session log; agn reads them without a hook.
  { id: "fx", usageSource: { kind: "transcripts", dir: ".fx/sessions" } },
  { id: "deepseek", aliases: ["dsh"] },
];

export function tier2Definition(source: Tier2Source): HarnessDefinition {
  const binary = source.binary ?? source.id;
  const aliases = source.aliases ?? [];
  return {
    ...harnessIdentity(source.id),
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
    usageSource: source.usageSource ?? null,
    limitSource: null,
    worktreeTrust: null,
    mcp: null,
    headlessDetect: null,
    tier: 2,
  };
}
