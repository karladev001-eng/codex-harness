const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lib = require('../dist/skill/lib.js');
const { fixture, write, run, cli } = require('./helpers.cjs');
// The fake CLIs are POSIX shebang scripts, which Windows cannot execute from PATH.
const posix = { skip: process.platform === 'win32' };
const community = 'anthropics/claude-plugins-community';
const login = 'gh auth login --hostname github.com';

// `plugin list` / `plugin marketplace list` print the files in state/, and every call is logged.
function fakeClaude(f, { failInstall } = {}) {
  const bin = path.join(f.base, 'bin'), log = path.join(f.base, 'claude.log'), state = path.join(f.base, 'state');
  fs.mkdirSync(state, { recursive: true });
  const show = name => `if [ -f "${path.join(state, name)}" ]; then while IFS= read -r line; do echo "$line"; done < "${path.join(state, name)}"; fi`;
  write(path.join(bin, 'claude'), `#!/bin/sh
echo "$CLAUDE_CONFIG_DIR|$*" >> "${log}"
case "$*" in
  "plugin list") ${show('plugins')};;
  "plugin marketplace list") ${show('marketplaces')};;
  "plugin install html-plan@claude-community"*) ${failInstall ? 'exit 3' : ':'};;
esac
exit 0
`);
  fs.chmodSync(path.join(bin, 'claude'), 0o755);
  return {
    state: (name, text) => write(path.join(state, name), text),
    calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(line => line.split('|')[1]) : [],
  };
}
function fakeGh(f, { loggedIn = true } = {}) {
  const bin = path.join(f.base, 'bin'), log = path.join(f.base, 'gh.log');
  write(path.join(bin, 'gh'), `#!/bin/sh\necho "$*" >> "${log}"\nexit ${loggedIn ? 0 : 1}\n`);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  return { calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
}
// PATH holds only the fake CLIs (or nothing), so a real claude or gh on the machine is never reached.
function setup(f, ...args) {
  fs.mkdirSync(path.join(f.base, 'bin'), { recursive: true });
  return run(['setup', '--home', f.home, ...args], { env: { ...process.env, PATH: path.join(f.base, 'bin') } });
}
const step = (result, name) => result.data.steps.find(item => item.name === name);
const shared = f => path.join(f.home, '.agents/harness/settings.json');
const readSettings = f => JSON.parse(fs.readFileSync(shared(f), 'utf8'));

test('setup installs Codex and Claude Code into a temporary home and a rerun reports unchanged', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  const first = setup(f);
  assert.equal(first.code, 0, first.error); assert.equal(first.data.ok, true);
  assert.deepEqual(first.data.steps.map(item => item.name), ['codex', 'claude', 'html-plan', 'doctor']);
  assert.equal(step(first, 'codex').status, 'installed'); assert.equal(step(first, 'claude').status, 'installed');
  assert.ok(fs.existsSync(path.join(f.home, '.agents/skills/codex-harness/runtime.js')));
  assert.ok(fs.existsSync(path.join(f.home, '.agents/claude-marketplaces/codex-harness/.claude-plugin/marketplace.json')));
  assert.equal(step(first, 'doctor').ok, true);
  // Nothing was asked for the knowledge repository, so the personal settings are not created.
  assert.equal(fs.existsSync(shared(f)), false);
  claude.state('plugins', 'harness@codex-harness\nhtml-plan@claude-community\n');
  const again = setup(f);
  assert.equal(again.code, 0, again.error);
  assert.deepEqual(['codex', 'claude', 'html-plan'].map(name => step(again, name).status), ['unchanged', 'unchanged', 'unchanged']);
});

