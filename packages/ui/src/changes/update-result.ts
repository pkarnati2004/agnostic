import type { UpdateTaskResponse } from "@agnostic/core";

/** What the panel says once the daemon has answered: what the agent was asked, and where. */
export function updateLine(response: UpdateTaskResponse): string {
  const asked =
    response.mode === "rebase"
      ? `Asked the agent to rebase onto \`${response.base}\`.`
      : `Asked the agent to merge \`${response.base}\` in.`;
  return response.via === "live" ? asked : `${asked} The session was resumed.`;
}
