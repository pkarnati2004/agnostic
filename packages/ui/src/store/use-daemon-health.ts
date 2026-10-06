import type { HealthResponse } from "@agnostic/core";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";

/**
 * What `GET /health` said, read once per page load for the sidebar footer and the Settings dialog:
 * the daemon's version and its pid. A read that fails leaves both without one; whether agnd is
 * answering is the feed's answer, not this one's.
 */
export function useDaemonHealth(client: WorkspaceClient): HealthResponse | null {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  useEffect(() => {
    let live = true;
    void client.health().then(
      (response) => {
        if (live) {
          setHealth(response);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);
  return health;
}
