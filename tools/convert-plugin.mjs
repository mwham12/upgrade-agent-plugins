#!/usr/bin/env node
// Converts the GitHub Copilot CLI plugin under plugins/upgrade-agent into
// client bundles for Claude Code CLI and Codex CLI, under clients/.
//
// Run: node tools/convert-plugin.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPlugin = join(repoRoot, 'plugins', 'upgrade-agent');
const agentsDir = join(srcPlugin, 'agents');
const claudeOut = join(repoRoot, 'clients', 'claude-code');
const codexOut = join(repoRoot, 'clients', 'codex');

const pluginJson = JSON.parse(readFileSync(join(srcPlugin, 'plugin.json'), 'utf8'));

// The MCP server is declared inline in the Copilot orchestrator agent. Both
// Claude Code and Codex configure MCP servers at the client level instead, so
// it is declared once here and emitted into each client's config format.
const mcpServer = {
  command: 'dnx',
  args: ['Microsoft.GitHubCopilot.Upgrade.Mcp', '--yes', '--ignore-failed-sources'],
  env: {
    APPMOD_CALLER_TYPE: 'copilot-cli',
    APPMOD_DISABLE_MCP_APPS: 'true',
  },
};

// Copilot CLI tool name -> Claude Code tool names.
const TOOL_MAP = {
  read: ['Read', 'Glob'],
  search: ['Grep', 'Glob'],
  edit: ['Edit', 'Write'],
  execute: ['Bash'],
  agent: ['Task'],
  web: ['WebFetch', 'WebSearch'],
  ask_user: ['AskUserQuestion'],
  // Canvas is a Copilot-app surface with no Claude Code / Codex equivalent.
  open_canvas: [],
};

// Copilot model ids -> Claude Code model aliases. Anything unmapped is dropped
// so the agent inherits the session model.
const MODEL_MAP = {
  'claude-haiku-4.5': 'haiku',
};

function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) throw new Error('missing frontmatter');
  return { frontmatter: match[1], body: text.slice(match[0].length) };
}

// Minimal reader for the handful of scalar/list keys this plugin uses. The
// `mcp-servers` block is intentionally not parsed: it is replaced wholesale.
function readField(frontmatter, key) {
  const line = frontmatter.split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
  if (!line) return undefined;
  return line.slice(key.length + 1).trim();
}

function parseToolList(raw) {
  if (!raw) return undefined;
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function toClaudeTools(tools) {
  if (!tools || tools.includes('*')) return undefined; // inherit every tool
  const mapped = new Set();
  for (const tool of tools) {
    if (tool === 'Upgrade/*') {
      mapped.add('mcp__Upgrade');
    } else if (tool.startsWith('Upgrade/')) {
      mapped.add(`mcp__Upgrade__${tool.slice('Upgrade/'.length)}`);
    } else if (TOOL_MAP[tool]) {
      for (const m of TOOL_MAP[tool]) mapped.add(m);
    } else {
      throw new Error(`unmapped tool: ${tool}`);
    }
  }
  return [...mapped];
}

function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function yamlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const agents = readdirSync(agentsDir)
  .filter((f) => f.endsWith('.agent.md'))
  .sort()
  .map((file) => {
    const { frontmatter, body } = splitFrontmatter(readFileSync(join(agentsDir, file), 'utf8'));
    const name = readField(frontmatter, 'name');
    return {
      file,
      name,
      slug: kebab(name),
      description: readField(frontmatter, 'description'),
      model: readField(frontmatter, 'model'),
      userInvocable: readField(frontmatter, 'user-invocable') !== 'false',
      tools: parseToolList(readField(frontmatter, 'tools')),
      body,
    };
  });

// ---------------------------------------------------------------- Claude Code

rmSync(claudeOut, { recursive: true, force: true });

writeFile(
  join(claudeOut, '.claude-plugin', 'plugin.json'),
  `${JSON.stringify(
    {
      name: pluginJson.name,
      version: pluginJson.version,
      description: pluginJson.description,
      author: pluginJson.author,
      keywords: pluginJson.keywords,
      repository: pluginJson.repository,
      homepage: pluginJson.homepage,
      license: pluginJson.license,
    },
    null,
    2,
  )}\n`,
);

writeFile(
  join(claudeOut, '.mcp.json'),
  `${JSON.stringify({ mcpServers: { Upgrade: { type: 'stdio', ...mcpServer } } }, null, 2)}\n`,
);

// Claude Code hooks use a matchers array and a `command` field rather than
// Copilot's per-shell `bash`/`powershell` pair, and expose the plugin root as
// ${CLAUDE_PLUGIN_ROOT}.
writeFile(
  join(claudeOut, 'hooks', 'hooks.json'),
  `${JSON.stringify(
    {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Read|Glob|Grep',
            hooks: [
              {
                type: 'command',
                command:
                  'bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/track-telemetry.sh" 2>/dev/null || true',
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  )}\n`,
);

for (const script of ['track-telemetry.sh', 'track-telemetry.ps1']) {
  writeFile(
    join(claudeOut, 'hooks', 'scripts', script),
    readFileSync(join(srcPlugin, 'hooks', 'scripts', script), 'utf8'),
  );
}

for (const agent of agents) {
  const lines = [
    '---',
    `name: ${agent.slug}`,
    `description: ${yamlString(agent.description)}`,
  ];
  const claudeTools = toClaudeTools(agent.tools);
  if (claudeTools) lines.push(`tools: ${claudeTools.join(', ')}`);
  if (agent.model && MODEL_MAP[agent.model]) lines.push(`model: ${MODEL_MAP[agent.model]}`);
  lines.push('---', '');
  writeFile(join(claudeOut, 'agents', `${agent.slug}.md`), `${lines.join('\n')}${agent.body}`);
}

// Claude Code dispatches subagents by slug via the Task tool, so the
// orchestrator's references to Copilot agent names need a translation table.
writeFile(
  join(claudeOut, 'commands', 'upgrade.md'),
  `---
description: Start or resume an application upgrade with the Upgrade agent.
---

Act as the \`upgrade\` subagent (see \`agents/upgrade.md\` in this plugin).

Dispatch workers with the Task tool using these subagent types:

${agents
  .filter((a) => !a.userInvocable)
  .map((a) => `- \`${a.name}\` -> \`${a.slug}\``)
  .join('\n')}

