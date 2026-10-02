import type { HookInstallResult, LimitCapture, StatusLineInstall } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { resolveRepo } from "../resolve-repo.js";

type HooksFlags = { repo?: string; harness?: string };

/**
 * `agn run` installs hooks for the harness it is about to launch, so these commands are for the
 * three cases that leaves: a hook config the user deleted, a harness they want ready before they
 * run it, and taking agn's entries back out.
 */
export function hooksCommand(ctx: CliContext): Command {
  const hooks = new Command("hooks").description("install the hooks agn reads live status from");
  hooks
    .command("install")
    .description("install agn's status hook for a repo's harnesses")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--harness <id>", "install for this harness only")
    .action(async (flags: HooksFlags) => {
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      const response = await client.installHooks(repoId, body(flags));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of [
        ...installed(response.installs),
        ...statusLineLines(response.statusLine),
      ]) {
        ctx.io.out(line);
      }
    });
  hooks
    .command("uninstall")
    .description("remove agn's status hook and status line again")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--harness <id>", "remove for this harness only")
    .action(async (flags: HooksFlags) => {
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      const response = await client.uninstallHooks(repoId, body(flags));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of [...removed(response.uninstalls), ...restoredLines(response.statusLine)]) {
        ctx.io.out(line);
      }
    });
  return hooks;
}

function body(flags: HooksFlags): { harness?: string } {
  return flags.harness === undefined ? {} : { harness: flags.harness };
}

function installed(installs: HookInstallResult[]): string[] {
  if (installs.length === 0) {
    return ["no harness on this machine has a hook agn can install"];
  }
  return installs.flatMap((result) => [
    result.changed
      ? `installed ${result.harness} hooks: ${result.file}`
      : `${result.harness} hooks already installed: ${result.file}`,
    ...(result.verify === null ? [] : [`  verify: ${result.verify}`]),
  ]);
}

function removed(uninstalls: HookInstallResult[]): string[] {
  if (uninstalls.length === 0) {
    return ["no harness on this machine has a hook agn can install"];
  }
  return uninstalls.map((result) =>
    result.changed
      ? `removed ${result.harness} hooks: ${result.file}`
      : `${result.harness} had no hooks of agn's: ${result.file}`,
  );
}

/** The status line goes in the user's own settings file, so the install says which file and why. */
function statusLineLines(statusLine: StatusLineInstall | null): string[] {
  if (statusLine === null) {
    return [];
  }
  return [first(statusLine), `  status-line capture: ${captureName(statusLine.capture)}`];
}

function first(statusLine: StatusLineInstall): string {
  if (statusLine.capture === "agn-tasks") {
    return `left out of ${statusLine.file} (hooks.claude_statusline: repo)`;
  }
  return statusLine.changed
    ? `installed claude-code status line: ${statusLine.file}`
    : `claude-code status line already installed: ${statusLine.file}`;
}

function restoredLines(statusLine: StatusLineInstall | null): string[] {
  if (statusLine === null) {
    return [];
  }
  return [
    statusLine.changed
      ? `removed agn's status line: ${statusLine.file}`
      : `no status line of agn's in ${statusLine.file}`,
  ];
}

function captureName(capture: LimitCapture): string {
  switch (capture) {
    case "all-sessions":
      return "all sessions";
    case "agn-tasks":
      return "agn tasks only";
    case "none":
      return "none";
  }
}
