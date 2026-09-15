import { defineConfig } from "vitest/config";

// Tests live beside their sources, so each project points at a directory and dist is never scanned.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: "packages/core",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          // Match the tsconfig customConditions so cross-package imports load source, not dist.
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "ledger",
          root: "packages/ledger",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "catalog",
          root: "packages/catalog",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "usage",
          root: "packages/usage",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "registry",
          root: "packages/registry",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "recommender",
          root: "packages/recommender",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "hooks",
          root: "packages/hooks",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "sync",
          root: "packages/sync",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "executor-tmux",
          root: "packages/executor-tmux",
          include: ["src/**/*.test.ts"],
          // A real tmux server per file, and worktrees on disk: these are not microsecond tests.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "daemon",
          root: "packages/daemon",
          include: ["src/**/*.test.ts"],
          // The task tests launch a fake harness under a real tmux; they are not unit tests.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "cli",
          root: "packages/cli",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
      {
        test: {
          // The page's own logic: token, client, frames, reducers, grouping, and the few
          // components with behaviour of their own, which opt into happy-dom file by file.
          name: "ui",
          root: "packages/ui",
          // The dev proxy's Origin rewrite is tested where it is written, beside the config.
          // A .test.tsx file renders a component and asks for happy-dom in its own first line.
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "vite.config.test.ts"],
        },
        resolve: {
          // The page itself imports only types from core; a test that checks a request body
          // against core's schemas needs the source behind them, as every other project does.
          conditions: ["development"],
        },
      },
      {
        test: {
          name: "scripts",
          root: ".",
          include: ["scripts/**/*.test.ts"],
        },
        resolve: {
          conditions: ["development"],
        },
      },
    ],
  },
});
