import type {
  AskCommitResponse,
  CreatePrRequest,
  CreatePrResponse,
  UpdateTaskResponse,
} from "./branch-api.js";
import type { CatalogRowsResponse, CatalogUpdateResponse } from "./catalog-api.js";
import type { ChangesResponse, DiffResponse } from "./changes-api.js";
import type {
  CompareResponse,
  PickCompareRequest,
  PickCompareResponse,
  StartCompareRequest,
  StartCompareResponse,
} from "./compare-api.js";
import type {
  AdoptRequest,
  AttachResponse,
  CleanTaskRequest,
  CleanTaskResponse,
  DeleteTaskResponse,
  EditorsResponse,
  HandoffTaskRequest,
  HandoffTaskResponse,
  HealthResponse,
  HooksInstallRequest,
  HooksInstallResponse,
  HooksUninstallResponse,
  InitRequest,
  InitResponse,
  OpenTaskResponse,
  OutcomeResponse,
  ProfilesResponse,
  RecommendRequest,
  RecommendResponse,
  RegisterRepoRequest,
  RegisterRepoResponse,
  RemoveRepoResponse,
  RepoListResponse,
  RepoResponse,
  ResumeTaskResponse,
  RunTaskRequest,
  SessionsResponse,
  TaskListQuery,
  TaskListResponse,
  TaskResponse,
} from "./daemon-api.js";
import { apiError, unreachable } from "./daemon-errors.js";
import type { DoctorRequest, DoctorResponse } from "./doctor-api.js";
import type { EditorId } from "./editor.js";
import type { Event } from "./event.js";
import { streamEvents } from "./event-stream.js";
import type { SpecRequest, SpecResponse } from "./spec-api.js";
import type { SyncRequest, SyncResponse } from "./sync-api.js";
import type { TaskUsageResponse, UsageResponse } from "./usage-api.js";