test('setup registers html-plan only when it is missing and skips the marketplace when already added', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  const installed = setup(f, '--host', 'claude');
  assert.equal(installed.code, 0, installed.error); assert.equal(step(installed, 'html-plan').status, 'installed');
  assert.deepEqual(claude.calls().slice(-4), ['plugin list', 'plugin marketplace list', `plugin marketplace add ${community}`, 'plugin install html-plan@claude-community --scope user']);

  const second = fixture(t), known = fakeClaude(second);
  known.state('marketplaces', 'codex-harness\nclaude-community\n');
  assert.equal(setup(second, '--host', 'claude').code, 0);
  assert.deepEqual(known.calls().slice(-3), ['plugin list', 'plugin marketplace list', 'plugin install html-plan@claude-community --scope user']);

  // A similarly named plugin or marketplace is not a match.
  const near = fixture(t), lookalike = fakeClaude(near);
  lookalike.state('plugins', 'my-html-plan@claude-community\nhtml-plan@other\n');
  lookalike.state('marketplaces', 'claude-plugins-community\n');
  assert.equal(setup(near, '--host', 'claude').code, 0);
  assert.deepEqual(lookalike.calls().slice(-2), [`plugin marketplace add ${community}`, 'plugin install html-plan@claude-community --scope user']);

  // The entry is found even when earlier output is longer than the default output limit.
  const present = fixture(t), listed = fakeClaude(present);
  listed.state('plugins', 'first\n' + 'x'.repeat(5000) + '\n  html-plan@claude-community  Version: 1\n' + 'y'.repeat(5000) + '\n');
  const result = setup(present, '--host', 'claude');
  assert.equal(step(result, 'html-plan').status, 'unchanged');
  assert.equal(listed.calls().some(call => call.startsWith('plugin install html-plan')), false);
});

test('setup --html-plan false never calls the html-plan commands', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  const result = setup(f, '--host', 'claude', '--html-plan', 'false');
  assert.equal(result.code, 0, result.error);
  assert.deepEqual(step(result, 'html-plan'), { name: 'html-plan', ok: true, status: 'skipped', reason: '--html-plan false' });
  assert.equal(claude.calls().some(call => /html-plan|plugin list|marketplace list/.test(call)), false);
});

test('a failed html-plan install is reported with the commands to run by hand', posix, t => {
  const f = fixture(t); fakeClaude(f, { failInstall: true });
  const result = setup(f, '--host', 'claude');
  assert.equal(result.code, 2); assert.equal(result.data.ok, false);
  assert.equal(step(result, 'claude').ok, true); assert.equal(step(result, 'html-plan').status, 'failed');
  assert.deepEqual(result.data.run_manually, [`claude plugin marketplace add ${community}`, 'claude plugin install html-plan@claude-community --scope user']);
});

test('one failed step does not stop the independent steps', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  // An AGENTS.override.md makes the Codex install refuse.
  write(path.join(f.home, '.codex/AGENTS.override.md'), 'override');
  const result = setup(f);
  assert.equal(result.code, 2); assert.equal(step(result, 'codex').ok, false); assert.match(step(result, 'codex').error, /AGENTS\.override\.md/);
  assert.equal(step(result, 'claude').status, 'installed'); assert.equal(step(result, 'html-plan').status, 'installed');
  assert.ok(claude.calls().length > 0);
});

