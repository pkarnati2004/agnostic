// The app's own page for when there is no workspace to show: starting, tmux missing, agnd failed,
// or the port held for another home. The main process says which in the query string.

const query = new URLSearchParams(window.location.search);

function copy(state) {
  const home = query.get("home") ?? "";
  switch (state) {
    case "tmux": {
      const version = query.get("version");
      return {
        title: "tmux is needed",
        detail:
          version === null
            ? "agnostic runs each agent in a tmux session. Install tmux 3.3 or newer, then check again."
            : `tmux ${version} was found; agnostic needs 3.3 or newer.`,
        command: "brew install tmux",
        button: "Check again",
        note: "No Homebrew? brew.sh. After installing it, quit and reopen agnostic so it sees the new PATH.",
      };
    }
    case "failed":
      return {
        title: "agnd could not start",
        command: query.get("log") ?? "",
        button: "Try again",
      };
    case "foreign":
      return {
        title: `Port ${query.get("port") ?? ""} is held by an agn daemon for ${home}.`,
        detail: `Stop it where it lives, or set another port in ${home}/config.yaml, then try again.`,
        button: "Try again",
      };
    default:
      return { title: "Starting agnd…" };
  }
}

function show(id, text) {
  const element = document.getElementById(id);
  if (element === null || text === undefined) {
    return;
  }
  element.textContent = text;
  element.hidden = false;
}

const page = copy(query.get("state"));
show("title", page.title);
show("detail", page.detail);
show("command", page.command);
show("recheck", page.button);
show("note", page.note);

document.getElementById("recheck")?.addEventListener("click", () => {
  window.agnosticStatus?.recheck();
});
