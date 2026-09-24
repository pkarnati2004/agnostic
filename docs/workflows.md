# Workflows: the roles a repo's pipeline runs

A workflow names the roles that work on a task in one repo, in order. Each role has a task class, its own instructions, and optionally a profile it is pinned to. The declaration lives in `.ag/workflows/<name>.yaml`, next to the rest of the repo's context, and it is committed with the repo.

Workflows are optional. A repo with no `.ag/workflows/` folder runs tasks exactly as before.

## The file

```yaml
# Plan, implement, test and review, each by its own role. `agn sync` compiles this file into
# Claude Code's .claude/agents/ and .claude/commands/; edit here and run `agn sync` again.
name: tiered
description: Plan, implement, test and review, each by its own role.
roles:
  - name: architect
    class: research
    instructions: |
      Turn the task into a short plan: goal, files, signatures, acceptance criteria, out of scope.
      Write no code. Stop and ask when a choice changes an interface, a schema or a dependency.
  - name: developer
    class: implement
    instructions: |
      Implement the architect's plan. Run and test as you go. Report the files touched,
      deviations from the plan and why, and risks for review. No pasted logs.
  - name: test-writer
    class: implement
    instructions: |
      Write unit tests for the developer's change: one per acceptance criterion in the plan,
      plus one for each bug you find. Change no production code; report gaps instead.
  - name: reviewer
    class: review
    # Pin a profile on another harness than the developer's, so the review is independent:
    # profile: codex:default:native
    instructions: |
      Review the diff against the plan: correctness, size, naming, tests that exercise the
      change. Report findings with file and line. Change nothing.
```

## Every key

| Key | Required | What it is |
|---|---|---|
| `name` | yes | The workflow's name. It must equal the file's own name without `.yaml`: one workflow, one file, one `/<name>` command. Lowercase letters, digits and dashes, starting with a letter |
| `description` | no | One line, for `agn workflow list` |
| `roles` | yes | At least one role, in the order they run |
| `roles[].name` | yes | The role's name, under the same rule as `name`. Two roles cannot share one |
| `roles[].class` | yes | What the role's work is: `implement`, `debug`, `refactor`, `review`, `research`, `ui` or `general`. It is what agn uses to pick a model for the role |
| `roles[].profile` | no | A profile id such as `codex:default:native`, pinning the role to one agent and model. Absent, agn picks per class from your profiles when the workflow is compiled |
| `roles[].instructions` | no | What to tell this role, and only this role. `.ag/instructions.md` still applies to all of them |

A key the schema does not know is an error, not a comment: `agn` names the file and the key and stops.

## Writing one

```
agn workflow init                                   # .ag/workflows/tiered.yaml
agn workflow init --template single --name dev       # .ag/workflows/dev.yaml
agn workflow init --template none
```

`--template` chooses what is written:

| Template | What it writes |
|---|---|
| `tiered` | The four roles above: architect, developer, test-writer, reviewer. The default |
| `single` | One `developer` role that implements, tests and reports |
| `none` | Nothing. The repo keeps running tasks as it does today |

`--name <n>` names the workflow and its file; it defaults to the template's own name. `--force` overwrites a file that is already there; without it, `agn workflow init` refuses rather than replace what you wrote. `--repo <r>` acts on a repo other than the one you are in, and always on its registered checkout rather than a task worktree.

The templates are text with comments, including a commented-out `profile:` line. Uncomment it to pin a role.

## Reading them back

```
agn workflow list
agn workflow show tiered
```

`list` prints one row per workflow with its roles in order. `show` prints the workflow's fields and then each role: its number, name, class, the profile it is pinned to or `agn picks at sync`, and its instructions. Both take `--repo <r>` and `--json`.

## What `agn sync` does with it

Compiling a workflow into an agent's own files is the next piece of this feature. When it lands, `agn sync` writes each role into Claude Code's `.claude/agents/<role>.md` and the workflow into `.claude/commands/<name>.md`, with the model per role resolved from `roles[].profile` or picked by the recommender for the role's class. The file above is the one you edit; run `agn sync` again after you change it.

Until then, `agn workflow init|list|show` read and write the declaration and nothing else. A workflow file changes no task's behaviour on its own.
