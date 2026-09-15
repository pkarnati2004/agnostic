# @agnostic/ui

The workspace page: every repo and task the daemon knows, with the tasks waiting for an answer at
the top, and Stop, Resume and Hand off for the selected one. React, Vite and Tailwind; the shadcn
primitives are copied into `src/components`, not depended on.

It is not a second source of truth. Every list, status and error comes from the daemon over HTTP
and its SSE feed, so a reload rebuilds the same view. It imports `@agnostic/core` for types only:
nothing from another package runs in the browser.

`pnpm --filter @agnostic/ui dev` serves the page on 5173 and proxies the daemon; point it at one
with `DAEMON_PORT`. `pnpm build` writes `dist/`, which the daemon serves at `/ui`.
