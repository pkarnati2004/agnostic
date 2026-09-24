export type GithubRepo = { owner: string; repo: string };

/** `https://github.com/o/r`, `git@github.com:o/r` and `ssh://git@github.com/o/r`, `.git` optional. */
const FORMS = [
  /^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  /^ssh:\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  /^(?:[^@\s]+@)?github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
];

/** Which GitHub repo a remote URL names, or null when it names something else. */
export function parseGithubRemote(url: string): GithubRepo | null {
  const trimmed = url.trim();
  for (const form of FORMS) {
    const match = form.exec(trimmed);
    if (match?.[1] !== undefined && match[2] !== undefined && match[2] !== "") {
      return { owner: match[1], repo: match[2] };
    }
  }
  return null;
}

/**
 * GitHub's own compare page, which opens the new-pull-request form with the title filled in. The
 * refs go in as they are: a branch name may hold a slash, and encoding it would break the compare.
 */
export function compareUrl(
  remote: GithubRepo,
  base: string,
  branch: string,
  title: string,
): string {
  const path = `${remote.owner}/${remote.repo}/compare/${base}...${branch}`;
  return `https://github.com/${path}?expand=1&title=${encodeURIComponent(title)}`;
}