test('setup --knowledge-repo adds preferences, keeps other keys and reruns as unchanged', posix, t => {
  const f = fixture(t), gh = fakeGh(f);
  write(shared(f), '{\n  "max_agents": 2,\n  "preferences": { "project_key": "my-key" },\n  "hosts": { "claude": { "models": { "standard": { "model": "opus" } } } }\n}\n');
  const args = ['--host', 'codex', '--knowledge-repo', 'karladev001-eng/harness-knowledge-base'];
  const first = setup(f, ...args);
  assert.equal(first.code, 0, first.error); assert.equal(step(first, 'knowledge').status, 'updated');
  const saved = readSettings(f);
  assert.deepEqual(saved.preferences, { project_key: 'my-key', repository: 'karladev001-eng/harness-knowledge-base', branch: 'main', autosave: true });
  assert.equal(saved.max_agents, 2); assert.equal(saved.hosts.claude.models.standard.model, 'opus');
  assert.equal(fs.readFileSync(shared(f), 'utf8'), JSON.stringify(saved, null, 2) + '\n');
  // The saved file stays valid for the harness itself and nothing is left beside it.
  assert.equal(lib.settings(f.project, f.home).preferences.autosave, true);
  assert.deepEqual(fs.readdirSync(path.dirname(shared(f))), ['settings.json']);
  assert.deepEqual(gh.calls(), ['auth status --hostname github.com']);

  const bytes = fs.readFileSync(shared(f)), modified = fs.statSync(shared(f)).mtimeMs;
  const again = setup(f, ...args);
  assert.equal(step(again, 'knowledge').status, 'unchanged'); assert.equal(step(again, 'gh').status, 'authenticated');
  assert.deepEqual(fs.readFileSync(shared(f)), bytes); assert.equal(fs.statSync(shared(f)).mtimeMs, modified);
});

test('setup creates personal settings, honours --knowledge-branch and writes no token', posix, t => {
  const f = fixture(t); fakeGh(f);
  const result = setup(f, '--host', 'codex', '--knowledge-repo', 'owner/repo', '--knowledge-branch', 'dev');
  assert.equal(result.code, 0, result.error); assert.equal(step(result, 'knowledge').status, 'configured');
  assert.deepEqual(readSettings(f), { preferences: { repository: 'owner/repo', branch: 'dev', autosave: true } });
  assert.doesNotMatch(fs.readFileSync(shared(f), 'utf8'), /token|ghp_/i);
});

test('setup writes into the migrated shared store when only a legacy Codex store exists', posix, t => {
  const f = fixture(t); fakeGh(f);
  const legacy = path.join(f.home, '.codex/harness/settings.json');
  write(legacy, { max_agents: 3 });
  const result = setup(f, '--host', 'codex', '--knowledge-repo', 'owner/repo');
  assert.equal(result.code, 0, result.error);
  assert.deepEqual(readSettings(f), { max_agents: 3, preferences: { repository: 'owner/repo', branch: 'main', autosave: true } });
  assert.deepEqual(JSON.parse(fs.readFileSync(legacy, 'utf8')), { max_agents: 3 });
});

test('a different repository or branch already configured is reported and left untouched', posix, t => {
  const f = fixture(t); fakeGh(f);
  const original = '{"preferences":{"repository":"other/repo","branch":"main","autosave":true}}';
  write(shared(f), original);
  for (const args of [['--knowledge-repo', 'owner/repo'], ['--knowledge-repo', 'other/repo', '--knowledge-branch', 'dev']]) {
    const result = setup(f, '--host', 'codex', ...args);
    assert.equal(result.code, 2); assert.equal(step(result, 'knowledge').status, 'conflict');
    assert.match(step(result, 'knowledge').error, /different knowledge repository or branch/);
    assert.equal(fs.readFileSync(shared(f), 'utf8'), original);
    // The other steps still run.
    assert.equal(step(result, 'codex').ok, true); assert.equal(step(result, 'gh').ok, true);
  }
});

test('invalid or unreadable personal settings fail the knowledge step without writing', posix, t => {
  const f = fixture(t); fakeGh(f);
  for (const bad of ['{not json', '[]', '{"preferences": 3}', '{"nonsense": true}']) {
    write(shared(f), bad);
    const result = setup(f, '--host', 'codex', '--knowledge-repo', 'owner/repo');
    assert.equal(result.code, 2, bad); assert.equal(step(result, 'knowledge').status, 'failed', bad);
    assert.equal(fs.readFileSync(shared(f), 'utf8'), bad);
  }
  fs.rmSync(shared(f)); fs.symlinkSync(path.join(f.base, 'elsewhere.json'), shared(f));
  const linked = setup(f, '--host', 'codex', '--knowledge-repo', 'owner/repo');
  assert.match(step(linked, 'knowledge').error, /symlink/); assert.equal(fs.existsSync(path.join(f.base, 'elsewhere.json')), false);
});

