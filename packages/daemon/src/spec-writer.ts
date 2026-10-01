import type { Catalog } from "@agnostic/catalog";
import {
  composeSpecPrompt,
  type HarnessId,
  ProcessError,
  type Profile,
  type Repo,
  type RunResult,
  run,
  type SpecRequest,
  type SpecResponse,
} from "@agnostic/core";
import { AGN_TASK_ID } from "@agnostic/hooks";
import { type HeadlessSpec, harnessDefinition, harnesses, headlessSpec } from "@agnostic/registry";
import { pricingRow } from "@agnostic/usage";
import type { DaemonContext } from "./app.js";
import { readDaemonConfig } from "./daemon-config.js";
import { DaemonError } from "./error.js";
import { repoStateInput } from "./launch-command.js";
import { parseSpecAnswer } from "./spec-parse.js";
import { titleFromPrompt } from "./task-title.js";

/**
 * The task id the headless run carries. The hook script sends it as the task header, the receiver
 * finds no such task and answers 404: without it a spec written in a folder workspace's directory
 * would be matched to whatever task is live there and rewrite its session.
 */
export const SPEC_WRITER_TASK_HEADER = "spec-writer";

export type SpecWriterChoice = { profile: Profile; price: number };

const SPEC_TIMEOUT_MS = 90_000;

/** A spec is a page of output read from far more input, so the input side carries the weight. */
const INPUT_WEIGHT = 4;

/** Beyond this the answer is not a spec, and holding it in memory to find that out is enough. */
const ANSWER_MAX_CHARS = 256 * 1024;

const WRITE_IT_YOURSELF =
  "Write the spec yourself in the dialog, or set spec_writer: <profile id> in ~/.agnostic/config.yaml.";

/**
 * Who writes the spec: the cheapest catalog-priced model the user already pays a subscription for
 * (ADR 028). Credits are metered per token on top of that subscription, so they are not free here
 * and are never chosen automatically; `spec_writer` in config.yaml overrides the whole rule.
 */
export function chooseSpecWriter(input: {
  profiles: Profile[];
  catalog: Catalog;
  override: string | null;
}): SpecWriterChoice {
  if (input.override !== null) {
    return named(input.profiles, input.catalog, input.override);
  }
  const ranked = candidates(input.profiles, input.catalog).sort(
    (a, b) => a.price - b.price || rank(a.profile.harness) - rank(b.profile.harness),
  );
  const first = ranked[0];
  if (first === undefined) {
    throw new DaemonError("no subscription-billed agent can write specs on this machine", {
      code: "spec-writer-unavailable",
      hint: WRITE_IT_YOURSELF,
    });
  }
  return first;
}

/** The user named it, so agn does not second-guess how it is billed; it still has to be here. */
function named(profiles: Profile[], catalog: Catalog, id: string): SpecWriterChoice {
  const profile = profiles.find(
    (row) => row.id === id && row.available && writesSpecs(row.harness),
  );
  if (profile === undefined) {
    throw new DaemonError(`spec_writer in config.yaml names ${id}, which is not available now`, {
      code: "spec-writer-unavailable",
      hint: "Name a profile `agn profiles` lists, or remove spec_writer from ~/.agnostic/config.yaml.",
    });
  }
  // A local route has no headless form: its provider overrides come from a server list a one-shot
  // run never has, so this is refused here rather than as a registry error mid-run.
  if (profile.route === "local") {
    throw new DaemonError(`spec_writer in config.yaml names ${id}, which runs on a local server`, {
      code: "spec-writer-unavailable",
      hint: "A local profile cannot write specs. Name one on another route, or remove spec_writer from ~/.agnostic/config.yaml.",
    });
  }
  return { profile, price: priceOf(profile, catalog) ?? 0 };
}

function candidates(profiles: Profile[], catalog: Catalog): SpecWriterChoice[] {
  const rows: SpecWriterChoice[] = [];
  for (const profile of profiles) {
    const price =
      profile.available && profile.billing === "subscription" && writesSpecs(profile.harness)
        ? priceOf(profile, catalog)
        : null;
    if (price !== null) {
      rows.push({ profile, price });
    }
  }
  return rows;
}

function priceOf(profile: Profile, catalog: Catalog): number | null {
  if (profile.model === null) {
    return null;
  }
  const row = pricingRow(profile.harness, profile.model, catalog.models, catalog.pricing);
  return row === null ? null : INPUT_WEIGHT * row.inputPerMillion + row.outputPerMillion;
}

