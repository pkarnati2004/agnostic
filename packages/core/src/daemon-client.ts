import { readFile } from "node:fs/promises";
import {
  ApiErrorBodySchema,
  type DaemonInfo,
  DaemonInfoSchema,
  type DoctorResponse,
  type HealthResponse,
  HealthResponseSchema,
  type ProfilesResponse,
  type RegisterRepoRequest,
  type RegisterRepoResponse,
  type RepoListResponse,
  type TaskListQuery,
  type TaskListResponse,
  type TaskResponse,
} from "./daemon-api.js";
import { DaemonApiError } from "./error.js";
import { type Event, EventSchema } from "./event.js";
import { type AgnosticPaths, agnosticPaths } from "./paths.js";
import { isProcessAlive } from "./process.js";
import { readTextFile } from "./read-text-file.js";

const HEALTH_TIMEOUT_MS = 2_000;
const RECONNECT_MS = 1_000;
const START_HINT = "Run `agn daemon start`.";

export async function readAuthToken(paths: AgnosticPaths = agnosticPaths()): Promise<string> {
  const token = await readTextFile(paths.authToken);
  if (token === null || token.trim() === "") {
    throw new DaemonApiError(`no auth token at ${paths.authToken}`, {
      code: "auth-token-missing",
      hint: START_HINT,
      status: null,
    });
  }
  return token.trim();
}

/** Null when the file is missing or was written by something else; the caller then probes. */
export async function readDaemonInfo(
  paths: AgnosticPaths = agnosticPaths(),
): Promise<DaemonInfo | null> {
  let text: string;
  try {
    text = await readFile(paths.daemon, "utf8");
  } catch {
    return null;
  }
  try {
    return DaemonInfoSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export type DaemonProbe = {
  state: "running" | "stale" | "stopped";
  info: DaemonInfo | null;
  health: HealthResponse | null;
};

/**
 * ADR 005: daemon.json is a hint. A file with a dead pid, a port that does not answer, or a
 * daemon answering with a different pid is stale, and stale is what `restart --force` cleans up.
 */
export async function probeDaemon(
  paths: AgnosticPaths = agnosticPaths(),
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<DaemonProbe> {
  const info = await readDaemonInfo(paths);
  if (info === null) {
    return { state: "stopped", info: null, health: null };
  }
  if (!isProcessAlive(info.pid)) {
    return { state: "stale", info, health: null };
  }
  const health = await readHealth(info.port, timeoutMs);
  if (health === null || health.pid !== info.pid) {
    return { state: "stale", info, health };
  }
  return { state: "running", info, health };
}

async function readHealth(port: number, timeoutMs: number): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    return HealthResponseSchema.parse(await response.json());
  } catch {
    return null;
  }
}

export type DaemonClient = {
  health(): Promise<HealthResponse>;
  listRepos(): Promise<RepoListResponse>;
  registerRepo(body: RegisterRepoRequest): Promise<RegisterRepoResponse>;
  listTasks(repoId: string, query?: TaskListQuery): Promise<TaskListResponse>;
  getTask(id: string): Promise<TaskResponse>;
  profiles(): Promise<ProfilesResponse>;
  doctor(): Promise<DoctorResponse>;
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
    getTask: (id) => json<TaskResponse>("GET", `/tasks/${encodeURIComponent(id)}`),
    profiles: () => json<ProfilesResponse>("GET", "/profiles"),
    doctor: () => json<DoctorResponse>("POST", "/doctor"),
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
