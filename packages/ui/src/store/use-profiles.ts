import type { Profile } from "@agnostic/core";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";

/** The profile list changes only when the daemon re-detects, so the page reads it once. */
export function useProfiles(client: WorkspaceClient): Profile[] {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    let live = true;
    // A list the page could not read leaves the handoff dialog with nothing to pick, which it says.
    const apply = (found: Profile[]) => {
      if (live) {
        setProfiles(found);
      }
    };
    void client.profiles().then(
      (response) => apply(response.profiles),
      () => apply([]),
    );
    return () => {
      live = false;
    };
  }, [client]);
  return profiles;
}
