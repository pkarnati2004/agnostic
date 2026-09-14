# Models and providers

agnostic never routes tokens itself. To use a different model inside an agent, you configure that agent the way its own docs describe; agnostic detects the configuration and offers it as a profile.

## Subscriptions (default)

If `claude` or `codex` is logged in, their subscription-backed models are profiles automatically. These are preferred by the recommender when quality is comparable, because their marginal cost to you is zero.

## Plans

A subscription lists more models than it includes. Claude Code lists Fable on every paid plan, and only Max includes it; on Pro it runs on usage credits. So agnostic records which plan you are on and reads what that plan covers from its catalog:

- `subscription` - the model runs on your plan at no extra cost.
- `credits` - the model runs on your login, metered, and costs money on top of the plan. The recommender prices a credits profile the way it prices an API key.
- A model your plan cannot run at all is not offered as a profile.

agnostic detects the plan from the agent's own files where it can: Codex from the plan in `~/.codex/auth.json`, Claude Code from the account block in `~/.claude.json`. Both are read locally; nothing is sent anywhere. Agents billed per provider key (Pi, OpenCode) have no plan.

When it cannot tell, it asks rather than guessing. `agn doctor` shows a numbered list of the plans it knows for that vendor when you run it in a terminal, and prints the flag to use when its output is going somewhere else:

```
agn doctor --plan claude=max20
agn doctor --plan chatgpt=plus
```

The answer is written to `~/.agnostic/config.yaml`:

```yaml
plans:
  claude: max20
  chatgpt: plus
```

A detected plan wins over this file; the `plan` column in `agn doctor` says `(config)` when the file is what it is going on. The plan names come from the catalog, not from agnostic's code, so a new tier works as soon as the catalog knows it. Until then agnostic shows the name it read as `not in catalog` and leaves billing `unknown` rather than assuming what it covers.

Tokens are counted per plan and per task from the agents' own transcripts; see
[usage and cost](usage.md).

## API keys and gateways

Set the key in your shell environment; `agn doctor` will pick it up and add profiles for agents that can use it.

| Provider | Env var | Docs | Notes |
|---|---|---|---|
| OpenRouter | `OPENROUTER_API_KEY` | https://openrouter.ai/docs | One key, many models; usable by Pi, OpenCode, and Claude Code via its gateway setting |
| Moonshot (Kimi) | `MOONSHOT_API_KEY` | https://platform.moonshot.ai/docs | Anthropic-compatible endpoint works with Claude Code's `ANTHROPIC_BASE_URL` |
| Anthropic API | `ANTHROPIC_API_KEY` | https://docs.claude.com | Metered; separate from your Claude plan |
| OpenAI API | `OPENAI_API_KEY` | https://platform.openai.com/docs | Metered; separate from your ChatGPT plan |

### Kimi (or another model) inside Claude Code

Claude Code supports pointing at an Anthropic-compatible endpoint through environment variables (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`). agnostic creates a profile such as `claude-code:kimi-k2.6:anthropic-gateway` when it sees the key, and passes the variables to the child process at launch. This is billed to your provider key, not your Claude plan. Check Anthropic's terms for gateway use before relying on it.

### Custom providers in Codex

Codex reads `model_providers` from `~/.codex/config.toml`. Any OpenAI-compatible `base_url` works, including local servers. agnostic does not read that file yet; a later release will turn the providers in it into profiles.

## Local models

Run LM Studio (https://lmstudio.ai) or Ollama (https://ollama.com) with their OpenAI-compatible server enabled. `agn doctor` detects the local port and adds `local` profiles for Codex, which takes a base URL on the command line. Pi and OpenCode need their own configuration files for a local provider, so agnostic does not enumerate local profiles for them yet. Local profiles cost nothing but score low on capability evidence; the recommender will suggest them for docs, tests, and small edits, not for risky work.

## Choosing what the recommender may use

In `.ag/preferences.yaml`:

```yaml
optimize: balanced          # quality | balanced | cost | speed
subscriptions_only: false   # true = never pick an API-key or gateway profile
allow_local: true
```
