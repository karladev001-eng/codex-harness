const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lib = require('../dist/skill/lib.js');
const { fixture, write, command, run, root, tree } = require('./helpers.cjs');
const marketplace = path.join(root, 'dist/claude-marketplace'), plugin = path.join(marketplace, 'plugins/harness');
const version = lib.readJson(path.join(root, 'package.json')).version;

function fakeClaude(f, { fail } = {}) {
  const bin = path.join(f.base, 'bin'), log = path.join(f.base, 'claude.log');
  write(path.join(bin, 'claude'), `#!/bin/sh\necho "$CLAUDE_CONFIG_DIR|$*" >> "${log}"\n${fail ? `case "$*" in *install*) exit 3;; esac\n` : ''}exit 0\n`);
  fs.chmodSync(path.join(bin, 'claude'), 0o755);
  return { env: { ...process.env, PATH: bin }, calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
}
function hook(f, env = {}) {
  const result = spawnSync(process.execPath, [path.join(plugin, 'hooks/session-start.cjs')], { encoding: 'utf8', input: JSON.stringify({ cwd: f.project }),
    env: { ...process.env, HOME: f.home, USERPROFILE: f.home, HARNESS_HOME: '', CODEX_HOME: '', CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PROJECT_DIR: f.project, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : null;
}

test('the built marketplace carries a self-contained harness skill, agents and the session hook', () => {
  const market = lib.readJson(path.join(marketplace, '.claude-plugin/marketplace.json'));
  assert.equal(market.name, 'codex-harness'); assert.deepEqual(market.plugins.map(p => [p.name, p.source, p.version]), [['harness', './plugins/harness', version]]);
  assert.equal(lib.readJson(path.join(plugin, '.claude-plugin/plugin.json')).version, version);
  assert.deepEqual(fs.readdirSync(path.join(plugin, 'agents')).sort(), ['implementer.md', 'integrator.md', 'researcher.md', 'reviewer.md']);
  for (const agent of fs.readdirSync(path.join(plugin, 'agents'))) assert.match(fs.readFileSync(path.join(plugin, 'agents', agent), 'utf8'), /^---\nname: [a-z]+\ndescription: .+\nmodel: inherit\n/);
  assert.equal(lib.readJson(path.join(plugin, 'hooks/hooks.json')).hooks.SessionStart[0].hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.cjs"');
  for (const file of ['runtime.js', 'claude.js', 'SKILL.md', 'references/hosts/claude-code.md', 'knowledge/cli.cjs']) assert.ok(fs.existsSync(path.join(plugin, 'skills/harness', file)), file);
  // Consulting Claude from Claude adds no independence, so the Codex-side skill is not shipped here.
  assert.equal(fs.existsSync(path.join(plugin, 'skills/harness/consult-claude')), false);
  assert.deepEqual(fs.readdirSync(path.join(plugin, 'skills')).sort(), ['codex-html-plan', 'create-harness', 'create-rulebooks', 'create-subagent', 'harness', 'inspect-harness']);
  // A file named claude.md would be auto-loaded as CLAUDE.md on case-insensitive file systems.
  assert.equal(Object.keys(tree(path.join(plugin, 'skills/harness/references/hosts'))).some(file => /^claude\.md$/i.test(path.basename(file))), false);
});

test('session hook reports Claude models when active and stays silent when inactive', t => {
  const f = fixture(t);
  const active = hook(f);
  assert.equal(active.hookEventName, 'SessionStart');
  assert.match(active.additionalContext, /Harness is active/); assert.match(active.additionalContext, /standard=sonnet\/medium/);
  assert.ok(active.additionalContext.includes(path.join(plugin, 'skills/harness/references/hosts/claude-code.md')));
  write(path.join(f.project, '.harness.json'), { enabled: false });
  assert.equal(hook(f), null);
  write(path.join(f.project, '.harness.json'), { unknown: true });
  assert.match(hook(f).additionalContext, /Harness status failed .*Unknown configuration key/);
});

test('status --host claude resolves the Claude model table and its own pins', t => {
  const f = fixture(t);
  assert.equal(command(f, 'status').data.config.models.standard.model, 'gpt-6.1-sol');
  const claude = command(f, 'status', '--host', 'claude').data;
  assert.equal(claude.config.host, 'claude'); assert.equal(claude.config.models.review.model, 'opus'); assert.equal(claude.config.hosts, undefined);
  write(path.join(f.project, '.harness.json'), { hosts: { claude: { models: { standard: { model: 'opus' } } } } });
  const pinned = command(f, 'status', '--host', 'claude').data;
  assert.equal(pinned.config.models.standard.model, 'opus'); assert.deepEqual(pinned.model_selection.pinned_roles, ['standard']);
  assert.deepEqual(command(f, 'status').data.model_selection.pinned_roles, []);
  assert.equal(command(f, 'status', '--host', 'cursor').code, 2);
});

test('install --host claude copies the marketplace, registers it, detects edits and uninstalls', t => {
  const f = fixture(t), claude = fakeClaude(f), target = path.join(f.home, '.agents/claude-marketplaces/codex-harness');
  const installed = run(['install', '--host', 'claude', '--home', f.home], { env: claude.env });
  assert.equal(installed.code, 0, installed.error); assert.equal(installed.data.status, 'installed'); assert.equal(installed.data.target, lib.canonical(target));
  assert.deepEqual(tree(target), tree(marketplace));
  const config = lib.canonical(path.join(f.home, '.claude'));
  assert.deepEqual(claude.calls(), [`${config}|--version`, `${config}|plugin marketplace add ${lib.canonical(target)} --scope user`, `${config}|plugin install harness@codex-harness --scope user`]);
  assert.equal(run(['install', '--host', 'claude', '--home', f.home], { env: claude.env }).data.status, 'unchanged');
  // No Codex entry point is touched by a Claude install.
  assert.equal(fs.existsSync(path.join(f.home, '.codex/AGENTS.md')), false);

  write(path.join(target, 'plugins/harness/agents/implementer.md'), 'edited');
  const refused = run(['install', '--host', 'claude', '--home', f.home], { env: claude.env });
  assert.equal(refused.code, 1); assert.match(refused.error, /user changes/);
  fs.copyFileSync(path.join(marketplace, 'plugins/harness/agents/implementer.md'), path.join(target, 'plugins/harness/agents/implementer.md'));

  const removed = run(['uninstall', '--host', 'claude', '--home', f.home], { env: claude.env });
  assert.equal(removed.data.status, 'uninstalled'); assert.equal(fs.existsSync(target), false);
  assert.deepEqual(claude.calls().slice(-2), [`${config}|plugin uninstall harness@codex-harness --scope user`, `${config}|plugin marketplace remove codex-harness`]);
  assert.equal(run(['uninstall', '--host', 'claude', '--home', f.home], { env: claude.env }).data.status, 'not_installed');
});

test('without a working claude CLI the files are kept and the manual commands are returned', t => {
  const f = fixture(t), empty = path.join(f.base, 'empty'); fs.mkdirSync(empty);
  const result = run(['install', '--host', 'claude', '--home', f.home], { env: { ...process.env, PATH: empty } });
  assert.equal(result.code, 2); assert.equal(result.data.ok, false); assert.equal(result.data.registration.reason, 'claude CLI unavailable');
  assert.match(result.data.registration.run_manually[0], /^claude plugin marketplace add .+ --scope user$/);
  assert.ok(fs.existsSync(path.join(f.home, '.agents/claude-marketplaces/codex-harness/.claude-plugin/marketplace.json')));
  const failing = fakeClaude(f, { fail: true });
  const update = run(['install', '--host', 'claude', '--home', f.home], { env: failing.env });
  assert.equal(update.data.status, 'unchanged');
  assert.equal(run(['install', '--host', 'mars', '--home', f.home]).code, 1);
});
