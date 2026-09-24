import { join } from "node:path";
import { type CreatePrResponse, type DaemonClient, launchDetached } from "@agnostic/core";
import { Command } from "commander";
import { copyToClipboard } from "../clipboard.js";
import { type CliContext, writeJson } from "../context.js";
import { CliError } from "../error.js";
import { requireTaskId } from "../resolve-repo.js";

type PrFlags = { title?: string; open: boolean };

// What the opener prints if it prints anything; the URL itself is on stdout already.
const PR_LOG = "agn-pr.log";

/**
 * Pushes the task's branch to origin once and opens its pull request. With `gh` the PR is created
 * and this prints its address; without one, GitHub's compare page opens with the title filled in
 * and the description on the clipboard, ready to paste (ADR 036 Q5).
 */
export function prCommand(ctx: CliContext, platform: NodeJS.Platform = process.platform): Command {
  return new Command("pr")
    .description("push the task's branch and open its pull request")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .option("--title <title>", "the pull request's title; defaults to the task's")
    .option("--no-open", "print the address instead of opening it")
    .action(async (task: string | undefined, flags: PrFlags, command: Command) => {
      const client = await ctx.client();
      const id = await requireTaskId(ctx, command, task);
      if (!ctx.json) {
        await warnUncommitted(ctx, client, id);
      }
      const response = await client.createPr(
        id,
        flags.title === undefined ? {} : { title: flags.title },
      );
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of await report(ctx, response, platform)) {
        ctx.io.out(line);
      }
      if (flags.open) {
        await openUrl(ctx, platform, response.url);
      }
    });
}

/**
 * What the push will leave behind, said before it happens: only commits are pushed, and work the
 * agent has not committed stays in the worktree. A read that fails says nothing - the push is what
 * this command is for, and the panel says the same thing in the dialog.
 */
async function warnUncommitted(ctx: CliContext, client: DaemonClient, id: string): Promise<void> {
  const changes = await client.taskChanges(id).catch(() => null);
  if (changes !== null && changes.uncommitted > 0) {
    ctx.io.err(
      `agn: ${changes.uncommitted} uncommitted changes stay in the worktree; only commits are pushed`,
    );
  }
}

async function report(
  ctx: CliContext,
  response: CreatePrResponse,
  platform: NodeJS.Platform,
): Promise<string[]> {
  const lines = [
    response.pushed
      ? `pushed ${response.branch} to origin`
      : `${response.branch} already on origin`,
  ];
  if (response.via === "gh") {
    lines.push(`pr: ${response.url}`);
  } else {
    lines.push(`compare: ${response.url}`);
    lines.push(
      "no usable gh (not installed or not logged in): the PR is created on the page that opens",
    );
  }
  if (await copyToClipboard(ctx, response.body, platform)) {
    return [...lines, "body copied to the clipboard"];
  }
  // Nothing on this machine takes a clipboard, so the description is printed to be copied by hand.
  return [...lines, "--- body ---", ...response.body.split("\n")];
}

async function openUrl(ctx: CliContext, platform: NodeJS.Platform, url: string): Promise<void> {
  const opener = platform === "darwin" ? "open" : "xdg-open";
  try {
    await launchDetached(ctx.spawn, [opener, url], {
      env: ctx.env,
      logFile: join(ctx.paths.logs, PR_LOG),
    });
  } catch (cause) {
    throw new CliError(`could not open ${url}: ${reason(cause)}`, {
      code: "browser-open-failed",
      hint: "Open the printed address yourself, or pass --no-open.",
    });
  }
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