export type DaemonClient = {
  health(): Promise<HealthResponse>;
  /** Active repos only, unless `all`; a closed repo still resolves by id everywhere else. */
  listRepos(query?: { all?: boolean }): Promise<RepoListResponse>;
  closeRepo(id: string): Promise<RepoResponse>;
  openRepo(id: string): Promise<RepoResponse>;
  /** Hides the repo for good and deletes the worktrees agn made for its tasks (ADR 034). */
  removeRepo(id: string): Promise<RemoveRepoResponse>;
  registerRepo(body: RegisterRepoRequest): Promise<RegisterRepoResponse>;
  listTasks(repoId: string, query?: TaskListQuery): Promise<TaskListResponse>;
  /** Every repo at once, newest first, for `agn status` and the workspace's task list. */
  listAllTasks(query?: TaskListQuery): Promise<TaskListResponse>;
  getTask(id: string): Promise<TaskResponse>;
  runTask(repoId: string, body: RunTaskRequest): Promise<TaskResponse>;
  attachInfo(id: string): Promise<AttachResponse>;
  stopTask(id: string): Promise<TaskResponse>;
  cleanTask(id: string, body: CleanTaskRequest): Promise<CleanTaskResponse>;
  /** Removes the worktree and every row of the task; its usage rows stay with no task id (ADR 037). */
  deleteTask(id: string): Promise<DeleteTaskResponse>;
  resumeTask(id: string): Promise<ResumeTaskResponse>;
  /** Hands the task to another profile: the parent is stopped, the child starts from the note. */
  handoffTask(id: string, body: HandoffTaskRequest): Promise<HandoffTaskResponse>;
  /** The harness processes running under `path`, for `agn adopt` to choose from. */
  listSessions(repoId: string, path: string): Promise<SessionsResponse>;
  adoptTask(repoId: string, body: AdoptRequest): Promise<TaskResponse>;
  profiles(): Promise<ProfilesResponse>;
  /** The pick for a prompt, without starting anything; `agn run` records one of its own. */
  recommend(body: RecommendRequest): Promise<RecommendResponse>;
  /** A spec written by a headless agent, for the caller to approve before any task exists. */
  writeSpec(repoId: string, body: SpecRequest): Promise<SpecResponse>;
  /** The editors this machine has, and which one an open with no `--editor` would use. */
  editors(): Promise<EditorsResponse>;
  /** Where a task lives and what command opens it there; the caller runs the command. */
  openInfo(id: string, editor?: EditorId): Promise<OpenTaskResponse>;
  doctor(request?: DoctorRequest): Promise<DoctorResponse>;
  /** Installs the status hook for one harness, or for every harness the repo could run. */
  installHooks(repoId: string, body: HooksInstallRequest): Promise<HooksInstallResponse>;
  /** Removes what `installHooks` wrote, for the same harness or for all of them. */
  uninstallHooks(repoId: string, body: HooksInstallRequest): Promise<HooksUninstallResponse>;
  /** Creates `.ag/`, seeding `instructions.md` from the repo's own instructions file. */
  initRepo(repoId: string, body: InitRequest): Promise<InitResponse>;
  /** Renders the generated instruction files; a dry run answers with the same plan unapplied. */
  syncRepo(repoId: string, body: SyncRequest): Promise<SyncResponse>;
  /** Today's and this week's tokens per plan, from the transcripts on this machine. */
  usage(): Promise<UsageResponse>;
  taskUsage(id: string): Promise<TaskUsageResponse>;
  /** What the task's branch changed against its base, and the facts the right panel's header shows. */
  taskChanges(id: string): Promise<ChangesResponse>;
  /** One file's unified patch, by the path `taskChanges` printed for it. */
  taskDiff(id: string, path: string): Promise<DiffResponse>;
  /** Pushes the task's branch to origin once and opens its pull request (ADR 036 Q5). */
  createPr(id: string, body: CreatePrRequest): Promise<CreatePrResponse>;
  /** Asks the agent itself to bring the branch up to date with its base (ADR 036 Q6). */
  updateTask(id: string): Promise<UpdateTaskResponse>;
  /** Asks the agent to commit its work, with the repo's prompt or agn's default. */
  commitTask(id: string): Promise<AskCommitResponse>;
  /** Runs one prompt on two to four profiles, a worktree and a branch each (ADR 036 Q7). */
  startCompare(repoId: string, body: StartCompareRequest): Promise<StartCompareResponse>;
  /** The siblings of one compare side by side, with what each has spent and changed. */
  getCompare(id: string): Promise<CompareResponse>;
  /** Keeps one sibling and cleans the rest; their branches stay. */
  pickCompare(id: string, body: PickCompareRequest): Promise<PickCompareResponse>;
  /** What the task cost and what became of its branch; the daemon rechecks the verdict first. */
  taskOutcome(id: string): Promise<OutcomeResponse>;
  /** The catalog rows behind a profile, marked where the last recommendation leaned on them. */
  catalogRows(profile: string): Promise<CatalogRowsResponse>;
  /** Asks the published catalog whether it is newer, and downloads it when it is (ADR 002). */
  catalogUpdate(): Promise<CatalogUpdateResponse>;
  /** Resumes with `Last-Event-ID` after a dropped connection; ends when `signal` aborts. */
  events(after: number, signal: AbortSignal): AsyncIterable<Event>;
};

