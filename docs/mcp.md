# MCP: agn's commands as tools for an agent

`agn mcp` is an MCP server on stdin and stdout. Point a coding agent at it and that agent can list your repos and tasks, ask agn which agent suits a prompt, and start, hand off, stop and resume tasks - the same operations as the CLI, against the same daemon.

The server speaks MCP revision 2025-06-18 over the stdio transport. It exposes tools only: no resources, no prompts, no sampling.

## The tools

Five read the state:

| Tool | What it answers |
|---|---|
| `agn_status` | The repos agn knows and the tasks in them. `repo` narrows it to one repo, `status` to some statuses |
| `agn_task` | One task: its row, its outcome, its tokens and how they are billed |
| `agn_recommend` | Which profile agn would run a prompt on, and why. Starts nothing |
| `agn_usage` | Today's and this week's tokens and cost per plan, or one task's |
| `agn_profiles` | The agent and model combinations you can run right now |

Four change something:

| Tool | What it does |
|---|---|
| `agn_run` | Starts an agent on a task in a worktree of its own, and answers as soon as it is running |
| `agn_handoff` | Stops a task and starts another agent on its work, with a note |
| `agn_stop` | Stops a task's session; the worktree and the branch stay |
| `agn_resume` | Brings a session back and answers with the command that attaches to it. Attaches nothing |

Each tool answers with the JSON body the daemon returned, the same bytes `--json` prints. A failure agn has a code for - a task that does not exist, a budget that is spent - comes back as a tool result marked `isError`, carrying the code, the message and the hint. The agent can read it and act on it.

There is no tool for `agn clean`, `agn add`, `agn sync`, `agn hooks install` or the terminal. Deleting work and editing a repo's configuration stay with you.

## Claude Code

```
claude mcp add agn -- agn mcp
```

That writes the server into your user scope, so every project sees it. `--scope project` writes `.mcp.json` in the repo instead, which your team shares.

## Codex

Add the block to `~/.codex/config.toml`:

```toml
[mcp_servers.agn]
command = "agn"
args = ["mcp"]
```

Recent Codex versions also have `codex mcp add agn -- agn mcp`. Verify it on your version before you rely on it.

## What the server needs

Nothing in the config above but the command. `agn mcp` reads the daemon's token from `~/.agnostic/auth-token` when a tool runs, so no token is written into any agent's configuration file, and none is passed on a command line. The daemon starts on the first tool call, as it does for any other agn command.

Started inside an agn task worktree, the tools default to that task and its repo: `agn_handoff {"profile": "codex"}` with no `task` hands off the task the calling agent is running. That is how an agent asks for its own work to be passed on. Outside a worktree, pass `task` or `repo`; a tool that needs a task and cannot find one answers with the `task-required` code.

## Checking it by hand

```
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"x","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | agn mcp
```

Two lines come back: the server's `initialize` result and the tool list. Stdout carries protocol messages and nothing else; anything agn has to say to you goes to stderr.
