import {
  type AdoptRequest,
  ApiErrorBodySchema,
  type AttachResponse,
  type CleanTaskRequest,
  type CleanTaskResponse,
  type DoctorRequest,
  type DoctorResponse,
  type HandoffTaskRequest,
  type HandoffTaskResponse,
  type HealthResponse,
  type HooksInstallRequest,
  type HooksInstallResponse,
  type InitRequest,
  type InitResponse,
  type ProfilesResponse,
  type RecommendRequest,
  type RecommendResponse,
  type RegisterRepoRequest,
  type RegisterRepoResponse,
  type RepoListResponse,
  type ResumeTaskResponse,
  type RunTaskRequest,
  type SessionsResponse,
  type SyncRequest,
  type SyncResponse,
  type TaskListQuery,
  type TaskListResponse,
  type TaskResponse,
} from "./daemon-api.js";
import { DaemonApiError } from "./error.js";
import { type Event, EventSchema } from "./event.js";

const RECONNECT_MS = 1_000;
const START_HINT = "Run `agn daemon start`.";

export type DaemonClient = {
  health(): Promise<HealthResponse>;
  listRepos(): Promise<RepoListResponse>;
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
  doctor(request?: DoctorRequest): Promise<DoctorResponse>;
  /** Installs the status hook for one harness, or for every harness the repo could run. */
  installHooks(repoId: string, body: HooksInstallRequest): Promise<HooksInstallResponse>;
  /** Creates `.ag/`, seeding `instructions.md` from the repo's own instructions file. */
  initRepo(repoId: string, body: InitRequest): Promise<InitResponse>;
  /** Renders the generated instruction files; a dry run answers with the same plan unapplied. */
  syncRepo(repoId: string, body: SyncRequest): Promise<SyncResponse>;
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
    listRepos: () => json<RepoListResponse>("GET", "/repos"),
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
    doctor: (request) => json<DoctorResponse>("POST", "/doctor", request ?? {}),
    installHooks: (repoId, body) =>
      json<HooksInstallResponse>("POST", `/repos/${encodeURIComponent(repoId)}/hooks`, body),
    initRepo: (repoId, body) =>
      json<InitResponse>("POST", `/repos/${encodeURIComponent(repoId)}/init`, body),
    syncRepo: (repoId, body) =>
      json<SyncResponse>("POST", `/repos/${encodeURIComponent(repoId)}/sync`, body),
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

// The SSE line terminator is CRLF, CR or LF, and a blank line ends a frame (WHATWG "event stream").
const LINE = /\r\n|\r|\n/;

async function* readFrames(response: Response): AsyncGenerator<Event> {
  if (response.body === null) {
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lines: string[] = [];
  let buffer = "";
  while (true) {
    const chunk = await reader.read().catch(() => ({ done: true, value: undefined }) as const);
    if (chunk.done) {
      return;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const complete = buffer.split(LINE);
    // The last piece has no terminator yet, so it waits for the next chunk.
    buffer = complete.pop() ?? "";
    for (const line of complete) {
      if (line !== "") {
        lines.push(line);
        continue;
      }
      const event = parseFrame(lines);
      lines = [];
      if (event !== null) {
        yield event;
      }
    }
  }
}

/** Comments (`: ping`) and `retry:` carry no event; anything unparsable is skipped, not thrown. */
function parseFrame(lines: string[]): Event | null {
  // A field's value may be split over several `data:` lines, which rejoin with a newline.
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""));
  if (data.length === 0) {
    return null;
  }
  try {
    return EventSchema.parse(JSON.parse(data.join("\n")));
  } catch {
    return null;
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
