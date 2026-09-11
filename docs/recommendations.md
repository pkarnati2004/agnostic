# Recommendations

`agn recommend` (and the card in the workspace) picks among the agent × model profiles you can actually run.

**Inputs:** the task text, facts about the repo (languages, size, test command), your `.ag/preferences.yaml`, and a versioned benchmark catalog.

**Output:** a recommended profile with a one-sentence reason, an alternative, and - when the evidence is material - a "worth trying" profile you don't have yet, with the one step that would enable it: the environment variable to export for a key, or the command that installs the agent.

**Evidence labels:** *strong* (benchmarks for this exact agent + model on this kind of task), *some* (related tasks or a close model), *model-level only* (bare-model scores such as LiveBench), or *none* (falls back to your default). Never a percentage.

**The catalog** aggregates published results - Terminal-Bench, SWE-bench Verified/Pro, Aider Polyglot, LiveBench, and harness comparison tables - into one schema with source, date, model version, harness, task class, score, and cost. Rows age out. `agn catalog update` fetches the latest; `agn catalog show <profile>` prints the rows behind a recommendation. The catalog is open data; contributions welcome.

**Your own results** (tests passed, accepted vs reverted, how much you edited afterward, cost) are recorded per task. Once a repo has enough history for a task class, that history outweighs the public catalog for that repo.

The recommender makes no LLM calls. If a task is too ambiguous to classify, it asks one question instead of guessing.
