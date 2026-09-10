# Project context: `.ag/`

`agnostic` keeps everything an agent should know about a repo in one committed folder, and generates each agent's native config from it.

```
.ag/
  instructions.md     # the one file you maintain - conventions, architecture, do/don't
  preferences.yaml    # how the recommender should weigh quality, cost, speed
  decisions.md        # architecture decisions agents should respect
  tasks/              # one markdown file per task: spec, acceptance, status, handoff notes
  agnostic.yaml       # test and lint commands, default profile
```

`agn sync` writes `CLAUDE.md`, `AGENTS.md`, and OpenCode's config from `instructions.md`, each with a header noting it is generated. Edit `instructions.md`, not the generated files. Settings a specific agent needs that don't translate (Claude Code hooks, Codex sandbox flags) stay in that agent's own config; `agn sync` never touches them.

## Handoff notes

`agn handoff <task> --to <profile>` appends a handoff section to `.ag/tasks/<task>.md` - goal, decisions made, files touched, what was tried and failed - and starts the next agent with it as the first prompt. Native session history stays with the original agent; the note is what travels.
