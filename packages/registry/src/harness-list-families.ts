// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import { parseGrokPlan } from "./detect-plan.js";
import type {
  HarnessDefinition,
  HookMechanism,
  ModelProbe,
  PlanSource,
  PromptDelivery,
  ResumeSpec,
  SessionCapture,
  UsageSource,
} from "./harness-definition.js";
import { harnessIdentity } from "./harness-identity.js";
import { parseCursorModelList, parseGrokModelList } from "./model-list-parsers.js";

const argv: PromptDelivery = { kind: "argv" };
const argvAfterSeparator: PromptDelivery = { kind: "argv", separator: "--" };
const typeAfterStart: PromptDelivery = { kind: "type-after-start" };

/**
 * The harnesses agn hooks but reads no transcript for (ADR 035). Each row names the family its
 * hook lives in and where that family keeps it; the hooks package owns the events and the write
 * format. The name, mark and plan vendor come from the row's identity in `harness-identity.ts`.
 * Only Claude Code and Codex were verified on a machine, so these rows are unverified live.
 */
type FamilySource = {
  id: string;
  binary?: string;
  aliases?: string[];
  processNames?: string[];
  launch?: string[];
  prompt?: PromptDelivery;
  modelFlag?: string;
  modelSource?: ModelProbe;
  hooks: HookMechanism;
  resume: ResumeSpec | null;
  sessionCapture: SessionCapture | null;
  authFile?: string;
  planSource?: PlanSource;
  usageSource?: UsageSource;
};

/** Resumes by an id the harness's own hook reported, with no way to check it is still there. */
function resumesById(flag: string): ResumeSpec {
  return { args: (id) => [flag, id], evidence: "unchecked" };
}

function capturesId(key: string): SessionCapture {
  return { source: "hook", key, form: "id" };
}

function userSettings(file: string): HookMechanism {
  return { container: "settings-json", file, scope: "user" };
}

export const familySources: FamilySource[] = [
  {
    id: "gemini",
    prompt: { kind: "flag", flag: "-i" },
    hooks: userSettings(".gemini/settings.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
    authFile: ".gemini/oauth_creds.json",
    usageSource: { kind: "transcripts", dir: ".gemini/tmp" },
  },
  {
    id: "droid",
    prompt: argv,
    hooks: userSettings(".factory/settings.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
  },
  {
    id: "cursor-agent",
    binary: "cursor-agent",
    prompt: argv,
    // `--model` is the flag Cursor documents; no cursor-agent was installed here to check it.
    modelFlag: "--model",
    modelSource: { args: ["--list-models"], stdin: null, parse: parseCursorModelList },
    // Cursor replays Claude's settings through its own file, and its hooks report no resumable id.
    // What its payload calls the conversation and the workspace roots is inferred, not observed.
    hooks: userSettings(".cursor/hooks.json"),
    resume: null,
    sessionCapture: null,
    authFile: ".cursor/auth.json",
    // Cursor writes no tokens to disk; its `stop` payload is the only count there is.
    usageSource: { kind: "hook", event: "stop" },
  },
  {
    id: "kimi",
    aliases: ["kimi-code"],
    hooks: { container: "hooks-toml", file: ".kimi-code/config.toml" },
    resume: resumesById("--session"),
    sessionCapture: capturesId("session_id"),
    authFile: ".kimi-code/credentials/kimi-code.json",
  },
  {
    id: "devin",
    // `devin -- <prompt>` submits immediately, so the prompt is typed into the REPL instead.
    hooks: userSettings(".config/devin/config.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
  },
  {
    id: "openclaude",
    prompt: argv,
    hooks: userSettings(".openclaude/settings.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
  },
  {
    id: "command-code",
    // `--trust` skips the first-run prompt that would otherwise swallow the task text.
    launch: ["--trust"],
    prompt: argv,
    hooks: userSettings(".commandcode/settings.json"),
    resume: null,
    sessionCapture: null,
  },
  {
    id: "omp",
    prompt: argv,
    hooks: { container: "pi-extension", dir: ".omp/agent/extensions" },
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
    usageSource: { kind: "transcripts", dir: ".omp/agent/sessions" },
  },
  {
    id: "mimo-code",
    binary: "mimo",
    prompt: { kind: "flag", flag: "--prompt" },
    hooks: { container: "opencode-plugin", dir: ".config/mimocode/plugins" },
    resume: resumesById("--session"),
    sessionCapture: capturesId("sessionID"),
  },
  {
    id: "grok",
    processNames: ["grok", "grok-"],
    prompt: argvAfterSeparator,
    modelFlag: "-m",
    modelSource: { args: ["models"], stdin: null, parse: parseGrokModelList },
    hooks: { container: "hooks-dir", dir: ".grok/hooks" },
    resume: resumesById("--resume"),
    sessionCapture: capturesId("sessionId"),
    authFile: ".grok/auth.json",
    planSource: { file: ".grok/auth.json", parse: parseGrokPlan },
    // One log for every session on the machine, under the fixed path; $GROK_HOME is not read.
    usageSource: { kind: "transcripts", dir: ".grok/logs" },
  },
  {
    id: "copilot",
    prompt: { kind: "flag", flag: "-i" },
    hooks: { container: "hooks-dir", dir: ".copilot/hooks" },
    // The joined form is the only one Copilot documents.
    resume: { args: (id) => [`--resume=${id}`], evidence: "unchecked" },
    sessionCapture: capturesId("session_id"),
    usageSource: { kind: "transcripts", dir: ".copilot" },
  },
];

export function familyDefinition(source: FamilySource): HarnessDefinition {
  const binary = source.binary ?? source.id;
  const aliases = source.aliases ?? [];
  return {
    ...harnessIdentity(source.id),
    binary,
    aliases,
    processNames: source.processNames ?? [binary, ...aliases],
    launch: source.launch ?? [],
    // No read-only form is claimed for these: a spec is written by a harness agn has run headless.
    headless: null,
    prompt: source.prompt ?? typeAfterStart,
    modelFlag: source.modelFlag ?? null,
    modelSource: source.modelSource ?? null,
    routes: ["native"],
    resume: source.resume,
    sessionCapture: source.sessionCapture,
    hooks: source.hooks,
    authFile: source.authFile ?? null,
    // Only xAI names the tier on disk; Google, Moonshot and Cursor leave doctor to ask.
    planSource: source.planSource ?? null,
    usageSource: source.usageSource ?? null,
    // None of these reports a figure for its plan's own meter, and none reads MCP servers agn writes.
    limitSource: null,
    worktreeTrust: null,
    mcp: null,
    headlessDetect: null,
    tier: 1,
  };
}
