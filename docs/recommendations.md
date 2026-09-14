# Recommendations

`agn recommend "<task>"` prints the profile agn would run a task on, and why. `agn run` makes the
same pick and stores it on the task, whether or not you take it.

```
$ agn recommend "fix the flaky auth test in petal"
Task: debug, small, risk: auth
Recommended: claude-code:opus:native - strong debug evidence for this agent and model; included in your plan · evidence: strong · sources: swe-bench-verified, terminal-bench
Alternative: codex:gpt-5.6-sol:native - related benchmarks only (general); included in your plan
Worth trying: pi:moonshotai/kimi-k2.7-code:openrouter - scores 11 points higher on debug benchmarks · enable: export OPENROUTER_API_KEY=<your key>
Risk: touches auth; an independent review is advised
```

The lines after `Recommended` appear only when there is something to say. Output is the same in a
terminal and in a pipe; `--json` prints the whole response.

## The task class

The first line is what agn made of your prompt: intent, scope, the risk areas it touched, and
whether it needs a browser. The rules are keyword rules, so the same prompt always gives the same
class:

- **Intent** is the first match among debug, review, refactor, research, ui, implement, in that
  order. Nothing matched means `general`, and agn says so rather than guessing.
- **Scope** is `large` when the prompt uses a word like *across*, *every*, *rewrite* or *migrate*,
  `small` under fifteen words, `medium` otherwise. Scope decides the token estimate behind the cost.
- **Risk** is the areas whose keywords matched in `.ag/preferences.yaml`. The defaults are auth, db,
  payments and infra. A `risk_rules` list in the file replaces them.

If the class is wrong, pass `--intent <intent>` to `agn recommend` or `agn run`. The task records
both what you asked for and what the rules read.

## How the pick is made

Profiles that are unavailable, tier 2, or excluded by `subscriptions_only` or `allow_local` are out
before anything is scored. What is left is ranked by

```
evidence − cost − time + continuity
```

- **Evidence** comes from the catalog. Each benchmark row is divided by the best score on that
  benchmark and task class, so what is averaged is how close to the best result a profile is, not
  the published number. Older rows count for less and rows past a year count for nothing.
- **Cost** is what this task would add to your bill, relative to the most expensive profile you
  could run it on. Subscription and local profiles cost nothing. Credits are priced like an API key,
  because that is what they are.
- **Time** is a placeholder until agn has measured enough tasks: local models are slowest, a gateway
  route is in between, an agent's own route is fastest.
- **Continuity** adds a little for a profile that already has a task running or waiting on this repo.

The weights come from `optimize` in `.ag/preferences.yaml`:

| `optimize` | quality | cost | time |
|---|---|---|---|
| `quality` | 1.0 | 0.1 | 0.1 |
| `balanced` (default) | 1.0 | 0.4 | 0.2 |
| `cost` | 1.0 | 1.0 | 0.2 |
| `speed` | 1.0 | 0.3 | 1.0 |

A risk rule's `min_evidence` filters first. If no profile clears it, the ranking stands and the risk
line says so, because refusing to answer helps nobody.

## Evidence labels

- **strong** - rows for this agent, this model and this kind of task.
- **some** - rows for this agent and model on other kinds of task.
- **model-level only** - rows that measured the model without naming an agent.
- **none** - nothing in the catalog. The pick is your `default_profile`, then the first profile
  included in a plan you already pay for, and the reason says "no evidence; using your default".

The label is never a percentage. `agn catalog show <profile>` prints the rows behind it.

## The catalog

The catalog aggregates published results, among them Terminal-Bench, SWE-bench Verified and Pro,
LiveBench, and harness comparison tables, into one schema with source, date, model version,
harness, task class, score, and cost. Rows age out. `agn catalog show <profile>` prints the rows
behind a recommendation, newest and most specific first, with a `*` on the ones the last
recommendation cited. The catalog is open data; contributions welcome.

agnostic ships with a snapshot and checks once a day whether a newer one has been published, which
is the only call it makes off your machine. The check reads a small manifest; it downloads the
catalog itself only when the manifest names a newer version, and accepts it only when its checksum,
schema and version all match what the manifest promised. `catalog_check: false` in
`~/.agnostic/config.yaml` turns the daily check off. `agn catalog update` runs the same check on
demand and works whether or not the daily one is on. See [the catalog reference](catalog.md).

## Worth trying

A profile you cannot run yet is named only when it is clearly ahead of the pick and there is one
concrete step that would enable it: install the agent, export a provider key, or move to a plan that
carries the model. Local models are never suggested this way, because there is nothing to enable.

## Your own results

Once a repo has thirty finished tasks of a class with outcomes recorded, its own numbers lead the
catalog for that class. Until then the catalog decides.

The recommender makes no network calls and no LLM calls.
