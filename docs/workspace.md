# Workspace

`agn ui` opens the workspace in your browser (a desktop app is planned).

- **Left:** your repos and their tasks. Dot = status: running, waiting for you, queued, done.
- **Center:** the live terminal for the selected task. This is the agent's own session - approve tools, use plan mode, switch models exactly as in a terminal. Tabs keep scrollback.
- **+ Task:** describe the work, see the recommendation, pick or accept, run.
- **Bottom:** usage per plan and today's API spend.

Everything the workspace shows comes from the local daemon; closing the tab loses nothing.
