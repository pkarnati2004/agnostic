import { z } from "zod";
import type { AttachInfo } from "./executor.js";
import type { Billing, HarnessId, Profile } from "./profile.js";
import type { Repo } from "./repo.js";
import { type Task, TaskStatusSchema } from "./task.js";

/** Fixed so the hook config chunk 9 writes into each repo survives a daemon restart. */
export const DEFAULT_DAEMON_PORT = 7431;

// Every error the daemon answers with, at every status: `code` is the CoreError code the CLI prints.
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    hint: z.string().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

// The contents of ~/.agnostic/daemon.json. A hint, not truth: readers verify the pid and the port.
export const DaemonInfoSchema = z.strictObject({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  startedAt: z.iso.datetime(),
});
export type DaemonInfo = z.infer<typeof DaemonInfoSchema>;

// The one unauthenticated response, so `agn daemon status` can tell "stale" from "not my token".
export const HealthResponseSchema = DaemonInfoSchema.extend({ version: z.string().min(1) });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export type RepoListResponse = { repos: Repo[] };

export const RegisterRepoRequestSchema = z.strictObject({
  // Absolute, or relative to the client's cwd: the client resolves before sending.
  path: z.string().min(1),
  gitInit: z.boolean().optional(),
  newId: z.boolean().optional(),
});
export type RegisterRepoRequest = z.infer<typeof RegisterRepoRequestSchema>;

/** 201 when the repo was inserted, 200 when it was already registered or had only moved. */
export type RegisterRepoResponse = { repo: Repo; created: boolean };

// `?status=running,waiting`: one repeated key would be friendlier to write and worse to read.
export const TaskListQuerySchema = z
  .strictObject({ status: z.string().min(1).optional() })
  .transform((query) => (query.status === undefined ? {} : { status: query.status.split(",") }))
  .pipe(z.strictObject({ status: z.array(TaskStatusSchema).min(1).optional() }));
export type TaskListQuery = z.output<typeof TaskListQuerySchema>;

export type TaskListResponse = { tasks: Task[] };
export type TaskResponse = { task: Task };

// The daemon resolves `profile`, so the CLI, the UI and any adapter get one set of rules: a whole
// profile id, or a bare harness id meaning that harness on its own default model and route.
export const RunTaskRequestSchema = z.strictObject({
  prompt: z.string().min(1),
  title: z.string().min(1).optional(),
  profile: z.string().min(1).optional(),
  /** Replaces the model segment of the resolved profile; never checked against a model list. */
  model: z.string().min(1).optional(),
  /** A git ref or a task id to branch from; a folder workspace has nothing to branch. */
  base: z.string().min(1).optional(),
});
export type RunTaskRequest = z.infer<typeof RunTaskRequestSchema>;

export const CleanTaskRequestSchema = z.strictObject({ deleteBranch: z.boolean().optional() });
export type CleanTaskRequest = z.infer<typeof CleanTaskRequestSchema>;

/** `removed` is false when there was nothing to remove: a folder task, or a worktree already gone. */
export type CleanTaskResponse = { task: Task; removed: boolean };

export type AttachResponse = { task: Task; attach: AttachInfo };

export type ModelSource = "probe" | "seed" | "none";

/** A registry `HarnessStatus` flattened for the wire; tier 2 and uninstalled rows carry `[]`. */
export type HarnessReport = {
  harness: HarnessId;
  name: string;
  binary: string;
  path: string | null;
  version: string | null;
  login: "logged-in" | "logged-out" | "unknown";
  billing: Billing;
  tier: 1 | 2;
  models: string[];
  modelSource: ModelSource;
};

export type DoctorResponse = {
  harnesses: HarnessReport[];
  profiles: Profile[];
  detectedAt: string;
  /** The PATH the daemon was started with, because that is what detection saw.  */
  pathVar: string;
};

export type ProfilesResponse = { profiles: Profile[]; detectedAt: string };

export const EventsQuerySchema = z.strictObject({
  after: z.coerce.number().int().nonnegative().optional(),
});
export type EventsQuery = z.output<typeof EventsQuerySchema>;
