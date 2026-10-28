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
  for (const file of ['runtime.js', 'claude.js', 'SKILL.md', 'references/hosts/claude-code.md', 'references/hosts/codex.md', 'knowledge/cli.cjs', 'consult-codex/scripts/consult.mjs', 'codex-image/SKILL.md', 'codex-image/scripts/image.mjs']) assert.ok(fs.existsSync(path.join(plugin, 'skills/harness', file)), file);
  for (const file of ['SKILL.md', 'scripts/image.mjs']) assert.ok(fs.existsSync(path.join(plugin, 'skills/codex-image', file)), 'codex-image/' + file);
  // Consulting Claude from Claude adds no independence, so the Codex-side skill is not shipped here.
  assert.equal(fs.existsSync(path.join(plugin, 'skills/harness/consult-claude')), false);
  assert.deepEqual(fs.readdirSync(path.join(plugin, 'skills')).sort(), ['codex-html-plan', 'codex-image', 'consult-codex', 'create-harness', 'create-rulebooks', 'create-subagent', 'harness', 'inspect-harness']);
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

test('Claude-side install and session hook never migrate a legacy Codex store', t => {
  const f = fixture(t), claude = fakeClaude(f), legacy = path.join(f.home, '.codex/harness');
  write(path.join(legacy, 'settings.json'), { max_agents: 7 });
  assert.equal(run(['install', '--host', 'claude', '--home', f.home], { env: claude.env }).code, 0);
  assert.match(hook(f).additionalContext, /max_agents=7/);
  assert.equal(fs.existsSync(path.join(f.home, '.agents/harness')), false);
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

test('agent guard denies harness worker launches without model and effort, or via fork, only while active', t => {
  const f = fixture(t);
  const guard = input => {
    const result = spawnSync(process.execPath, [path.join(plugin, 'hooks/agent-guard.cjs')], { encoding: 'utf8', input: JSON.stringify({ tool_name: 'Agent', cwd: f.project, tool_input: input }),
      env: { ...process.env, HOME: f.home, USERPROFILE: f.home, HARNESS_HOME: '', CODEX_HOME: '', CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PROJECT_DIR: f.project } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : null;
  };
  const missing = guard({ subagent_type: 'harness:implementer', model: 'sonnet', prompt: 'HARNESS_WORKER' });
  assert.equal(missing.permissionDecision, 'deny'); assert.match(missing.permissionDecisionReason, /missing effort[\s\S]*standard=sonnet\/medium/);
  assert.equal(guard({ subagent_type: 'harness:implementer', model: 'sonnet', effort: 'medium', prompt: 'HARNESS_WORKER' }), null);
  assert.match(guard({ subagent_type: 'fork', prompt: 'HARNESS_WORKER\n役割: 実装' }).permissionDecisionReason, /instead of fork/);
  assert.match(guard({ prompt: 'HARNESS_WORKER\n役割: 実装', model: 'sonnet', effort: 'medium' }).permissionDecisionReason, /omitted type/);
  // A prompt that starts with the marker must go to a harness:* agent, whatever the other type is.
  for (const subagent_type of ['general-purpose', '   ', 'Explore', ' fork ']) {
    const denied = guard({ subagent_type, prompt: '\n  HARNESS_WORKER\n役割: 実装', model: 'sonnet', effort: 'medium' });
    assert.equal(denied?.permissionDecision, 'deny', JSON.stringify(subagent_type)); assert.match(denied.permissionDecisionReason, /another agent type/);
  }
  // Fork and an omitted type refuse the marker anywhere in the prompt, as before.
  assert.match(guard({ prompt: '役割: reviewer\nHARNESS_WORKER として動きます', model: 'sonnet', effort: 'medium' })?.permissionDecisionReason ?? '', /omitted type/);
  assert.match(guard({ subagent_type: 'fork', prompt: '# HARNESS_WORKER\nrole' })?.permissionDecisionReason ?? '', /instead of fork/);
  assert.equal(guard({ subagent_type: ' fork ', prompt: 'role\nHARNESS_WORKER' })?.permissionDecision, 'deny');
  // Other types refuse only a prompt that starts with the marker.
  assert.equal(guard({ subagent_type: 'general-purpose', prompt: '役割: reviewer\nHARNESS_WORKER として動きます' }), null);
  assert.equal(guard({ subagent_type: ' harness:implementer ', model: 'sonnet', effort: 'medium', prompt: 'HARNESS_WORKER' }), null);
  assert.equal(guard({ prompt: 'look up the build script' }), null);
  // Unrelated launches and an inactive harness are never touched.
  assert.equal(guard({ subagent_type: 'Explore', prompt: 'find files' }), null);
  assert.equal(guard({ subagent_type: 'Explore', prompt: 'grep for HARNESS_WORKER usages' }), null);
  assert.equal(guard({ subagent_type: 'fork', prompt: 'summarize this thread' }), null);
  assert.equal(guard({ subagent_type: 'general-purpose', prompt: 'explain what HARNESS_WORKER means' }), null);
  write(path.join(f.project, '.harness.json'), { enabled: false });
  assert.equal(guard({ subagent_type: 'harness:reviewer', prompt: 'HARNESS_WORKER' }), null);
  // An unreadable configuration is reported by the session hook, not enforced here.
  write(path.join(f.project, '.harness.json'), { unknown: true });
  assert.equal(guard({ subagent_type: 'harness:reviewer', prompt: 'HARNESS_WORKER' }), null);
});
