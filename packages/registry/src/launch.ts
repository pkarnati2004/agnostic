import type { Profile } from "@agnostic/core";
import type { LocalServer } from "./detect-local-servers.js";
import { RegistryError } from "./error.js";
import { gatewayFor } from "./gateways.js";
import type { HarnessDefinition } from "./harness-definition.js";
import { harnessDefinition } from "./harness-list.js";

export type LaunchSpec = {
  command: string;
  args: string[];
  /** Only what the route adds; the executor merges it over the environment it already has. */
  env: Record<string, string>;
};

export type LaunchOptions = {
  prompt?: string;
  env: Record<string, string>;
  servers?: LocalServer[];
  /** The worktree agn made for this task, when it has one; null for a task running in the checkout. */
  worktreePath?: string | null;
};

/** The local provider agn writes into Codex's `-c` overrides; the name is ours, not the server's. */
const LOCAL_PROVIDER = "agn-local";

const SESSION_ID_MAX_LENGTH = 512;

export function launchSpec(
  profile: Profile,
  opts: LaunchOptions,
): LaunchSpec & { promptAfterStart: string | null } {
  const def = supportedDefinition(profile);
  const args = [
    ...def.launch,
    ...directoryTrustArgs(def, opts.worktreePath ?? null),
    ...routeArgs(def, profile, opts.servers ?? []),
  ];
  const prompt = opts.prompt && opts.prompt.length > 0 ? opts.prompt : null;
  let promptAfterStart: string | null = null;
  if (prompt !== null) {
    if (def.prompt.kind === "argv") {
      args.push(...(def.prompt.separator ? [def.prompt.separator] : []), prompt);
    } else if (def.prompt.kind === "flag") {
      args.push(def.prompt.flag, prompt);
    } else {
      promptAfterStart = prompt;
    }
  }
  return { command: def.binary, args, env: routeEnv(def, profile, opts.env), promptAfterStart };
}

/** A one-shot read-only run: the prompt goes in on stdin, the whole answer comes back on stdout. */
export type HeadlessSpec = LaunchSpec & { input: string };

/**
 * The same profile as a launch, asked to answer once and exit. Nothing of the interactive start
 * survives: no launch tokens, no prompt on argv, no session for anyone to attach to.
 */
export function headlessSpec(
  profile: Profile,
  opts: { prompt: string; env: Record<string, string> },
): HeadlessSpec {
  const def = supportedDefinition(profile);
  // A local route builds its provider overrides from a server list a headless call does not have.
  if (def.headless === null || profile.route === "local") {
    throw new RegistryError(`${def.name} has no headless form agn can run`, {
      code: "headless-unsupported",
      hint: "Name another profile in spec_writer in ~/.agnostic/config.yaml.",
    });
  }
  return {
    command: def.binary,
    args: [...def.headless, ...routeArgs(def, profile, [])],
    env: routeEnv(def, profile, opts.env),
    input: opts.prompt,
  };
}

export function resumeSpec(
  profile: Profile,
  sessionId: string,
  env: Record<string, string>,
  /** A resume relaunches the harness, so a worktree needs the same trust override a fresh start gets. */
  worktreePath: string | null = null,
): LaunchSpec {
  const def = supportedDefinition(profile);
  if (!def.resume) {
    throw new RegistryError(`${def.name} cannot resume a session by id`, {
      code: "resume-unsupported",
      hint: `Start ${def.name} again with the task context instead.`,
    });
  }
  // Resuming on the local route would need the server list to rebuild the provider overrides,
  // and without them the harness would quietly run against its own default provider.
  if (profile.route === "local") {
    throw new RegistryError(`${def.name} cannot resume a session on a local server`, {
      code: "resume-unsupported",
      hint: `Start ${def.name} again with the task context instead.`,
    });
  }
  return {
    command: def.binary,
    // Before the subcommand: `-c` belongs to `codex` itself, not to `codex resume`.
    args: [
      ...directoryTrustArgs(def, worktreePath),
      ...def.resume.args(sessionIdOrThrow(sessionId)),
    ],
    env: routeEnv(def, profile, env),
  };
}

