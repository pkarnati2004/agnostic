import { parseGrokPlan } from "./detect-plan.js";
import type {
  HarnessDefinition,
  HookMechanism,
  ModelProbe,
  PlanSource,
  PromptDelivery,
  ResumeSpec,
  SessionCapture,
} from "./harness-definition.js";
import { parseCursorModelList, parseGrokModelList } from "./model-list-parsers.js";

const argv: PromptDelivery = { kind: "argv" };
const argvAfterSeparator: PromptDelivery = { kind: "argv", separator: "--" };
const typeAfterStart: PromptDelivery = { kind: "type-after-start" };

/**
 * The harnesses agn hooks but reads no transcript for (ADR 035). Each row names the family its
 * hook lives in and where that family keeps it; the hooks package owns the events and the write
 * format. Everything here but the resume argv comes from the survey; the argv is Orca's table.
 * Only Claude Code and Codex were verified on a machine, so these rows are unverified live.
 */
type FamilySource = {
  id: string;
  name: string;
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
  transcriptsDir?: string;
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
    name: "Gemini CLI",
    prompt: { kind: "flag", flag: "-i" },
    hooks: userSettings(".gemini/settings.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
    authFile: ".gemini/oauth_creds.json",
  },
  {
    id: "droid",
    name: "Factory Droid",
    prompt: argv,
    hooks: userSettings(".factory/settings.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
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
  },
  {
    id: "kimi",
    name: "Kimi CLI",
    aliases: ["kimi-code"],
    hooks: { container: "hooks-toml", file: ".kimi-code/config.toml" },
    resume: resumesById("--session"),
    sessionCapture: capturesId("session_id"),
    authFile: ".kimi-code/credentials/kimi-code.json",
  },
  {
    id: "devin",
    name: "Devin CLI",
    // `devin -- <prompt>` submits immediately, so the prompt is typed into the REPL instead.
    hooks: userSettings(".config/devin/config.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
  },
  {
    id: "openclaude",
    name: "OpenClaude",
    prompt: argv,
    hooks: userSettings(".openclaude/settings.json"),
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
  },
  {
    id: "command-code",
    name: "Command Code",
    // `--trust` skips the first-run prompt that would otherwise swallow the task text.
    launch: ["--trust"],
    prompt: argv,
    hooks: userSettings(".commandcode/settings.json"),
    resume: null,
    sessionCapture: null,
  },
  {
    id: "omp",
    name: "OMP",
    prompt: argv,
    hooks: { container: "pi-extension", dir: ".omp/agent/extensions" },
    resume: resumesById("--resume"),
    sessionCapture: capturesId("session_id"),
    transcriptsDir: ".omp/agent/sessions",
  },
  {
    id: "mimo-code",
    name: "Mimo Code",
    binary: "mimo",
    prompt: { kind: "flag", flag: "--prompt" },
    hooks: { container: "opencode-plugin", dir: ".config/mimocode/plugins" },
    resume: resumesById("--session"),
    sessionCapture: capturesId("sessionID"),
  },
  {
    id: "grok",
    name: "Grok CLI",
    processNames: ["grok", "grok-"],
    prompt: argvAfterSeparator,
    modelFlag: "-m",
    modelSource: { args: ["models"], stdin: null, parse: parseGrokModelList },
    hooks: { container: "hooks-dir", dir: ".grok/hooks" },
    resume: resumesById("--resume"),
    sessionCapture: capturesId("sessionId"),
    authFile: ".grok/auth.json",
    planSource: { file: ".grok/auth.json", parse: parseGrokPlan },
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    prompt: { kind: "flag", flag: "-i" },
    hooks: { container: "hooks-dir", dir: ".copilot/hooks" },
    // The joined form is the only one Copilot documents.
    resume: { args: (id) => [`--resume=${id}`], evidence: "unchecked" },
    sessionCapture: capturesId("session_id"),
  },
];

export function familyDefinition(source: FamilySource): HarnessDefinition {
  const binary = source.binary ?? source.id;
  const aliases = source.aliases ?? [];
  return {
    id: source.id,
    name: source.name,
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
    transcriptsDir: source.transcriptsDir ?? null,
    tier: 1,
  };
}
