import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessError, run } from "@agnostic/core";
import { z } from "zod";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";

const AUTH_TIMEOUT_MS = 15_000;
const PR_TIMEOUT_MS = 60_000;

/** `--json url` answers an object, whatever else gh may print around it in a future version. */
const PrViewSchema = z.object({ url: z.string().min(1) });

export type PrSpec = {
  branch: string;
  base: string;
  title: string;
  body: string;
  /** The parent task whose branch this PR targets, so a refusal can name the PR to open first. */
  baseTaskId: string | null;
};

/** What gh said: `ok` is "it ran and exited 0", and a gh that never ran says why on `stderr`. */
type GhCall = { ok: boolean; stdout: string; stderr: string };

/**
 * The gh this machine can open a pull request with: installed, on the path `agn doctor` reports,
 * and logged in. Null means the caller hands the user GitHub's compare page instead.
 */
export async function usableGh(ctx: DaemonContext, dir: string): Promise<string | null> {
  const path = (await ctx.detection.current()).tools.find((row) => row.tool === "gh")?.path ?? null;
  if (path === null) {
    return null;
  }
  const status = await gh(path, ["auth", "status"], dir, ctx.env, AUTH_TIMEOUT_MS);
  return status.ok ? path : null;
}

/**
 * The pull request for this branch: the one that is already open, else a new one. gh refuses a
 * second PR for the same head branch, so asking first is what makes a second Create PR safe.
 */
export async function openPr(
  path: string,
  dir: string,
  env: Record<string, string>,
  spec: PrSpec,
): Promise<string> {
  const view = ["pr", "view", spec.branch, "--json", "url"];
  const existing = await gh(path, view, dir, env, PR_TIMEOUT_MS);
  const url = existing.ok ? viewedUrl(existing.stdout) : null;
  return url ?? (await createPullRequest(path, dir, env, spec));
}

/** Null when gh answered with something that is not a PR: the caller opens one instead. */
function viewedUrl(stdout: string): string | null {
  try {
    const parsed = PrViewSchema.safeParse(JSON.parse(stdout) as unknown);
    return parsed.success ? parsed.data.url : null;
  } catch {
    return null;
  }
}

async function createPullRequest(
  path: string,
  dir: string,
  env: Record<string, string>,
  spec: PrSpec,
): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "agn-pr-"));
  const bodyFile = join(scratch, "body.md");
  try {
    await writeFile(bodyFile, spec.body, "utf8");
    const args = [
      "pr",
      "create",
      "--head",
      spec.branch,
      "--base",
      spec.base,
      "--title",
      spec.title,
      "--body-file",
      bodyFile,
    ];
    const created = await gh(path, args, dir, env, PR_TIMEOUT_MS);
    if (!created.ok) {
      throw ghFailed(created.stderr, spec.baseTaskId);
    }
    const url = lastLine(created.stdout);
    if (url === "") {
      throw ghFailed("gh created the pull request but printed no URL", spec.baseTaskId);
    }
    return url;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function ghFailed(said: string, baseTaskId: string | null): DaemonError {
  return new DaemonError(`gh could not create the pull request: ${said}`, {
    code: "gh-failed",
    hint:
      baseTaskId === null
        ? "Run `gh auth status` and try again, or create the PR from the compare page by hand."
        : `Open the parent's PR first: \`agn pr ${baseTaskId}\`.`,
  });
}

async function gh(
  path: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<GhCall> {
  try {
    const { stdout, stderr } = await run(path, args, { cwd, env, inheritEnv: false, timeoutMs });
    return { ok: true, stdout, stderr };
  } catch (cause) {
    if (cause instanceof ProcessError) {
      // A gh that never ran - not installed, timed out - says so in the error's own words.
      return { ok: false, stdout: cause.stdout, stderr: cause.stderr || cause.message };
    }
    throw cause;
  }
}

function lastLine(stdout: string): string {
  return (
    stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .at(-1)
      ?.trim() ?? ""
  );
}