function writesSpecs(harness: HarnessId): boolean {
  return harnessDefinition(harness).headless !== null;
}

/** Registry order breaks a tie on price; a harness with no row of its own sorts last. */
function rank(harness: HarnessId): number {
  const index = harnesses.findIndex((row) => row.id === harness);
  return index === -1 ? harnesses.length : index;
}

/**
 * One read-only run of the user's own CLI in their repo, with the same repo state a launch would
 * carry. Nothing is written to the ledger and nothing is started: the answer goes back for the
 * user to edit and approve (ADR 028).
 */
export async function runSpecWriter(
  ctx: DaemonContext,
  repo: Repo,
  req: SpecRequest,
): Promise<SpecResponse> {
  const { specWriter } = await readDaemonConfig(ctx.paths);
  const detection = await ctx.detection.current();
  const { profile } = chooseSpecWriter({
    profiles: detection.profiles,
    catalog: ctx.catalog.current().catalog,
    override: specWriter,
  });
  const command = detection.harnesses.find((row) => row.harness === profile.harness)?.path ?? null;
  if (command === null) {
    throw new DaemonError(`${nameOf(profile)} is not installed on this machine`, {
      code: "spec-writer-unavailable",
      hint: WRITE_IT_YOURSELF,
    });
  }
  const spec = headlessSpec(profile, {
    prompt: composeSpecPrompt({
      prompt: req.prompt,
      intent: req.intent ?? null,
      repoState: await repoStateInput(ctx, repo, null),
    }),
    env: ctx.env,
  });
  const startedAt = Date.now();
  const parsed = parseSpecAnswer(await ask(ctx, repo, profile, spec, command));
  if (parsed === null) {
    throw failed(repo, spec, `${nameOf(profile)} answered with no spec`);
  }
  ctx.log.info("spec written", {
    harness: profile.harness,
    model: profile.model ?? "default",
    ms: Date.now() - startedAt,
  });
  return {
    title: parsed.title ?? titleFromPrompt(req.prompt),
    spec: parsed.spec,
    acceptance: parsed.acceptance,
    profileId: profile.id,
    model: profile.model,
  };
}

async function ask(
  ctx: DaemonContext,
  repo: Repo,
  profile: Profile,
  spec: HeadlessSpec,
  command: string,
): Promise<string> {
  const timeoutMs = ctx.specTimeoutMs ?? SPEC_TIMEOUT_MS;
  let result: RunResult;
  try {
    result = await run(command, spec.args, {
      cwd: repo.path,
      // The sentinel task id, so a hook this run fires cannot land on the folder's live task.
      env: { ...ctx.env, ...spec.env, [AGN_TASK_ID]: SPEC_WRITER_TASK_HEADER },
      input: spec.input,
      timeoutMs,
    });
  } catch (cause) {
    if (!(cause instanceof ProcessError)) {
      throw cause;
    }
    throw failed(repo, spec, why(profile, cause, timeoutMs), cause);
  }
  if (result.stdout.length + result.stderr.length > ANSWER_MAX_CHARS) {
    throw failed(repo, spec, `${nameOf(profile)} answered with no spec`);
  }
  return result.stdout;
}

function why(profile: Profile, cause: ProcessError, timeoutMs: number): string {
  if (cause.code === "process-timeout") {
    return `${nameOf(profile)} timed out after ${duration(timeoutMs)}`;
  }
  return cause.exitCode === null
    ? `${nameOf(profile)} could not be run`
    : `${nameOf(profile)} exited with code ${cause.exitCode}`;
}

/** The command, never its stderr: the output reached the process log and belongs nowhere else. */
function failed(repo: Repo, spec: HeadlessSpec, message: string, cause?: unknown): DaemonError {
  const command = [spec.command, ...spec.args].join(" ");
  return new DaemonError(message, {
    code: "spec-writer-failed",
    hint: `Write the spec yourself, or run \`${command}\` in ${repo.path} to see why.`,
    ...(cause === undefined ? {} : { cause }),
  });
}

function duration(ms: number): string {
  return ms >= 1_000 ? `${Math.round(ms / 1_000)} s` : `${ms} ms`;
}

function nameOf(profile: Profile): string {
  return harnessDefinition(profile.harness).name;
}
