import type {
  Event,
  HandoffTaskRequest,
  HandoffTaskResponse,
  ProfilesResponse,
  RepoListResponse,
  ResumeTaskResponse,
  TaskListResponse,
  TaskResponse,
} from "@agnostic/core";
import { apiError, unreachable } from "./error";
import { streamEvents } from "./event-stream";

/** The part of the daemon's API the shell uses. Chunks 05-08 add their own calls here. */
export type WorkspaceClient = {
  listRepos(): Promise<RepoListResponse>;
  listTasks(): Promise<TaskListResponse>;
  getTask(id: string): Promise<TaskResponse>;
  profiles(): Promise<ProfilesResponse>;
  stopTask(id: string): Promise<TaskResponse>;
  resumeTask(id: string): Promise<ResumeTaskResponse>;
  handoffTask(id: string, body: HandoffTaskRequest): Promise<HandoffTaskResponse>;
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

  // Responses are built from the same core types the page reads them as, by a daemon of the same
  // version on loopback, so they are parsed once - at the daemon - and trusted here.
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await send(method, path, body)).json() as Promise<T>;

  return {
    listRepos: () => json<RepoListResponse>("GET", "/repos"),
    listTasks: () => json<TaskListResponse>("GET", "/tasks"),
    getTask: (id) => json<TaskResponse>("GET", `/tasks/${encodeURIComponent(id)}`),
    profiles: () => json<ProfilesResponse>("GET", "/profiles"),
    stopTask: (id) => json<TaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/stop`),
    resumeTask: (id) => json<ResumeTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/resume`),
    handoffTask: (id, body) =>
      json<HandoffTaskResponse>("POST", `/tasks/${encodeURIComponent(id)}/handoff`, body),
    events: (after, signal) =>
      streamEvents({ fetch: doFetch, baseUrl: base, token: opts.token, after, signal }),
  };
}
