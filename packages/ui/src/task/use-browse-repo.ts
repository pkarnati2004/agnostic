import { useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";
import { desktopBridge } from "../desktop/desktop-bridge";
import { addResult } from "../repo/add-repo-request";

/**
 * The repo chip's "Browse…" in the Mac app: the picked folder is registered as Add repo would,
 * then selected. A closed repo is reopened first, since the chip lists open repos only. In a
 * browser `browse` is null and the chip draws no item.
 */
export function useBrowseRepo(opts: {
  client: WorkspaceClient;
  onPicked: (repoId: string) => void;
  onReopen: (repoId: string) => Promise<void>;
}): { browse: (() => void) | null; error: ApiError | null } {
  const [error, setError] = useState<ApiError | null>(null);
  const bridge = desktopBridge();
  if (bridge === null) {
    return { browse: null, error: null };
  }
  const register = async (path: string) => {
    const result = addResult(await opts.client.registerRepo({ path, gitInit: false }));
    if (result.kind === "closed") {
      await opts.onReopen(result.repo.id);
    }
    opts.onPicked(result.repo.id);
  };
  const browse = () => {
    setError(null);
    bridge
      .pickFolder()
      .then((path) => (path === null ? undefined : register(path)))
      .catch((cause: unknown) => setError(asApiError(cause)));
  };
  return { browse, error };
}