User request: $ARGUMENTS
`,
);

const marketplace = {
  name: 'upgrade-agent-plugins',
  owner: pluginJson.author,
  plugins: [
    {
      name: pluginJson.name,
      source: './clients/claude-code',
      description: pluginJson.description,
      version: pluginJson.version,
    },
  ],
};
writeFile(
  join(repoRoot, '.claude-plugin', 'marketplace.json'),
  `${JSON.stringify(marketplace, null, 2)}\n`,
);

// --------------------------------------------------------------------- Codex

rmSync(codexOut, { recursive: true, force: true });

// Codex CLI has no subagent system, so the multi-agent workflow collapses into
// a single prompt: the orchestrator body plus the worker bodies inlined as
// role playbooks it runs itself.
const orchestrator = agents.find((a) => a.name === 'Upgrade');
const workers = agents.filter((a) => a !== orchestrator);

const codexPrompt = `# Upgrade Agent (Codex CLI)

Codex CLI runs a single agent. Where the instructions below tell you to
*dispatch* a worker agent, perform that worker's role yourself by following its
playbook in the "Worker playbooks" section, then continue as the orchestrator.
Keep worker output summarized the way the playbook describes so the main thread
stays small.

The \`Upgrade\` MCP server tools are exposed by Codex as \`Upgrade__<tool>\`
(for example \`Upgrade__get_state\`). Use \`shell\` for terminal commands and the
built-in file tools for reads and edits.

${orchestrator.body.trim()}

---

# Worker playbooks

${workers
  .map((w) => `<worker name="${w.name}">\n\n${w.body.trim()}\n\n</worker>`)
  .join('\n\n')}
`;

writeFile(join(codexOut, 'prompts', 'upgrade.md'), codexPrompt);

const tomlEnv = Object.entries(mcpServer.env)
  .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
  .join(', ');
writeFile(
  join(codexOut, 'config.toml'),
  `# Append to ~/.codex/config.toml to register the Upgrade MCP server.
[mcp_servers.Upgrade]
command = ${JSON.stringify(mcpServer.command)}
args = ${JSON.stringify(mcpServer.args)}
env = { ${tomlEnv} }
# Cold NuGet caches make the first \`dnx\` start slow; allow it to finish.
startup_timeout_sec = 300
tool_timeout_sec = 300
`,
);

console.log(
  `Generated ${agents.length} Claude Code agents in clients/claude-code and a Codex bundle in clients/codex.`,
);
