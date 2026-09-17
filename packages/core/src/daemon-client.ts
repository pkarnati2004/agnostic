import type { CatalogRowsResponse, CatalogUpdateResponse } from "./catalog-api.js";
import {
  type AdoptRequest,
  ApiErrorBodySchema,
  type AttachResponse,
  type CleanTaskRequest,
  type CleanTaskResponse,
  type EditorsResponse,
  type HandoffTaskRequest,
  type HandoffTaskResponse,
  type HealthResponse,
  type HooksInstallRequest,
  type HooksInstallResponse,
  type InitRequest,
  type InitResponse,
  type OpenTaskResponse,
  type OutcomeResponse,
  type ProfilesResponse,
  type RecommendRequest,
  type RecommendResponse,
  type RegisterRepoRequest,
  type RegisterRepoResponse,
  type RepoListResponse,
  type RepoResponse,
  type ResumeTaskResponse,
  type RunTaskRequest,
  type SessionsResponse,
  type SyncRequest,
  type SyncResponse,
  type TaskListQuery,
  type TaskListResponse,
  type TaskResponse,
  type TaskUsageResponse,
  type UsageResponse,
} from "./daemon-api.js";
import type { DoctorRequest, DoctorResponse } from "./doctor-api.js";
import type { EditorId } from "./editor.js";
import { DaemonApiError } from "./error.js";
import type { Event } from "./event.js";
import { readFrames } from "./event-frames.js";
import type { SpecRequest, SpecResponse } from "./spec-api.js";

const RECONNECT_MS = 1_000;
const START_HINT = "Run `agn daemon start`.";

export type DaemonClient = {
  health(): Promise<HealthResponse>;
  /** Active repos only, unless `all`; a closed repo still resolves by id everywhere else. */
  listRepos(query?: { all?: boolean }): Promise<RepoListResponse>;
  closeRepo(id: string): Promise<RepoResponse>;
  openRepo(id: string): Promise<RepoResponse>;
  registerRepo(body: RegisterRepoRequest): Promise<RegisterRepoResponse>;
  listTasks(repoId: string, query?: TaskListQuery): Promise<TaskListResponse>;
  /** Every repo at once, newest first, for `agn status` and the workspace's task list. */
  listAllTasks(query?: TaskListQuery): Promise<TaskListResponse>;
  getTask(id: string): Promise<TaskResponse>;
  runTask(repoId: string, body: RunTaskRequest): Promise<TaskResponse>;
  attachInfo(id: string): Promise<AttachResponse>;
  stopTask(id: string): Promise<TaskResponse>;
  cleanTask(id: string, body: CleanTaskRequest): Promise<CleanTaskResponse>;
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
  /** Creates `.ag/`, seeding `instructions.md` from the repo's own instructions file. */
  initRepo(repoId: string, body: InitRequest): Promise<InitResponse>;
  /** Renders the generated instruction files; a dry run answers with the same plan unapplied. */
  syncRepo(repoId: string, body: SyncRequest): Promise<SyncResponse>;
  /** Today's and this week's tokens per plan, from the transcripts on this machine. */
  usage(): Promise<UsageResponse>;
  taskUsage(id: string): Promise<TaskUsageResponse>;
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
    initRepo: (repoId, body) =>
      json<InitResponse>("POST", `/repos/${encodeURIComponent(repoId)}/init`, body),
    syncRepo: (repoId, body) =>
      json<SyncResponse>("POST", `/repos/${encodeURIComponent(repoId)}/sync`, body),
    usage: () => json<UsageResponse>("GET", "/usage"),
    taskUsage: (id) => json<TaskUsageResponse>("GET", `/tasks/${encodeURIComponent(id)}/usage`),
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

async function* streamEvents(
  doFetch: typeof fetch,
  base: string,
  headers: Record<string, string>,
  after: number,
  signal: AbortSignal,
): AsyncGenerator<Event> {
  let cursor = after;
  let connected = false;
  while (!signal.aborted) {
    let response: Response;
    try {
      response = await doFetch(`${base}/events?after=${cursor}`, {
        headers: connected ? { ...headers, "last-event-id": String(cursor) } : headers,
        signal,
      });
    } catch (cause) {
      if (signal.aborted) {
        return;
      }
      // A drop mid-stream is the daemon restarting; the first connect failing is a real problem.
      if (!connected) {
        throw unreachable(base, cause);
      }
      await delay(RECONNECT_MS, signal);
      continue;
    }
    if (!response.ok) {
      throw await apiError(response);
    }
    connected = true;
    for await (const event of readFrames(response)) {
      cursor = event.id;
      yield event;
    }
    await delay(RECONNECT_MS, signal);
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function apiError(response: Response): Promise<DaemonApiError> {
  const parsed = ApiErrorBodySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return new DaemonApiError(`the agn daemon answered ${response.status}`, {
      code: "daemon-response-invalid",
      hint: "Check ~/.agnostic/logs/agnd.log.",
      status: response.status,
    });
  }
  const { code, message, hint } = parsed.data.error;
  return new DaemonApiError(message, {
    code,
    status: response.status,
    ...(hint === undefined ? {} : { hint }),
  });
}

function unreachable(base: string, cause: unknown): DaemonApiError {
  return new DaemonApiError(`the agn daemon is not answering on ${base}`, {
    code: "daemon-unreachable",
    hint: START_HINT,
    status: null,
    cause,
  });
}
