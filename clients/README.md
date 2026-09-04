# Other CLI clients

The plugin under [`plugins/upgrade-agent`](../plugins/upgrade-agent) is authored
for GitHub Copilot CLI. This directory holds generated bundles that make the same
upgrade agent usable from **Claude Code CLI** and **Codex CLI**.

Regenerate after changing anything under `plugins/upgrade-agent`:

```
node tools/convert-plugin.mjs
```

Do not hand-edit files in this directory — they are overwritten by the generator.

## Claude Code CLI

`clients/claude-code` is a Claude Code plugin. The Copilot orchestrator and its 16
worker agents become Claude Code subagents (dispatched with the `Task` tool), the
inline `mcp-servers` block becomes `.mcp.json`, and the Copilot `hooks.json`
becomes a Claude Code `hooks/hooks.json`.

Install it from this repository's marketplace:

```
/plugin marketplace add mwham12/upgrade-agent-plugins
/plugin install upgrade-agent@upgrade-agent-plugins
```

Then run `/upgrade upgrade my solution to .NET 10`, or prompt normally and let
Claude delegate to the `upgrade` subagent.

Requires the `dnx` command (.NET 10 SDK or later) on `PATH` for the `Upgrade` MCP
server.

## Codex CLI

Codex CLI has no subagent system, so the orchestrator and workers are flattened
into one prompt where the single agent plays each worker role itself.

1. Append `clients/codex/config.toml` to `~/.codex/config.toml` to register the
   `Upgrade` MCP server.
2. Copy `clients/codex/prompts/upgrade.md` to `~/.codex/prompts/upgrade.md`.
3. Run `/upgrade` in Codex, then describe the upgrade you want.

MCP tools are exposed to Codex as `Upgrade__<tool>` (for example
`Upgrade__get_state`).
