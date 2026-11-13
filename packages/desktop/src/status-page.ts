import { pathToFileURL } from "node:url";

/** What the app shows while it has no workspace to show; `status.js` draws one per `state`. */
export type StatusState =
  | { kind: "starting" }
  | { kind: "tmux"; version: string | null }
  | { kind: "failed"; logFile: string }
  | { kind: "foreign"; home: string; port: number };

export function statusUrl(file: string, state: StatusState): string {
  const query = new URLSearchParams({ state: state.kind });
  switch (state.kind) {
    case "tmux":
      if (state.version !== null) {
        query.set("version", state.version);
      }
      break;
    case "failed":
      query.set("log", state.logFile);
      break;
    case "foreign":
      query.set("home", state.home);
      query.set("port", String(state.port));
      break;
    case "starting":
      break;
  }
  const url = pathToFileURL(file);
  url.search = query.toString();
  return url.href;
}
