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
          name: "daemon",
          root: "packages/daemon",
          include: ["src/**/*.test.ts"],
        },
        resolve: {
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
