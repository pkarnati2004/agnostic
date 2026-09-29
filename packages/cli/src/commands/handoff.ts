import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HandoffTaskRequest } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, type Stdin, writeJson } from "../context.js";
import { CliError } from "../error.js";
import { requireTaskId } from "../resolve-repo.js";
import { started } from "./run.js";

type HandoffFlags = { to?: string; note?: string; noteFile?: string; ignoreBudget?: boolean };

export function handoffCommand(ctx: CliContext): Command {
  return new Command("handoff")
    .description("stop a task and hand its work to another agent, with a note")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .option("--to <id|harness>", "a profile id, or a harness id for its defaults")
    .option("--note <text>", "what the next agent should know; `-` reads it from stdin")
    .option("--note-file <path>", "read the note from a file")
    .option("--ignore-budget", "hand off even though the budget in config.yaml is spent")
    .action(async (task: string | undefined, flags: HandoffFlags, command: Command) => {
      if (flags.note !== undefined && flags.noteFile !== undefined) {
        command.error("error: pass --note or --note-file, not both", {
          exitCode: 2,
          code: "commander.conflictingOption",
        });
      }
      const to =
        flags.to ??
        command.error("error: agn handoff needs --to <profile id or harness>", {
          exitCode: 2,
          code: "commander.missingMandatoryOptionValue",
        });
      const id = await requireTaskId(ctx, command, task);
      const client = await ctx.client();
      const response = await client.handoffTask(id, await request(ctx, to, flags));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      const { task: child, parent } = response;
      ctx.io.out(`handed off ${parent.id} to ${child.id} (${child.profileId})`);
      for (const line of started(child)) {
        ctx.io.out(line);
      }
    });
}

async function request(
  ctx: CliContext,
  profile: string,
  flags: HandoffFlags,
): Promise<HandoffTaskRequest> {
  const note = await noteText(ctx, flags);
  return {
    profile,
    ...(note === undefined ? {} : { note }),
    ...(flags.ignoreBudget === true ? { ignoreBudget: true } : {}),
  };
}

/** Three ways to say the same thing: the flag, a file, or whatever was piped in. */
async function noteText(ctx: CliContext, flags: HandoffFlags): Promise<string | undefined> {
  const text = await rawNote(ctx, flags);
  if (text === undefined) {
    return undefined;
  }
  if (text.trim() === "") {
    throw new CliError("the note you passed is empty", {
      code: "note-empty",
      hint: "Leave the note out to hand over with the default goal line.",
    });
  }
  return text.trim();
}

async function rawNote(ctx: CliContext, flags: HandoffFlags): Promise<string | undefined> {
  if (flags.noteFile !== undefined) {
    const path = resolve(ctx.cwd, flags.noteFile);
    return await readFile(path, "utf8").catch((cause: unknown) => {
      throw new CliError(`${path} could not be read`, {
        code: "note-file-unreadable",
        hint: "Check the path you passed to --note-file.",
        cause,
      });
    });
  }
  return flags.note === "-" ? await readAll(ctx.stdin) : flags.note;
}

/** Read to the end: at a terminal that is the user pressing ctrl-D, in a pipe the writer closing. */
async function readAll(stream: Stdin): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8"));
  }
  return chunks.join("");
}
