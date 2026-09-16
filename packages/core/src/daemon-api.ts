import { z } from "zod";
import { type Editor, type EditorId, EditorIdSchema } from "./editor.js";
import type { AttachInfo, DetectedHarness } from "./executor.js";
import type { Outcome } from "./outcome.js";
import type { Billing, HarnessId, Profile } from "./profile.js";
import type { Recommendation } from "./recommendation.js";
import type { Repo } from "./repo.js";
import { type Task, type TaskStatus, TaskStatusSchema } from "./task.js";
import { TaskIntentSchema } from "./task-intent.js";
import type { PlanUsage, UsageSum, UsageWindow } from "./usage.js";

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
// `home` is optional only so that a daemon older than this field still parses; a response without
// one is treated as another machine's daemon, never as ours to kill.
export const HealthResponseSchema = DaemonInfoSchema.extend({
  version: z.string().min(1),
  home: z.string().min(1).optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * A registered repo plus the one `.ag/agnostic.yaml` field a client needs to say what a run will
 * do. Read per request rather than stored: the file is the user's, and only the daemon reads it.
 */
export type RepoListRow = Repo & { testCommand: string | null };

// `cursor` is the ledger's latest event id, read before the rows in the same read transaction, so
// a page opening `/events` there misses nothing the snapshot lacks (ADR 030); the CLI ignores it.
export type RepoListResponse = { repos: RepoListRow[]; cursor: number };

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

/** `cursor` is the same snapshot cursor as the repo list's. */
export type TaskListResponse = { tasks: Task[]; cursor: number };
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
  /** Replaces what the classifier read out of the prompt, for this task only. */
  intent: TaskIntentSchema.optional(),
  /** Skips the repo's `test_command` before launch, so the agent starts at once (ADR 022). */
  skipTests: z.boolean().optional(),
  /** The approved spec, written by hand or by a model; absent means the prompt is the spec. */
  spec: z.string().min(1).optional(),
  acceptance: z.string().min(1).optional(),
});
export type RunTaskRequest = z.infer<typeof RunTaskRequestSchema>;

// `repoId` is in the body because a recommendation is about a repo without belonging to one: it
// is asked for before any task exists.
export const RecommendRequestSchema = z.strictObject({
  repoId: z.string().min(1),
  prompt: z.string().min(1),
  intent: TaskIntentSchema.optional(),
  /** Overrides `subscriptions_only` in preferences.yaml for this call only. */
  subscriptionsOnly: z.boolean().optional(),
});
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;

export type RecommendResponse = { recommendation: Recommendation };

// The daemon resolves `profile` exactly as it does for a run, so `--to` takes what `--profile` does.
export const HandoffTaskRequestSchema = z.strictObject({
  profile: z.string().min(1),
  /** What the user wrote, or the outgoing agent's own summary; agn adds the mechanical context. */
  note: z.string().min(1).optional(),
});
export type HandoffTaskRequest = z.infer<typeof HandoffTaskRequestSchema>;

/** The child first, because it is what the caller goes on to attach to; the parent as it was left. */
export type HandoffTaskResponse = { task: Task; parent: Task };

export const CleanTaskRequestSchema = z.strictObject({
  deleteBranch: z.boolean().optional(),
  /** Remove a worktree that still holds uncommitted work; only a person asking for it sets this. */
  force: z.boolean().optional(),
});
export type CleanTaskRequest = z.infer<typeof CleanTaskRequestSchema>;

/** `removed` is false when there was nothing to remove: a folder task, or a worktree already gone. */
export type CleanTaskResponse = { task: Task; removed: boolean };

export type AttachResponse = { task: Task; attach: AttachInfo };

/** `via` is the branch of the resume tree that was taken, which the CLI tells the user about. */
export type ResumeTaskResponse = {
  task: Task;
  via: "live" | "native" | "fresh";
  attach: AttachInfo;
  /** The branch a cleaned worktree was rebuilt from, null when it was still there. Orthogonal to
   * `via`: a rebuilt worktree still resumes natively when the harness gave us a session id. */
  recreatedFrom: string | null;
};

/** Detected editors in the daemon's preference order, and the one `agn open` would use. */
export type EditorsResponse = { editors: Editor[]; default: EditorId | null };

