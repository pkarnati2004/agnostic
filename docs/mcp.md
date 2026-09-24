# MCP: agn's commands as tools for an agent

`agn mcp` is an MCP server on stdin and stdout. Point a coding agent at it and that agent can list your repos and tasks, ask agn which agent suits a prompt, and start, hand off, stop and resume tasks - the same operations as the CLI, against the same daemon.

The server speaks MCP revision 2025-06-18 over the stdio transport. It exposes tools only: no resources, no prompts, no sampling.

The other direction - the MCP servers every agent working on a repo should have - is [`.ag/mcp.yaml`](#servers-for-a-repo-agmcpyaml).

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

## Servers for a repo: `.ag/mcp.yaml`

`agn mcp` points an agent at agn. This file points every agent at the same servers. Declare them once, and `agn sync` writes them into each harness's own config.

```yaml
# .ag/mcp.yaml - the MCP servers every agent on this repo gets; `agn sync` writes them out.
servers:
  db:
    command: npx
    args: ["-y", "@acme/db-mcp"]
    env:
      DATABASE_URL: $DATABASE_URL     # your shell's value, never the value itself
      LOG_LEVEL: info
  docs:
    url: https://mcp.example.com/docs
    headers:
      Authorization: $MCP_AUTH        # the whole header value: MCP_AUTH="Bearer …"
```

A server has a `command` to run or a `url` to reach, never both. A name is a JSON key and a TOML key at once, so it matches `[A-Za-z0-9][A-Za-z0-9_-]*`.

A value is either a literal with no `$` in it, or exactly `$NAME` - the variable of that name, read from the environment the agent starts in. `${NAME}`, `Bearer $TOKEN` and every other use of `$` is refused: write the whole value as `$NAME` and put the rest in the variable, `MCP_AUTH="Bearer …"`.

### What each agent gets

| Agent | File | How `$NAME` is written | Skipped when |
|---|---|---|---|
| Claude Code | `.mcp.json` in the repo | `${NAME}` | nothing of its own; a secret literal skips a server in every target, below |
| OpenCode | `opencode.json` in the repo | `{env:NAME}` | an `opencode.jsonc` is there instead: agn does not edit JSONC |
| Codex | a block in `~/.codex/config.toml` | `env_vars`, `env_http_headers` | an env key renames the variable: Codex forwards one only under its own name |

A skipped server is named in the output with the reason. The rest of the sync goes on.

The two files in the repo are merged by entry name: agn replaces the entries it declares, and every other entry, key and line stays where it was. Commit them, as you commit `CLAUDE.md` and `AGENTS.md`. Claude Code asks once, per project, before it uses a `.mcp.json` it has not seen.

An entry agn wrote earlier, which you then took out of `.ag/mcp.yaml`, stays in `.mcp.json` and `opencode.json`: agn cannot tell its own old entry from one you added by hand, so deleting it is yours. The Codex block is the exception, because it is rebuilt whole on every sync and holds only what the file names today.

### The Codex block

Codex has one config for the whole machine, so agn owns one marked block in it per repo:

```toml
# >>> agn mcp for r7k2m4pqrs: managed block, edits here are replaced >>>
[mcp_servers.db]
command = "npx"
args = ["-y", "@acme/db-mcp"]
env = { "LOG_LEVEL" = "info" }
env_vars = ["DATABASE_URL"]
# <<< agn mcp for r7k2m4pqrs <<<
```

Nothing outside the markers is touched, and the block is rebuilt whole on every sync. Two `[mcp_servers.db]` tables would make the file unparsable, so a name already used outside this repo's block - by another repo, or by you - stops the sync and says so. Rename the server in `.ag/mcp.yaml`, or remove the other table.

That check reads table headers written as a bare key, which is the form agn writes. A table you wrote as `[mcp_servers."db"]`, with the name in quotes, is not seen, so declaring `db` in `.ag/mcp.yaml` would leave Codex with two tables of one name; quote a table header only for a name that needs it, and give agn's servers names that do not.

### Secrets

A literal that looks like a credential - a known key prefix, a long high-entropy string, a hex digest - is never written to any of the three files. The server is skipped everywhere and the output says which key it was. Write `$NAME` and set `NAME` in your shell.

Each word of a value is judged on its own, so `Bearer ghp_…` written as a header literal is caught by the token in it. A short secret with no known prefix, and a password inside a connection string such as `postgres://app:hunter2@db/app`, both pass the rule; write those as `$NAME` too.

The value is in a committed file either way, so the message is the fix, not the protection: rotate anything you have already committed.
