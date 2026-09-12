# @agnostic/catalog

The data `agn` scores and bills with: one versioned JSON file, its schema, and the loader that
picks between the copy bundled here and a newer one downloaded into `~/.agnostic/catalog.json`.

- Six tables under one `schemaVersion`: `sources` (where every number came from, with its terms and
  the date it was read), `benchmarks` (one row per source x model x harness x task intent),
  `models` (what each harness will answer to, and the canonical id that joins it to everything
  else), `plans` (the tiers each vendor sells, so a new tier needs a catalog refresh and not an agn
  release), `entitlements` (whether a model is included, metered as credits, or unavailable on a
  plan), and `pricing` (USD per million tokens per canonical id).
- `loadCatalog` never throws. It reads both files, takes the higher `version` of the two that
  parse, and returns what went wrong as `problems` for the daemon to log.
- `freshness` decays a benchmark row from full weight at 180 days to nothing at 360.
- Benchmark rows name the harness that ran them wherever the source does. Red Hat's
  `coding_agent_bench` tables measure Pi and OpenCode as well as Claude Code and Codex, so all four
  tier-1 harnesses have harness-level evidence here and not only model-level rows.

- `updateCatalog` is the one outbound call agn makes (ADR 002): a GET of the published manifest,
  and a GET of the catalog only when the manifest names a newer version. It writes the download
  only when the checksum, the schema and the version all match the manifest, and replaces the file
  atomically. The timer, the last-check state file and the endpoints belong to the daemon.

It is not: scoring, explanations, pricing arithmetic, or the schedule. The file is generated
upstream by the `agnostic-catalog` repo; the copy here is a snapshot transcribed by hand.