// `?editor=<id>` overrides the `editor` key in config.yaml for this one open.
export const OpenTaskQuerySchema = z.strictObject({ editor: EditorIdSchema.optional() });
export type OpenTaskQuery = z.infer<typeof OpenTaskQuerySchema>;

/** Everything an open needs, resolved by the daemon; the client runs `argv`, which opens `dir`. */
export type OpenTaskResponse = { task: Task; editor: Editor; dir: string; argv: string[] };

// The path a caller is asking about, which the daemon checks is the repo or inside it.
export const SessionsQuerySchema = z.strictObject({ path: z.string().min(1) });
export type SessionsQuery = z.infer<typeof SessionsQuerySchema>;

/** Candidates travel as data, never in an error hint: the caller picks one and sends its pid. */
export type SessionsResponse = { sessions: DetectedHarness[] };

export const AdoptRequestSchema = z.strictObject({
  path: z.string().min(1),
  /** One of the pids `GET /repos/:id/sessions` listed for that path. */
  pid: z.number().int().positive(),
  title: z.string().min(1).optional(),
});
export type AdoptRequest = z.infer<typeof AdoptRequestSchema>;

/** Hooks move a task between these two only; queued and the terminal statuses are never touched. */
export type HookStatus = Extract<TaskStatus, "running" | "waiting">;

/** The answer to a harness hook: what the event meant, and null when it meant no transition. */
export type HookResponse = { task: Task; applied: HookStatus | null };

/** One harness's hook config after an install; `verify` is the step agn could not do itself. */
export type HookInstallResult = {
  harness: HarnessId;
  file: string;
  changed: boolean;
  verify: string | null;
};

export const HooksInstallRequestSchema = z.strictObject({ harness: z.string().min(1).optional() });
export type HooksInstallRequest = z.infer<typeof HooksInstallRequestSchema>;

export type HooksInstallResponse = { installs: HookInstallResult[] };

export type ProfilesResponse = { profiles: Profile[]; detectedAt: string };

export const EventsQuerySchema = z.strictObject({
  after: z.coerce.number().int().nonnegative().optional(),
});
export type EventsQuery = z.output<typeof EventsQuerySchema>;

// `agn init` creates `.ag/`; the seed for `instructions.md` is an existing instructions file or
// agn's template, and the answer says which it was (ADR 017).
export const InitRequestSchema = z.strictObject({
  from: z.enum(["CLAUDE.md", "AGENTS.md"]).optional(),
  force: z.boolean().optional(),
});
export type InitRequest = z.infer<typeof InitRequestSchema>;

export type InitSource = "CLAUDE.md" | "AGENTS.md" | "template";

/** `file` is relative to the repo root; `source` is set only for a seeded `instructions.md`. */
export type InitWrite = {
  file: string;
  action: "created" | "kept" | "rewritten";
  source: InitSource | null;
};

export type InitResponse = { writes: InitWrite[] };

/**
 * Both windows in one body (ADR 021): one scan of the transcripts answers the day and the week,
 * so the CLI and the workspace's usage bar make one call. `scannedAt` is when that scan ran.
 */
export type UsageResponse = {
  day: { window: UsageWindow; plans: PlanUsage[] };
  week: { window: UsageWindow; plans: PlanUsage[] };
  scannedAt: string;
};

/** One task's outcome row. `outcome` is null until the task closes and agn records one. */
export type OutcomeResponse = { task: Task; outcome: Outcome | null };

/** One task's tokens. `billing` comes from the task's profile; null when it cannot be resolved. */
export type TaskUsageResponse = { task: Task; usage: UsageSum; billing: Billing | null };

/** The files `agn sync` generates from `.ag/instructions.md`, relative to the repo root. */
export type SyncTarget = "CLAUDE.md" | "AGENTS.md";

export type SyncAction = "create" | "update" | "unchanged" | "conflict";

/** `content` is what sync would write, whatever the action; `reason` is set for some of them. */
export type SyncWrite = {
  file: SyncTarget;
  action: SyncAction;
  content: string;
  reason: string | null;
};

export const SyncRequestSchema = z.strictObject({
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** `applied` is false after a dry run: the plan is the same, nothing on disk changed. */
export type SyncResponse = { writes: SyncWrite[]; applied: boolean };
