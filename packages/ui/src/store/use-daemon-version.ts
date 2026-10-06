import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";

/**
 * The daemon's version, read once per page load for the sidebar footer. A read that fails leaves
 * the footer without a version; whether agnd is answering is the feed's answer, not this one's.
 */
export function useDaemonVersion(client: WorkspaceClient): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void client.health().then(
      (response) => {
        if (live) {
          setVersion(response.version);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);
  return version;
}
