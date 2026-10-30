# CLI reference

`agn` is the command-line interface to the daemon. Every command below works without the
workspace open. `agn --help` and `agn <command> --help` print the same information.

| Command | What it does |
|---|---|
| `agn daemon start\|stop\|status\|restart` | Run, inspect or replace the background daemon. `--port <n>` on `start` and `restart`, `--force` on `restart` |
| `agn add <path>` | Register a repo. `--git-init` runs `git init` on a plain folder first; `--new-id` registers a second clone |
| `agn repos` | List the registered repos and mark a repo whose folder is missing. `--all` includes closed ones and names each one's status |
| `agn repo close\|open\|remove <repo>` | Close a repo so it leaves the list and the workspace, keeping its history, or open it again. `remove` hides a repo for good and deletes the worktrees agn made for its tasks, keeping its history; `agn add <path>` brings it back. Close and remove are refused while a task is running or waiting |
| `agn doctor` | Detect installed agents, logins, provider keys, local model servers |
| `agn profiles` | List the agent × model combinations you can run right now |
| `agn run "<task>"` | Create a worktree and start an agent. `--profile <id>`, `--harness other:<binary>`, `--model <m>`, `--repo <r>`, `--title <t>`, `--base <ref\|task>`, `--intent <class>`, `--skip-tests`, `--ignore-budget` |
| `agn status [<task>]` | One task, or every task across your repos. `--all` lists everything from inside a worktree |
| `agn attach [<task>]` | Join the session in your terminal; defaults to the task of the worktree you are in |
| `agn stop <task>` | Stop the session |
| `agn clean [<task>...]` | Remove the worktrees of closed tasks. `--delete-branch` removes the branch too; `--force` removes a worktree that still holds uncommitted work |
| `agn task delete <task>` | Remove the task's worktree and every agn record of it: the row, its events and its outcome. Its branch stays, and so do its usage rows, with no task to count them against. Refused while the task runs |
| `agn resume [<task>]` | Bring a session back after a reboot, with its history where the agent supports it |
| `agn adopt <path>` | Register an agent session you started outside agn. `--task "<title>"`, `--pid <n>`, `--repo <r>` |
| `agn hooks install` | Install the status hook in a repo. `--repo <r>`, `--harness <id>` |
| `agn hooks uninstall` | Remove the status hook and the status line again. `--repo <r>`, `--harness <id>` |
| `agn init` | Create `.ag/`, seeding `instructions.md` from an existing `CLAUDE.md` or `AGENTS.md`. `--from <file>`, `--force`, `--repo <r>` |
| `agn sync` | Regenerate `CLAUDE.md` and `AGENTS.md` from `.ag/instructions.md`, and the MCP servers of `.ag/mcp.yaml` into each agent's own config. `--dry-run`, `--force`, `--repo <r>` |
| `agn recommend "<task>"` | Recommend a profile, with reasons and sources. `--repo <r>`, `--intent <class>`, `--subscriptions-only` |
| `agn handoff [<task>] --to <id\|harness>` | Stop a task and hand its work to another agent with a structured note. `--note <text>` (`-` reads stdin), `--note-file <path>` |
| `agn usage [<task>]` | Today's and this week's usage per plan, or one task's |
| `agn outcomes <task>` | What the task changed, what passed, what you kept |
| `agn changes [<task>]` | Files the task changed against its base, with counts and whether each is unstaged, staged or committed. `--patch <path>` prints one file's diff |
| `agn pr [<task>]` | Push the branch and open its pull request. `--title <t>`, `--no-open` |
| `agn update [<task>]` | Ask the agent to bring the branch up to date with its base: rebase if never pushed, merge if pushed |
| `agn commit [<task>]` | Ask the agent to commit its uncommitted work, with the prompt in `.ag/prompts/commit.md` or agn's default |
| `agn compare "<prompt>"` | Run one prompt on 2-4 profiles at once, one worktree each. `--profiles a,b`; omitted, agn's pick and its alternative |
| `agn compare show <id>` | One table over the agents: files, lines, tests, cost, time |
| `agn compare pick <id> <task>` | Keep one; the others are stopped and their worktrees removed, branches kept |
| `agn open [<task>]` | Open the task's directory in your editor. `--editor <id>` |
| `agn catalog show <profile>` / `agn catalog update` | Print the benchmark rows behind a recommendation, or fetch the latest catalog |
| `agn mcp` | Serve agn's commands to an agent over MCP on stdin and stdout; see [docs/mcp.md](docs/mcp.md) |
| `agn ui` | Open the workspace in your browser. `--no-open` prints the address instead |

Every command prints plain text: one aligned table for a list, `key: value` lines for a single
thing, no colours. `--json` prints the daemon's response body instead, so scripts read the same
types the UI does. Errors go to stderr as `agn: <message>` with an indented hint. Exit codes are 0
for ok, 1 for a command that failed and 2 for a command line that was wrong; `agn daemon status`
answers with its code instead (0 running, 1 stopped, 2 stale).

Any command starts the daemon if it is not already running, except `agn daemon status` and
`agn daemon stop`. `AGNOSTIC_HOME` moves everything agn stores away from `~/.agnostic`.