/**
 * ADR 035, amended 2026-09-28 (ruling a): Codex reads directory trust from the nearest `.git`, so a
 * linked worktree is never covered by the repo's `[projects."…"]` entry and every launch there stops
 * on "Do you trust the contents of this directory?". agn trusts the worktree it made itself, for
 * this launch only: nothing is written to the user's config.toml, and no approval or sandbox setting
 * is relaxed. A path that cannot be written as a TOML key is left alone rather than mangled.
 */
function directoryTrustArgs(def: HarnessDefinition, worktreePath: string | null): string[] {
  if (def.id !== "codex" || worktreePath === null || !tomlKeyable(worktreePath)) {
    return [];
  }
  return ["-c", `projects."${worktreePath}".trust_level="trusted"`];
}

function tomlKeyable(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.includes('"') &&
    !path.includes("\\") &&
    ![...path].some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f)
  );
}

function supportedDefinition(profile: Profile): HarnessDefinition {
  const def = harnessDefinition(profile.harness);
  if (!def.routes.includes(profile.route)) {
    throw new RegistryError(`${def.name} cannot be launched on the ${profile.route} route`, {
      code: "route-unsupported",
      hint: `${def.name} supports: ${def.routes.join(", ")}.`,
    });
  }
  return def;
}

/** Args the route adds to a fresh launch: the model flag, or Codex's local provider overrides. */
function routeArgs(def: HarnessDefinition, profile: Profile, servers: LocalServer[]): string[] {
  if (profile.route === "local") {
    return localProviderArgs(profile, servers);
  }
  if (!profile.model || !def.modelFlag) {
    return [];
  }
  // OpenRouter ids are namespaced by the provider the harness routes through.
  const model = profile.route === "openrouter" ? `openrouter/${profile.model}` : profile.model;
  return [def.modelFlag, model];
}

/** Env the route adds. A resumed session runs on the same route, so it needs this too. */
function routeEnv(
  def: HarnessDefinition,
  profile: Profile,
  env: Record<string, string>,
): Record<string, string> {
  const gateway = gatewayFor(profile.route);
  if (!gateway) {
    return {};
  }
  const key = env[gateway.envKey];
  if (!key) {
    throw new RegistryError(
      `${def.name} needs ${gateway.envKey} to use the ${profile.route} route`,
      {
        code: "provider-key-missing",
        hint: `Export ${gateway.envKey} and run agn doctor again.`,
      },
    );
  }
  if (profile.route === "anthropic-gateway") {
    return {
      ...(gateway.baseUrl ? { ANTHROPIC_BASE_URL: gateway.baseUrl } : {}),
      ANTHROPIC_AUTH_TOKEN: key,
    };
  }
  return { [gateway.envKey]: key };
}

function localProviderArgs(profile: Profile, servers: LocalServer[]): string[] {
  const model = profile.model;
  const server = model === null ? undefined : servers.find((s) => s.models.includes(model));
  if (!model || !server) {
    throw new RegistryError(`no local server is serving ${model ?? "a model"}`, {
      code: "server-not-found",
      hint: "Start LM Studio or Ollama, load the model, then run agn doctor again.",
    });
  }
  return [
    "-c",
    `model_provider=${LOCAL_PROVIDER}`,
    "-c",
    `model_providers.${LOCAL_PROVIDER}.name=${LOCAL_PROVIDER}`,
    "-c",
    `model_providers.${LOCAL_PROVIDER}.base_url=${server.baseUrl}/v1`,
    "-c",
    `model=${model}`,
  ];
}

function sessionIdOrThrow(sessionId: string): string {
  const trimmed = sessionId.trim();
  // A leading dash would read as a flag, and control characters would reach the terminal raw.
  const usable =
    trimmed.length > 0 &&
    trimmed.length <= SESSION_ID_MAX_LENGTH &&
    !trimmed.startsWith("-") &&
    ![...trimmed].some((char) => {
      const code = char.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
  if (!usable) {
    throw new RegistryError("that session id cannot be passed to a harness", {
      code: "session-id-invalid",
      hint: "Use the session id agn recorded for the task.",
    });
  }
  return trimmed;
}
