import { resolve } from "node:path";
import type { DetectedHarness } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { repoContaining, resolveRepo } from "../resolve-repo.js";

type AdoptFlags = { task?: string; pid?: string; repo?: string };

export function adoptCommand(ctx: CliContext): Command {
  return new Command("adopt")
    .description("register an agent session you started outside agn")
    .argument("<path>", "the directory the agent is running in")
    .option("--task <title>", "a title for the task; defaults to the session agn found")
    .option("--pid <pid>", "adopt this process, when more than one agent is running there")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the repo the path is in")
    .action(async (path: string, flags: AdoptFlags, command: Command) => {
      const where = resolve(ctx.cwd, path);
      const repoId =
        flags.repo === undefined
          ? await repoContaining(ctx, where)
          : (await resolveRepo(ctx, flags.repo)).repoId;
      const client = await ctx.client();
      const { sessions } = await client.listSessions(repoId, where);
      const pid = chosenPid(command, sessions, flags.pid);
      if (pid === null) {
        // Nothing to adopt, or nothing agn may pick for the user: both are the user's next move.
        ctx.exitCode = 1;
        report(ctx, where, sessions);
        return;
      }
      const response = await client.adoptTask(repoId, {
        path: where,
        pid,
        ...(flags.task === undefined ? {} : { title: flags.task }),
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      ctx.io.out(`adopted ${response.task.id} ${response.task.title}`);
    });
}

/** One session is unambiguous; several need `--pid`, which is the same on a TTY and in a pipe. */
function chosenPid(
  command: Command,
  sessions: DetectedHarness[],
  flag: string | undefined,
): number | null {
  if (flag !== undefined) {
    const pid = Number(flag);
    if (!Number.isInteger(pid) || pid <= 0) {
      return command.error("error: --pid takes a process id", {
        exitCode: 2,
        code: "commander.invalidArgument",
      });
    }
    return pid;
  }
  return sessions.length === 1 ? (sessions[0]?.pid ?? null) : null;
}

function report(ctx: CliContext, path: string, sessions: DetectedHarness[]): void {
  if (ctx.json) {
    writeJson(ctx.io, { sessions });
    return;
  }
  if (sessions.length === 0) {
    ctx.io.err(`agn: no coding agent is running under ${path}`);
    return;
  }
  for (const session of sessions) {
    const where = session.tmux === null ? "not under tmux" : session.tmux.session;
    ctx.io.out(`${session.pid}  ${session.harness}  ${session.cwd}  ${where}`);
  }
  ctx.io.err("pass --pid <n> to pick one");
}
