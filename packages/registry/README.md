# @agnostic/registry

The table of coding agents `agn` knows how to start, and the detection that says which of them this
machine actually has.

- `harnesses` is data: binary and aliases, launch tokens, how a prompt is delivered, the model flag,
  the routes each harness supports, resume argv, hook and transcript locations, tier.
- `launchSpec` and `resumeSpec` turn a `Profile` into a command, args and the env that route adds -
  the one place that knows `--model` from `-m`, or which `-c` overrides point Codex at a local server.
- `detectHarnesses` reads a given `PATH` and home: binary present, `--version`, login state and plan
  from the harness's own files. `detectLocalServers` asks LM Studio and Ollama on loopback what they
  hold.
- `probeModels` asks an installed harness for its model list; the caller passes the catalog's model
  rows as the seed used when a probe fails or a harness has no list command.
- `enumerateProfiles` turns those findings plus the environment into the `Profile[]` the recommender
  scores.

It is not: hook installation, transcript parsing, tmux, HTTP, or caching. Nothing here holds state -
every function takes the environment it should look at, so tests never touch the real machine.