test('without --knowledge-repo existing personal settings are not touched and gh is not called', posix, t => {
  const f = fixture(t), gh = fakeGh(f);
  write(shared(f), '{"max_agents":2}');
  const result = setup(f, '--host', 'codex');
  assert.equal(result.code, 0, result.error);
  assert.deepEqual(result.data.steps.map(item => item.name), ['codex', 'doctor']);
  assert.equal(fs.readFileSync(shared(f), 'utf8'), '{"max_agents":2}'); assert.deepEqual(gh.calls(), []);
});

test('a missing gh login fails with the manual command and never attempts a login', posix, t => {
  const f = fixture(t), gh = fakeGh(f, { loggedIn: false });
  const result = setup(f, '--host', 'codex', '--knowledge-repo', 'owner/repo');
  assert.equal(result.code, 2); assert.equal(result.data.ok, false);
  assert.equal(step(result, 'gh').status, 'not_authenticated'); assert.ok(step(result, 'gh').run_manually.includes(login));
  assert.ok(result.data.run_manually.includes(login));
  assert.deepEqual(gh.calls(), ['auth status --hostname github.com']);
  // The knowledge settings are independent of the login and are still written.
  assert.equal(step(result, 'knowledge').ok, true); assert.equal(readSettings(f).preferences.repository, 'owner/repo');
  // A machine without gh fails the same way.
  const bare = fixture(t);
  const missing = setup(bare, '--host', 'codex', '--knowledge-repo', 'owner/repo');
  assert.equal(missing.code, 2); assert.match(step(missing, 'gh').reason, /unavailable/); assert.ok(missing.data.run_manually.includes(login));
});

test('without the claude CLI, --host all skips the Claude steps and --host claude fails', t => {
  const f = fixture(t);
  const all = setup(f);
  assert.equal(all.code, 0, all.error); assert.equal(all.data.ok, true);
  assert.equal(step(all, 'codex').status, 'installed');
  for (const name of ['claude', 'html-plan']) { assert.equal(step(all, name).status, 'skipped'); assert.match(step(all, name).reason, /claude CLI not found/); }
  assert.equal(fs.existsSync(path.join(f.home, '.agents/claude-marketplaces')), false);

  const only = fixture(t);
  const failed = setup(only, '--host', 'claude');
  assert.equal(failed.code, 2); assert.equal(failed.data.ok, false);
  assert.equal(step(failed, 'claude').status, 'failed'); assert.ok(failed.data.run_manually.includes('codex-harness setup --host claude'));
  // No half-installed marketplace is left behind to hide the registration on the next run.
  assert.equal(fs.existsSync(path.join(only.home, '.agents')), false);
});

test('invalid arguments change nothing and exit with code 1', t => {
  const f = fixture(t);
  for (const args of [['--knowledge-repo', 'not-a-repo'], ['--knowledge-repo', 'a/b/c'], ['--knowledge-repo', 'bad owner/repo'], ['--knowledge-repo', '/repo'],
    ['--knowledge-repo', 'owner/repo', '--knowledge-branch', 'has space'], ['--host', 'mars'], ['--html-plan', 'maybe']]) {
    const result = setup(f, ...args);
    assert.equal(result.code, 1, args.join(' ')); assert.match(result.error, /^harness: /);
    assert.equal(fs.existsSync(f.home), false, args.join(' '));
  }
  assert.equal(setup(f, '--unknown', 'x').code, 1);
});

test('--help lists the setup command and its options', t => {
  const result = spawnSync(process.execPath, [cli, 'setup', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^ {2}setup \[--home PATH\] \[--host codex\|claude\|all\] \[--knowledge-repo OWNER\/REPO\] \[--knowledge-branch BRANCH\]/m);
  assert.match(result.stdout, /\[--html-plan true\|false\]/);
});
