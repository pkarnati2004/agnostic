# Workspace

`agn ui` opens the workspace in your browser (a desktop app is planned). It starts the daemon if
none is running, then opens `http://127.0.0.1:<port>/ui`. The daemon serves the page; nothing
leaves this machine.

```bash
agn ui                       # open it
agn ui --no-open             # print the address instead, to paste into another browser
```

The printed address ends in `#token=<token>`, which is how the page authenticates to the daemon.
The browser keeps the fragment to itself: it reaches no request line and no log. Treat that
address as a password, and open it only in your own browser.

If you pull a newer agn while a daemon from an older version is running, run `agn daemon restart`
once. A daemon that started before this version answers `/ui` with an authentication error rather
than the page.

- **Left:** your repos and their tasks. Dot = status: running, waiting for you, queued, done.
- **Center:** the live terminal for the selected task. This is the agent's own session - approve tools, use plan mode, switch models exactly as in a terminal. Tabs keep scrollback.
- **+ Task:** describe the work, see the recommendation, pick or accept, run.
- **Bottom:** usage per plan and today's API spend.

Everything the workspace shows comes from the local daemon; closing the tab loses nothing.

## After a task

`agn outcomes <task>` prints what one finished task cost and what became of it: how long the agent ran, its tokens and cost, the model it resolved to, the test results from before and after, how many lines it changed, and how many lines you changed afterwards. The verdict is `accepted` once the task's branch is merged into the base branch, by a merge commit or a squash; `reverted` once the branch is deleted or its worktree is removed without a merge; `not merged` until one of those happens. agn rechecks the open ones every five minutes and again whenever you ask for them, so a branch you merged a moment ago reads as accepted. A task that ran in a folder workspace has no branch of agn's, so its verdict and line counts print as `-`.

`agn stop` returns as soon as the agent is gone and finishes the task's accounting behind it: the usage scan, the repo's `test_command`, and the outcome row. An `agn outcomes` or `agn clean` run straight after a stop waits for that work, so it can take as long as your test command does.

## Working on the workspace itself

From a checkout: `pnpm build` writes the page the daemon serves, and `pnpm dev` runs the daemon
and the Vite dev server together, with the page on `http://127.0.0.1:5173/ui/`.
