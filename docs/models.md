# Models and providers

agnostic never routes tokens itself. To use a different model inside an agent, you configure that agent the way its own docs describe; agnostic detects the configuration and offers it as a profile.

## Subscriptions (default)

If `claude` or `codex` is logged in, their subscription-backed models are profiles automatically. These are preferred by the recommender when quality is comparable, because their marginal cost to you is zero.

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

Codex reads `model_providers` from `~/.codex/config.toml`. Any OpenAI-compatible `base_url` works, including local servers. agnostic reads that file to build profiles.

## Local models

Run LM Studio (https://lmstudio.ai) or Ollama (https://ollama.com) with their OpenAI-compatible server enabled. `agn doctor` detects the local port and adds `local` profiles for agents that accept a custom base URL (Codex, Pi, OpenCode). Local profiles cost nothing but score low on capability evidence; the recommender will suggest them for docs, tests, and small edits, not for risky work.

## Choosing what the recommender may use

In `.ag/preferences.yaml`:

```yaml
optimize: balanced          # quality | balanced | cost | speed
subscriptions_only: false   # true = never pick an API-key or gateway profile
allow_local: true
```
