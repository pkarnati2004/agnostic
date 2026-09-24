import { HandoffTaskRequestSchema, RunTaskRequestSchema } from "@agnostic/core";
import { z } from "zod";
import { resolveRepo } from "../resolve-repo.js";
import { type McpTool, requireTask, TaskArgumentSchema } from "./tool.js";

const RunArgsSchema = RunTaskRequestSchema.extend({ repo: z.string().min(1).optional() });

const run: McpTool<z.infer<typeof RunArgsSchema>> = {
  name: "agn_run",
  description:
    "Starts an agent on a task in a git worktree of its own and answers as soon as it is running; nothing here waits for the agent to finish. `prompt` is what the agent should do. `title` defaults to the first line of the prompt. `profile` takes a profile id, or a bare harness id for that agent on its own defaults, and defaults to agn's own recommendation. `model` replaces the model of the resolved profile. `base` is a git ref or a task id to branch from, and defaults to the repo's head. `intent` replaces the class read out of the prompt. `skipTests` starts the agent without running the repo's test command first. `spec` and `acceptance` carry an approved spec. `ignoreBudget` starts the task although the budget in config.yaml is spent. `repo` takes a repo id, an id prefix or a path and defaults to the repo the working directory is in.",
  schema: RunArgsSchema,
  readOnly: false,
  async run(ctx, args) {
    const { repo, ...body } = args;
    const { repoId } = await resolveRepo(ctx, repo);
    return await (await ctx.client()).runTask(repoId, body);
  },
};

const HandoffArgsSchema = HandoffTaskRequestSchema.extend({
  task: z.string().min(1).optional(),
});

const handoff: McpTool<z.infer<typeof HandoffArgsSchema>> = {
  name: "agn_handoff",
  description:
    "Stops a task and starts another agent on its work, from a note that says what was done. `profile` takes a profile id, or a bare harness id for that agent on its own defaults, and says who picks the work up. `note` is what the next agent should know; agn adds the mechanical context around it. `ignoreBudget` hands off although the budget in config.yaml is spent. `task` takes a task id or an id prefix and defaults to the task of the worktree this server is running in, which is the caller's own task when agn started it.",
  schema: HandoffArgsSchema,
  readOnly: false,
  async run(ctx, args) {
    const { task, ...body } = args;
    const id = await requireTask(ctx, "agn_handoff", task);
    return await (await ctx.client()).handoffTask(id, body);
  },
};

const stop: McpTool<z.infer<typeof TaskArgumentSchema>> = {
  name: "agn_stop",
  description:
    "Stops a task's session; its worktree and its branch stay until they are cleaned. `task` takes a task id or an id prefix and defaults to the task of the worktree this server is running in.",
  schema: TaskArgumentSchema,
  readOnly: false,
  async run(ctx, args) {
    const id = await requireTask(ctx, "agn_stop", args.task);
    return await (await ctx.client()).stopTask(id);
  },
};

const resume: McpTool<z.infer<typeof TaskArgumentSchema>> = {
  name: "agn_resume",
  description:
    "Brings a stopped task's session back, with its history where the agent supports it, and answers with the command that attaches a terminal to it; nothing attaches here. `task` takes a task id or an id prefix and defaults to the task of the worktree this server is running in.",
  schema: TaskArgumentSchema,
  readOnly: false,
  async run(ctx, args) {
    const id = await requireTask(ctx, "agn_resume", args.task);
    return await (await ctx.client()).resumeTask(id);
  },
};

export const writeTools: McpTool<unknown>[] = [run, handoff, stop, resume];
