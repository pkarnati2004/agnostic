import {
  formatProfileId,
  type HarnessId,
  HarnessIdSchema,
  type Profile,
  parseProfileId,
  type Repo,
  readRepoConfig,
} from "@agnostic/core";
import { findOnPath, harnessDefinition } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import type { Detection } from "./detection-cache.js";
import { DaemonError } from "./error.js";

type ProfileRequest = { profile?: string; model?: string };

/**
 * One place turns what a caller typed into a profile, so the CLI, the UI and any adapter get the
 * same rules: a whole profile id, a bare harness id meaning its default model on the native route,
 * the repo's `default_profile`, and finally the fallback the caller brought - the recommendation,
 * for a run with neither (ADR 019). `--model` replaces the model segment whichever won.
 */
export async function resolveProfile(
  ctx: DaemonContext,
  repo: Repo,
  req: ProfileRequest,
  fallback: string | null = null,
): Promise<Profile> {
  const asked =
    req.profile ?? (await readRepoConfig(repo.path))?.defaultProfileId ?? fallback ?? null;
  if (asked === null) {
    throw new DaemonError(`no profile was given and ${repo.name} has no default`, {
      code: "profile-required",
      hint: "Pass --profile <id or harness>, or set default_profile in .ag/agnostic.yaml.",
    });
  }
  const id = withModel(expand(asked), req.model);
  const detection = await ctx.detection.current();
  const profile = detection.profiles.find((known) => known.id === id) ?? build(id);
  await assertInstalled(ctx, detection, profile.harness);
  return profile;
}

/** `claude-code` and `other:aider` mean that harness on its own default model and native route. */
function expand(asked: string): string {
  try {
    parseProfileId(asked);
    return asked;
  } catch (cause) {
    const harness = HarnessIdSchema.safeParse(asked);
    if (!harness.success) {
      throw cause;
    }
    return formatProfileId(harness.data, null, "native");
  }
}

/** The model is never checked against a list: a harness may know a model agn has not heard of. */
function withModel(id: string, model: string | undefined): string {
  if (model === undefined) {
    return id;
  }
  const parsed = parseProfileId(id);
  return formatProfileId(parsed.harness, model, parsed.route);
}

/** A profile detection did not enumerate: the harness is there, this model is the caller's word. */
function build(id: string): Profile {
  const { harness, model, route } = parseProfileId(id);
  return {
    id,
    harness,
    model,
    route,
    billing: "unknown",
    evidence: "binary",
    available: true,
    tier: harnessDefinition(harness).tier,
  };
}

async function assertInstalled(
  ctx: DaemonContext,
  detection: Detection,
  harness: HarnessId,
): Promise<void> {
  const def = harnessDefinition(harness);
  const report = detection.harnesses.find((row) => row.harness === harness);
  const path =
    report === undefined
      ? await findOnPath([def.binary, ...def.aliases], ctx.env.PATH ?? "")
      : report.path;
  if (path !== null) {
    return;
  }
  throw new DaemonError(`${def.name} is not installed`, {
    code: "harness-not-installed",
    hint: `Run \`agn doctor\` to see what is installed, or install ${def.binary} and try again.`,
  });
}