export function createDaemonClient(opts: {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}): DaemonClient {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, "");
  const headers = { authorization: `Bearer ${opts.token}` };

  const send = async (method: string, path: string, body?: unknown): Promise<Response> => {
    const init: RequestInit = {
      method,
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, init);
    } catch (cause) {
      throw unreachable(base, cause);
    }
    if (!response.ok) {
      throw await apiError(response);
    }
    return response;
  };

  // Responses are built from the same core types this client returns, by a daemon of the same
  // version on loopback, so they are parsed once - at the daemon - and trusted here.
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await send(method, path, body)).json() as Promise<T>;

  return {
    health: () => json<HealthResponse>("GET", "/health"),
    listRepos: (query) =>
      json<RepoListResponse>("GET", `/repos${query?.all === true ? "?all=1" : ""}`),
    closeRepo: (id) => json<RepoResponse>("POST", `/repos/${encodeURIComponent(id)}/close`),
    openRepo: (id) => json<RepoResponse>("POST", `/repos/${encodeURIComponent(id)}/open`),
    removeRepo: (id) => json<RemoveRepoResponse>("DELETE", `/repos/${encodeURIComponent(id)}`),
    registerRepo: (body) => json<RegisterRepoResponse>("POST", "/repos", body),
    listTasks: (repoId, query) =>
      json<TaskListResponse>("GET", `/repos/${encodeURIComponent(repoId)}/tasks${search(query)}`),
    listAllTasks: (query) => json<TaskListResponse>("GET", `/tasks${search(query)}`),
    getTask: (id) => json<TaskResponse>("GET", `/tasks/${encodeURIComponent(id)}`),
    runTask: (repoId, body) =>
      json<TaskResponse>("POST", `/repos/${encodeURIComponent(repoId)}/tasks`, body),
    attachInfo: (id) => json<AttachResponse>("GET", `/tasks/${encodeURIComponent(id)}/attach`),
    stopTask: (id) => json<TaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/stop`),
    cleanTask: (id, body) =>
      json<CleanTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/clean`, body),
    deleteTask: (id) => json<DeleteTaskResponse>("DELETE", `/tasks/${encodeURIComponent(id)}`),
    resumeTask: (id) => json<ResumeTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/resume`),
    handoffTask: (id, body) =>
      json<HandoffTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/handoff`, body),
    listSessions: (repoId, path) =>
      json<SessionsResponse>(
        "GET",
        `/repos/${encodeURIComponent(repoId)}/sessions?path=${encodeURIComponent(path)}`,
      ),
    adoptTask: (repoId, body) =>
      json<TaskResponse>("POST", `/repos/${encodeURIComponent(repoId)}/adopt`, body),
    profiles: () => json<ProfilesResponse>("GET", "/profiles"),
    recommend: (body) => json<RecommendResponse>("POST", "/recommend", body),
    writeSpec: (repoId, body) =>
      json<SpecResponse>("POST", `/repos/${encodeURIComponent(repoId)}/spec`, body),
    editors: () => json<EditorsResponse>("GET", "/editors"),
    openInfo: (id, editor) =>
      json<OpenTaskResponse>(
        "GET",
        `/tasks/${encodeURIComponent(id)}/open${editor === undefined ? "" : `?editor=${editor}`}`,
      ),
    doctor: (request) => json<DoctorResponse>("POST", "/doctor", request ?? {}),
    installHooks: (repoId, body) =>
      json<HooksInstallResponse>("POST", `/repos/${encodeURIComponent(repoId)}/hooks`, body),
    uninstallHooks: (repoId, body) =>
      json<HooksUninstallResponse>("DELETE", `/repos/${encodeURIComponent(repoId)}/hooks`, body),
    initRepo: (repoId, body) =>
      json<InitResponse>("POST", `/repos/${encodeURIComponent(repoId)}/init`, body),
    syncRepo: (repoId, body) =>
      json<SyncResponse>("POST", `/repos/${encodeURIComponent(repoId)}/sync`, body),
    usage: () => json<UsageResponse>("GET", "/usage"),
    taskUsage: (id) => json<TaskUsageResponse>("GET", `/tasks/${encodeURIComponent(id)}/usage`),
    taskChanges: (id) => json<ChangesResponse>("GET", `/tasks/${encodeURIComponent(id)}/changes`),
    taskDiff: (id, path) =>
      json<DiffResponse>(
        "GET",
        `/tasks/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}`,
      ),
    createPr: (id, body) =>
      json<CreatePrResponse>("POST", `/tasks/${encodeURIComponent(id)}/pr`, body),
    updateTask: (id) => json<UpdateTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/update`),
    commitTask: (id) => json<AskCommitResponse>("POST", `/tasks/${encodeURIComponent(id)}/commit`),
    startCompare: (repoId, body) =>
      json<StartCompareResponse>("POST", `/repos/${encodeURIComponent(repoId)}/compare`, body),
    getCompare: (id) => json<CompareResponse>("GET", `/compares/${encodeURIComponent(id)}`),
    pickCompare: (id, body) =>
      json<PickCompareResponse>("POST", `/compares/${encodeURIComponent(id)}/pick`, body),
    taskOutcome: (id) => json<OutcomeResponse>("GET", `/tasks/${encodeURIComponent(id)}/outcome`),
    catalogRows: (profile) =>
      json<CatalogRowsResponse>("GET", `/catalog/rows?profile=${encodeURIComponent(profile)}`),
    catalogUpdate: () => json<CatalogUpdateResponse>("POST", "/catalog/update"),
    events: (after, signal) => streamEvents(doFetch, base, headers, after, signal),
  };
}

function search(query: TaskListQuery | undefined): string {
  if (query?.status === undefined || query.status.length === 0) {
    return "";
  }
  return `?status=${query.status.join(",")}`;
}
