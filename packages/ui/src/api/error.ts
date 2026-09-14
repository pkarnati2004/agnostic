/**
 * What the page shows when a call fails: the daemon's own message and hint, so the workspace and
 * the CLI say the same thing about the same failure.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly hint: string | null;
  /** Null when the request never reached the daemon. */
  readonly status: number | null;

  constructor(
    message: string,
    opts: { code: string; hint?: string | null; status: number | null; cause?: unknown },
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "ApiError";
    this.code = opts.code;
    this.hint = opts.hint ?? null;
    this.status = opts.status;
  }
}

/** A non-2xx answer. The body is the daemon's error shape; anything else is a broken daemon. */
export async function apiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const parsed = errorBody(body);
  if (parsed === null) {
    return new ApiError(`the agn daemon answered ${response.status}`, {
      code: "daemon-response-invalid",
      hint: "Check ~/.agnostic/logs/agnd.log.",
      status: response.status,
    });
  }
  return new ApiError(parsed.message, {
    code: parsed.code,
    hint: parsed.hint,
    status: response.status,
  });
}

export function unreachable(baseUrl: string, cause: unknown): ApiError {
  return new ApiError(
    `the agn daemon is not answering on ${baseUrl === "" ? "this page" : baseUrl}`,
    {
      code: "daemon-unreachable",
      hint: "Run `agn daemon start`.",
      status: null,
      cause,
    },
  );
}

function errorBody(body: unknown): { code: string; message: string; hint: string | null } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, message, hint } = error as { code?: unknown; message?: unknown; hint?: unknown };
  if (typeof code !== "string" || code === "" || typeof message !== "string") {
    return null;
  }
  return { code, message, hint: typeof hint === "string" ? hint : null };
}
