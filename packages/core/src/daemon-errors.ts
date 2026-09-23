import { ApiErrorBodySchema } from "./daemon-api.js";
import { DaemonApiError } from "./error.js";

const START_HINT = "Run `agn daemon start`.";

/** The daemon's own error body, or a stand-in when it answered something this client cannot read. */
export async function apiError(response: Response): Promise<DaemonApiError> {
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

/** Nothing answered at all: there is no status, and the next step is starting the daemon. */
export function unreachable(base: string, cause: unknown): DaemonApiError {
  return new DaemonApiError(`the agn daemon is not answering on ${base}`, {
    code: "daemon-unreachable",
    hint: START_HINT,
    status: null,
    cause,
  });
}
