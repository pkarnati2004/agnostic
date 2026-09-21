import type {
  Event,
  HandoffTaskRequest,
  HandoffTaskResponse,
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
  SpecRequest,
  SpecResponse,
  TaskListResponse,
  TaskResponse,
  TaskUsageResponse,
  UsageResponse,
} from "@agnostic/core";
import { apiError, isAbortError, unreachable } from "./error";
import { streamEvents } from "./event-stream";

/** The part of the daemon's API the shell uses. Chunks 05-08 add their own calls here. */
export type WorkspaceClient = {
  /** Closed repos included: the page draws them in its own section and hides their tasks. */
  listRepos(): Promise<RepoListResponse>;
  /** 201 for a repo agn had never seen, 200 for one it already had (ADR 032). */
  registerRepo(body: RegisterRepoRequest): Promise<RegisterRepoResponse>;
  closeRepo(id: string): Promise<RepoResponse>;
  openRepo(id: string): Promise<RepoResponse>;
  /** Hides the repo for good and deletes the worktrees agn made for its tasks (ADR 034). */
  removeRepo(id: string): Promise<RemoveRepoResponse>;
  listTasks(): Promise<TaskListResponse>;
  getTask(id: string): Promise<TaskResponse>;
  profiles(): Promise<ProfilesResponse>;
  stopTask(id: string): Promise<TaskResponse>;
  resumeTask(id: string): Promise<ResumeTaskResponse>;
  handoffTask(id: string, body: HandoffTaskRequest): Promise<HandoffTaskResponse>;
  /** The pick for a prompt, with nothing started; `signal` aborts the call the next keystroke replaces. */
  recommend(body: RecommendRequest, signal: AbortSignal): Promise<RecommendResponse>;
  runTask(repoId: string, body: RunTaskRequest): Promise<TaskResponse>;
  /** A spec for a task that does not exist yet; the user approves it before Run (ADR 028). */
  writeSpec(repoId: string, body: SpecRequest): Promise<SpecResponse>;
  /** Both windows in one body; the daemon scans the transcripts before it answers (ADR 021). */
  usage(): Promise<UsageResponse>;
  taskUsage(id: string): Promise<TaskUsageResponse>;
  /** Ends when `signal` aborts; resumes from the last id seen while it does not. */
  events(after: number, signal: AbortSignal): AsyncIterable<Event>;
};

/** `baseUrl` defaults to the page's own origin: Vite's proxy in dev, the daemon in a build. */
export function createClient(opts: {
  baseUrl?: string;
  token: string;
  fetch?: typeof fetch;
}): WorkspaceClient {
  const doFetch = opts.fetch ?? fetch;
  const base = (opts.baseUrl ?? "").replace(/\/$/, "");
  const headers = { authorization: `Bearer ${opts.token}` };

  const send = async (
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const init: RequestInit = {
      method,
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    };
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, init);
    } catch (cause) {
      // The caller that aborted is the one that has to see it, unchanged.
      throw isAbortError(cause) ? cause : unreachable(base, cause);
    }
    if (!response.ok) {
      throw await apiError(response);
    }
    return response;
  };

  // Responses are built from the same core types the page reads them as, by a daemon of the same
  // version on loopback, so they are parsed once - at the daemon - and trusted here.
  const json = async <T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> => (await send(method, path, body, signal)).json() as Promise<T>;

  return {
    listRepos: () => json<RepoListResponse>("GET", "/repos?all=1"),
    registerRepo: (body) => json<RegisterRepoResponse>("POST", "/repos", body),
    closeRepo: (id) => json<RepoResponse>("POST", `/repos/${encodeURIComponent(id)}/close`),
    openRepo: (id) => json<RepoResponse>("POST", `/repos/${encodeURIComponent(id)}/open`),
    removeRepo: (id) => json<RemoveRepoResponse>("DELETE", `/repos/${encodeURIComponent(id)}`),
    listTasks: () => json<TaskListResponse>("GET", "/tasks"),
    getTask: (id) => json<TaskResponse>("GET", `/tasks/${encodeURIComponent(id)}`),
    profiles: () => json<ProfilesResponse>("GET", "/profiles"),
    stopTask: (id) => json<TaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/stop`),
    resumeTask: (id) => json<ResumeTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/resume`),
    handoffTask: (id, body) =>
      json<HandoffTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/handoff`, body),
    recommend: (body, signal) => json<RecommendResponse>("POST", "/recommend", body, signal),
    runTask: (repoId, body) =>
      json<TaskResponse>("POST", `/repos/${encodeURIComponent(repoId)}/tasks`, body),
    writeSpec: (repoId, body) =>
      json<SpecResponse>("POST", `/repos/${encodeURIComponent(repoId)}/spec`, body),
    usage: () => json<UsageResponse>("GET", "/usage"),
    taskUsage: (id) => json<TaskUsageResponse>("GET", `/tasks/${encodeURIComponent(id)}/usage`),
    events: (after, signal) =>
      streamEvents({ fetch: doFetch, baseUrl: base, token: opts.token, after, signal }),
  };
}
