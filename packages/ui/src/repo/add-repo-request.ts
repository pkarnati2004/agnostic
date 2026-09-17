import type { RegisterRepoRequest, RegisterRepoResponse, Repo } from "@agnostic/core";

/** What the dialog holds: the path the user typed and whether agn should make it a git repo. */
export type AddRepoForm = { path: string; gitInit: boolean };

/** The two lines a failure shows, whether it came from here or from the daemon. */
export type Failure = { message: string; hint: string | null };

/**
 * Null when the path is usable. A browser has no cwd and no picker that yields a real path - the
 * File System Access API hands back an opaque handle - so the field is typed text and the one rule
 * the page can check for itself is that the path is absolute. Windows path forms are out of scope
 * for v1: macOS and Linux both start an absolute path with a slash.
 */
export function pathProblem(path: string): Failure | null {
  const typed = path.trim();
  if (typed === "" || typed.startsWith("/")) {
    return null;
  }
  return {
    message: "Type the full path to the folder, starting with /.",
    hint: "The browser cannot expand ~ or a path relative to a terminal.",
  };
}

/** Null while there is nothing to send, which is also when Add is disabled. */
export function registerRequest(form: AddRepoForm): RegisterRepoRequest | null {
  const path = form.path.trim();
  if (path === "") {
    return null;
  }
  return { path, gitInit: form.gitInit };
}

export type AddResult =
  | { kind: "added"; repo: Repo }
  | { kind: "known"; repo: Repo }
  /** Registering a closed repo does not open it, exactly as `agn add` does not. */
  | { kind: "closed"; repo: Repo };

export function addResult(response: RegisterRepoResponse): AddResult {
  const { repo, created } = response;
  if (created) {
    return { kind: "added", repo };
  }
  return { kind: repo.status === "archived" ? "closed" : "known", repo };
}
