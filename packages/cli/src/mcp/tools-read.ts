import { RecommendRequestSchema, type RepoListRow, TaskStatusSchema } from "@agnostic/core";
import { z } from "zod";
import { resolveRepo, worktreeTaskId } from "../resolve-repo.js";
import { type McpTool, requireTask, TaskArgumentSchema } from "./tool.js";

const StatusArgsSchema = z.strictObject({
  repo: z.string().min(1).optional(),
  status: z.array(TaskStatusSchema).min(1).optional(),
});

const status: McpTool<z.infer<typeof StatusArgsSchema>> = {
  name: "agn_status",
  description:
    "Lists the repos agn knows and the tasks in them. `repo` takes a repo id, an id prefix or a path; give it and the answer holds that repo and its tasks alone, leave it out and the answer holds every repo and every task. `status` narrows the tasks to any of queued, running, waiting, done, failed and stopped, and defaults to every status.",
  schema: StatusArgsSchema,
  readOnly: true,
  async run(ctx, args) {
    const query = args.status === undefined ? {} : { status: args.status };
    if (args.repo === undefined) {
      const client = await ctx.client();
      const [repos, tasks] = await Promise.all([client.listRepos(), client.listAllTasks(query)]);
      return { repos: repos.repos, tasks: tasks.tasks };
    }
    const { repoId } = await resolveRepo(ctx, args.repo);
    const client = await ctx.client();
    const [repos, tasks] = await Promise.all([
      client.listRepos({ all: true }),
      client.listTasks(repoId, query),
    ]);
    return { repos: named(repos.repos, repoId), tasks: tasks.tasks };
  },
};

const task: McpTool<z.infer<typeof TaskArgumentSchema>> = {
  name: "agn_task",
  description:
    "Everything agn holds about one task: the task row, the outcome recorded when it closed, the tokens it spent and how those are billed. `task` takes a task id or an id prefix and defaults to the task of the worktree this server is running in.",
  schema: TaskArgumentSchema,
  readOnly: true,
  async run(ctx, args) {
    const id = await requireTask(ctx, "agn_task", args.task);
    const client = await ctx.client();
    const [row, outcome, usage] = await Promise.all([
      client.getTask(id),
      client.taskOutcome(id),
      client.taskUsage(id),
    ]);
    return {
      task: row.task,
      outcome: outcome.outcome,
      usage: usage.usage,
      billing: usage.billing,
    };
  },
};

const RecommendArgsSchema = RecommendRequestSchema.omit({ repoId: true }).extend({
  repo: z.string().min(1).optional(),
});

const recommend: McpTool<z.infer<typeof RecommendArgsSchema>> = {
  name: "agn_recommend",
  description:
    "Says which profile agn would run a prompt on and why, without starting anything. `prompt` is the task as the agent would be given it. `repo` takes a repo id, an id prefix or a path and defaults to the repo the working directory is in. `intent` replaces the class read out of the prompt and takes implement, debug, refactor, review, research, ui or general. `subscriptionsOnly` keeps the answer to profiles the user's plans already cover. `dryRun` answers without recording the recommendation.",
  schema: RecommendArgsSchema,
  readOnly: true,
  async run(ctx, args) {
    const { repo, ...body } = args;
    const { repoId } = await resolveRepo(ctx, repo);
    return await (await ctx.client()).recommend({ repoId, ...body });
  },
};

const usage: McpTool<z.infer<typeof TaskArgumentSchema>> = {
  name: "agn_usage",
  description:
    "Today's and this week's tokens and cost, per plan, from the transcripts on this machine, with the budgets from config.yaml over the same windows. `task` takes a task id or an id prefix and answers with that one task's tokens instead; it defaults to the task of the worktree this server is running in, and to the two windows when the working directory is not a task worktree.",
  schema: TaskArgumentSchema,
  readOnly: true,
  async run(ctx, args) {
    const id = await worktreeTaskId(ctx, args.task);
    const client = await ctx.client();
    return id === null ? await client.usage() : await client.taskUsage(id);
  },
};

const profiles: McpTool<Record<string, never>> = {
  name: "agn_profiles",
  description:
    "Lists the agent and model combinations that can run on this machine now, how each one is billed, and how much evidence the catalog holds for it. Takes no arguments.",
  schema: z.strictObject({}),
  readOnly: true,
  async run(ctx) {
    return await (await ctx.client()).profiles();
  },
};

export const readTools: McpTool<unknown>[] = [status, task, recommend, usage, profiles];

/** `repo` may be an id prefix, which the daemon resolved for the task list; this is the row it found. */
function named(repos: RepoListRow[], repoId: string): RepoListRow[] {
  return repos.filter((repo) => repo.id.startsWith(repoId));
}
