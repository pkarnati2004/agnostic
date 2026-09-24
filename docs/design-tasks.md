# Design tasks

A design task is a task you do yourself, in a design tool. agn creates the worktree, the branch,
the ledger row and the note the way it does for an agent, opens the tool, and then waits. No agent
runs and nothing is billed.

```bash
agn run "wireframe the onboarding" --intent design
```

```
started t3n9v2wxyz wireframe the onboarding
worktree: ~/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz
branch:   agn/wireframe-the-onboarding-t3n9v2wxyz
design folder: ~/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz/design
opened Claude Design
finish:   agn stop t3n9v2wxyz
```

Save your files in the folder the `design folder:` line names. The task stays `waiting` until you
run `agn stop`, so it sits in the workspace's Needs you list while you work.

`--intent design` is the only way to start one. A prompt that mentions design, a mockup or Figma
still starts an agent.

`--no-open` creates the task without opening the tool and prints `open: agn open <task> --tool`
instead. `--json` prints the daemon's response and opens nothing.

## Which tool opens

`design_tool` in `~/.agnostic/config.yaml` chooses the tool, as `claude-design` or `figma`.
Absent means `claude-design`.

```yaml
design_tool: figma
```

agn looks for the tool's app bundle in the app directories `agn open` searches. It opens the bundle it
found when there is one, and the tool's web address when there is not.

The tool is opened with no folder argument. Neither tool documents taking a directory, and handing
one to an application that cannot read it shows that application's own error. The folder path is
printed instead, and it is in the task's note.

Both rows are unverified: the bundle names and addresses come from the products' own names, not
from a machine with them installed. If `agn open <task> --tool` opens the wrong thing, or nothing,
open an issue with the bundle name of your install and the address you use. The fix is one line in
`packages/registry/src/design-tool-list.ts`.

## Where the files go

`design_folder` in the repo's `.ag/agnostic.yaml` names the folder agn creates in the worktree.
Absent means `design`.

```yaml
design_folder: mockups
```

The path is relative to the worktree, and `..` in it is an error. The folder is created empty: what
the tool writes there is what the branch carries.

## Opening the tool again

```bash
agn open <task> --tool       # the design tool; the folder is printed, not passed
agn open <task>              # the worktree in your editor, as for any task
```

`--tool` and `--editor` together are a usage error.

## Finishing

```bash
agn stop <task>
```

The task settles `done` and agn appends a handoff section to `.ag/tasks/<task>.md` with no
recipient, reading `## Handoff at <timestamp>`. It holds the goal, the tool and folder the design
is in, and the files the branch changed - the same sections `agn handoff` writes.

Continue from the design in either direction:

```bash
agn run "build the page from the wireframe" --base <task>
agn handoff <task> --to claude-code
```

`agn handoff` on a design task that is still waiting finishes it first, then starts the next agent
on the design branch with your `--note`. It writes its own handoff section, so the one from
`agn stop` is not there.

## What a design task refuses

`agn resume`, `agn attach` and `agn update` answer `design-task-no-session`: there is no agent
session and there never was one. Open the tool with `agn open <task> --tool`, and finish with
`agn stop <task>`.

`--profile`, `--harness` and `--model` with `--intent design` are usage errors. The task runs in a
design tool; there is no profile to name.

The workspace cannot start a design task yet. `agn run --intent design` is the way in.
