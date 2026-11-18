const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lib = require('../dist/skill/lib.js');
const { writeSettings } = require('../dist/skill/setup.js');
const { fixture, write, run, cli, root } = require('./helpers.cjs');
const version = lib.readJson(path.join(root, 'package.json')).version;
// The fake CLIs are POSIX shebang scripts, which Windows cannot execute from PATH.
const posix = { skip: process.platform === 'win32' };
const community = 'anthropics/claude-plugins-community';
const login = 'gh auth login --hostname github.com';

// `plugin list --json` and `plugin marketplace list` print the files in state/, and every call is logged.
// A file named failadd in state/ makes `plugin marketplace add` fail. The JSON shape mirrors the real
// `claude plugin list --json`: an array of { id, version, scope, enabled, ... }.
const entry = (id, extra = {}) => ({ id, version: '1.0.0', scope: 'user', enabled: true, installPath: '/x', ...extra });
const listing = (...entries) => JSON.stringify(entries, null, 2);
function fakeClaude(f, { failInstall } = {}) {
  const bin = path.join(f.base, 'bin'), log = path.join(f.base, 'claude.log'), state = path.join(f.base, 'state');
  fs.mkdirSync(state, { recursive: true });
  const show = name => `if [ -f "${path.join(state, name)}" ]; then while IFS= read -r line || [ -n "$line" ]; do echo "$line"; done < "${path.join(state, name)}"; fi`;
  write(path.join(bin, 'claude'), `#!/bin/sh
echo "$CLAUDE_CONFIG_DIR|$*" >> "${log}"
case "$*" in
  "plugin list --json") if [ -f "${path.join(state, 'jsonfail')}" ]; then exit 2; fi; if [ -f "${path.join(state, 'stderrwarn')}" ]; then echo "warning: update available" >&2; fi; if [ -f "${path.join(state, 'plugins.json')}" ]; then ${show('plugins.json')}; else echo "[]"; fi;;
  "plugin update"*) if [ -f "${path.join(state, 'failupdate')}" ]; then exit 3; fi;;
  "plugin list") if [ -f "${path.join(state, 'textfail')}" ]; then exit 2; fi; ${show('plugins')};;
  "plugin marketplace add"*) if [ -f "${path.join(state, 'failadd')}" ]; then exit 3; fi;;
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
  claude.state('plugins.json', listing(entry('harness@codex-harness', { version }), entry('html-plan@claude-community')));
  const again = setup(f);
  assert.equal(again.code, 0, again.error);
  assert.deepEqual(['codex', 'claude', 'html-plan'].map(name => step(again, name).status), ['unchanged', 'unchanged', 'unchanged']);
});

test('setup registers html-plan only when it is missing and skips the marketplace when already added', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  const installed = setup(f, '--host', 'claude');
  assert.equal(installed.code, 0, installed.error); assert.equal(step(installed, 'html-plan').status, 'installed');
  assert.deepEqual(claude.calls().slice(-4), ['plugin list --json', 'plugin marketplace list', `plugin marketplace add ${community}`, 'plugin install html-plan@claude-community --scope user']);

  const second = fixture(t), known = fakeClaude(second);
  known.state('marketplaces', 'codex-harness\nclaude-community\n');
  assert.equal(setup(second, '--host', 'claude').code, 0);
  assert.deepEqual(known.calls().slice(-3), ['plugin list --json', 'plugin marketplace list', 'plugin install html-plan@claude-community --scope user']);

  // A similarly named plugin, another marketplace, another scope or a disabled entry is not a match.
  const near = fixture(t), lookalike = fakeClaude(near);
  lookalike.state('plugins.json', listing(entry('my-html-plan@claude-community'), entry('html-plan@other'),
    entry('html-plan@claude-community', { scope: 'project' }), entry('html-plan@claude-community', { scope: 'local' })));
  lookalike.state('marketplaces', 'claude-plugins-community\n');
  assert.equal(setup(near, '--host', 'claude').code, 0);
  assert.deepEqual(lookalike.calls().slice(-2), [`plugin marketplace add ${community}`, 'plugin install html-plan@claude-community --scope user']);

  // The user-scope entry is found among long output, and nothing is installed.
  const present = fixture(t), listed = fakeClaude(present);
  listed.state('plugins.json', listing(entry('a@b', { installPath: 'x'.repeat(5000) }), entry('html-plan@claude-community'), entry('c@d', { installPath: 'y'.repeat(5000) })));
  const result = setup(present, '--host', 'claude');
  assert.equal(step(result, 'html-plan').status, 'unchanged');
  assert.equal(listed.calls().some(call => call.startsWith('plugin install html-plan')), false);

  // Only when the output is not JSON does the plain-text match apply.
  const text = fixture(t), plain = fakeClaude(text);
  plain.state('plugins.json', 'not json at all\n');
  plain.state('plugins', 'first\n' + 'x'.repeat(5000) + '\n  html-plan@claude-community  Version: 1\n');
  assert.equal(step(setup(text, '--host', 'claude'), 'html-plan').status, 'unchanged');
  assert.equal(plain.calls().some(call => call.startsWith('plugin install html-plan')), false);
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
  for (const bad of ['{not json', '[]', '{"preferences": 3}', '{"nonsense": true}', '{"max_agents": 0}', '{"model_selection": "sometimes"}']) {
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
  assert.equal(step(failed, 'claude').status, 'failed'); assert.ok(failed.data.run_manually.includes('Rerun the same setup command')); assert.equal(failed.data.run_manually.some(line => /codex-harness setup/.test(line)), false);
  // No half-installed marketplace is left behind to hide the registration on the next run.
  assert.equal(fs.existsSync(path.join(only.home, '.agents')), false);
});

test('invalid arguments change nothing and exit with code 1', t => {
  const f = fixture(t);
  for (const args of [['--knowledge-repo', 'not-a-repo'], ['--knowledge-repo', 'a/b/c'], ['--knowledge-repo', 'bad owner/repo'], ['--knowledge-repo', '/repo'], ['--knowledge-repo='], ['--knowledge-repo', ''], ['--knowledge-branch', 'dev'], ['--knowledge-branch', ''], ['--knowledge-branch', 'has space'],
    ['--knowledge-repo', 'owner/repo', '--knowledge-branch', 'has space'], ['--host', 'mars'], ['--html-plan', 'maybe']]) {
    const result = setup(f, ...args);
    assert.equal(result.code, 1, args.join(' ')); assert.match(result.error, /^harness: /);
    assert.equal(fs.existsSync(f.home), false, args.join(' '));
  }
  assert.equal(setup(f, '--unknown', 'x').code, 1);
});

test('a failed Claude registration is reported with its commands and a rerun retries it', posix, t => {
  const f = fixture(t), claude = fakeClaude(f), target = lib.canonical(path.join(f.home, '.agents/claude-marketplaces/codex-harness'));
  claude.state('failadd', '');
  const failed = setup(f, '--host', 'claude', '--html-plan', 'false');
  assert.equal(failed.code, 2); assert.equal(step(failed, 'claude').ok, false);
  const commands = [`claude plugin marketplace add ${target} --scope user`, 'claude plugin install harness@codex-harness --scope user'];
  assert.deepEqual(step(failed, 'claude').run_manually, commands); assert.deepEqual(failed.data.run_manually, commands);

  // The files are already staged, so installClaude alone would now say unchanged; setup registers anyway.
  fs.rmSync(path.join(f.base, 'state/failadd'));
  const retried = setup(f, '--host', 'claude', '--html-plan', 'false');
  assert.equal(retried.code, 0, retried.error); assert.equal(step(retried, 'claude').status, 'installed');
  // The manifest remembers the failed registration, so installClaude itself repeats it.
  assert.deepEqual(claude.calls().slice(-3), ['--version', `plugin marketplace add ${target} --scope user`, 'plugin install harness@codex-harness --scope user']);
  assert.equal(lib.readJson(path.join(f.home, '.claude/harness/install.json')).registered, true);

  // Once the plugin is listed at user scope, nothing is installed again.
  claude.state('plugins.json', listing(entry('harness@codex-harness', { version })));
  const before = claude.calls().length;
  assert.equal(step(setup(f, '--host', 'claude', '--html-plan', 'false'), 'claude').status, 'unchanged');
  assert.deepEqual(claude.calls().slice(before), ['--version', 'plugin list --json']);

  // A project-scope entry does not count, and a registered marketplace is not added again.
  claude.state('plugins.json', listing(entry('harness@codex-harness', { scope: 'project' })));
  claude.state('marketplaces', 'codex-harness\n');
  const mark = claude.calls().length;
  assert.equal(step(setup(f, '--host', 'claude', '--html-plan', 'false'), 'claude').status, 'registered');
  assert.deepEqual(claude.calls().slice(mark).slice(-1), ['plugin install harness@codex-harness --scope user']);
  assert.equal(claude.calls().slice(mark).some(call => call.startsWith('plugin marketplace add')), false);

  // If the retry fails again, the step fails with the commands.
  const g = fixture(t), again = fakeClaude(g);
  assert.equal(setup(g, '--host', 'claude', '--html-plan', 'false').code, 0);
  again.state('failadd', '');
  const still = setup(g, '--host', 'claude', '--html-plan', 'false');
  assert.equal(still.code, 2); assert.equal(step(still, 'claude').status, 'failed'); assert.ok(step(still, 'claude').run_manually.length > 0);
});

test('settings are written through a temporary file with the final mode and refuse a changed destination', posix, t => {
  const f = fixture(t), file = path.join(f.base, 'harness/settings.json');
  assert.equal(writeSettings(file, { a: 1 }, null), true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "a": 1\n}\n');
  fs.chmodSync(file, 0o640);
  const snapshot = fs.readFileSync(file);
  assert.equal(writeSettings(file, { a: 2 }, snapshot), true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o640); assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 2 });
  // The destination changed after the snapshot: nothing is written and no temporary file is left.
  const stale = fs.readFileSync(file);
  fs.writeFileSync(file, '{"a":3}');
  assert.equal(writeSettings(file, { a: 4 }, stale), false);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":3}');
  // A file that appeared after a "missing" snapshot is also kept.
  assert.equal(writeSettings(file, { a: 5 }, null), false);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":3}');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['settings.json']);
  // A restrictive umask must not change the existing file's exact mode.
  fs.chmodSync(file, 0o664);
  const umask = process.umask(0o077);
  try { assert.equal(writeSettings(file, { a: 6 }, fs.readFileSync(file)), true); } finally { process.umask(umask); }
  assert.equal(fs.statSync(file).mode & 0o777, 0o664);
});

test('a disabled user-scope plugin is left alone and reported with the command to enable it', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  claude.state('plugins.json', listing(entry('html-plan@claude-community', { enabled: false })));
  const result = setup(f, '--host', 'claude');
  assert.equal(result.code, 0, result.error);
  assert.deepEqual(step(result, 'html-plan'), { name: 'html-plan', ok: true, status: 'unchanged', enabled: false, hint: 'claude plugin enable html-plan@claude-community --scope user' });
  assert.equal(claude.calls().some(call => call.startsWith('plugin install html-plan')), false);
  // The same holds for the harness plugin itself on a rerun, and nothing is installed or updated.
  claude.state('plugins.json', listing(entry('harness@codex-harness', { version: '0.0.1', enabled: false })));
  const before = claude.calls().length;
  const again = setup(f, '--host', 'claude', '--html-plan', 'false');
  assert.equal(step(again, 'claude').status, 'unchanged'); assert.equal(step(again, 'claude').enabled, false);
  assert.equal(step(again, 'claude').hint, 'claude plugin enable harness@codex-harness --scope user');
  assert.deepEqual(claude.calls().slice(before), ['--version', 'plugin list --json']);
});

test('a rerun after a failed plugin update retries it, and a matching version does nothing', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  assert.equal(setup(f, '--host', 'claude', '--html-plan', 'false').code, 0);
  claude.state('plugins.json', listing(entry('harness@codex-harness', { version: '0.0.1' })));
  claude.state('failupdate', '');
  const failed = setup(f, '--host', 'claude', '--html-plan', 'false');
  const commands = ['claude plugin marketplace update codex-harness', 'claude plugin update harness@codex-harness --scope user'];
  assert.equal(failed.code, 2); assert.equal(step(failed, 'claude').status, 'failed'); assert.deepEqual(failed.data.run_manually, commands);

  fs.rmSync(path.join(f.base, 'state/failupdate'));
  const before = claude.calls().length;
  const updated = setup(f, '--host', 'claude', '--html-plan', 'false');
  assert.equal(updated.code, 0, updated.error); assert.equal(step(updated, 'claude').status, 'updated');
  assert.deepEqual(claude.calls().slice(before), ['--version', 'plugin list --json', 'plugin marketplace update codex-harness', 'plugin update harness@codex-harness --scope user']);

  claude.state('plugins.json', listing(entry('harness@codex-harness', { version })));
  const mark = claude.calls().length;
  assert.equal(step(setup(f, '--host', 'claude', '--html-plan', 'false'), 'claude').status, 'unchanged');
  assert.deepEqual(claude.calls().slice(mark), ['--version', 'plugin list --json']);
});

test('a failed update with an unchanged version is remembered and retried on the next run', posix, t => {
  const f = fixture(t), claude = fakeClaude(f), target = path.join(f.home, '.agents/claude-marketplaces/codex-harness');
  const manifestFile = path.join(f.home, '.claude/harness/install.json');
  assert.equal(setup(f, '--host', 'claude', '--html-plan', 'false').code, 0);
  assert.equal(lib.readJson(manifestFile).registered, true);
  // Simulate an older staged copy: a consistent manifest whose files differ from the package, so this run updates.
  write(path.join(target, 'older.txt'), 'older');
  write(manifestFile, { ...lib.readJson(manifestFile), files: lib.inventory(target) });
  claude.state('plugins.json', listing(entry('harness@codex-harness', { version })));
  claude.state('failupdate', '');
  const failed = setup(f, '--host', 'claude', '--html-plan', 'false');
  assert.equal(failed.code, 2); assert.equal(step(failed, 'claude').status, 'updated'); assert.equal(step(failed, 'claude').ok, false);
  const commands = ['claude plugin marketplace update codex-harness', 'claude plugin update harness@codex-harness --scope user'];
  assert.deepEqual(failed.data.run_manually, commands);
  assert.equal(lib.readJson(manifestFile).registered, false);
  assert.equal(fs.existsSync(path.join(target, 'older.txt')), false);

  // The files and the listed version now match the package, yet the rerun repeats the update.
  fs.rmSync(path.join(f.base, 'state/failupdate'));
  const before = claude.calls().length;
  const retried = setup(f, '--host', 'claude', '--html-plan', 'false');
  assert.equal(retried.code, 0, retried.error); assert.equal(step(retried, 'claude').status, 'updated');
  assert.deepEqual(claude.calls().slice(before), ['--version', '--version', 'plugin marketplace update codex-harness', 'plugin update harness@codex-harness --scope user']);
  assert.equal(lib.readJson(manifestFile).registered, true);
  assert.equal(step(setup(f, '--host', 'claude', '--html-plan', 'false'), 'claude').status, 'unchanged');
});

test('when the installed plugins cannot be read nothing is installed and the commands are returned', posix, t => {
  const f = fixture(t), claude = fakeClaude(f);
  assert.equal(setup(f, '--host', 'claude').code, 0);
  claude.state('jsonfail', ''); claude.state('textfail', '');
  const before = claude.calls().length;
  const result = setup(f, '--host', 'claude');
  assert.equal(result.code, 2);
  for (const name of ['claude', 'html-plan']) { assert.equal(step(result, name).ok, false); assert.equal(step(result, name).status, 'failed'); assert.match(step(result, name).reason, /could not read/); }
  assert.deepEqual(step(result, 'html-plan').run_manually, ['claude plugin list', `claude plugin marketplace add ${community}`, 'claude plugin install html-plan@claude-community --scope user']);
  assert.equal(step(result, 'claude').run_manually[0], 'claude plugin list'); assert.match(step(result, 'claude').run_manually[2], /^claude plugin install harness@codex-harness --scope user$/);
  assert.equal(claude.calls().slice(before).some(call => /^plugin (install|marketplace add|update)/.test(call)), false);
});

test('plugin detection reads stdout only and falls back to the text list when --json fails', posix, t => {
  // A stderr warning must not push detection to the text match: the project-scope entry means "not installed".
  const f = fixture(t), warned = fakeClaude(f);
  warned.state('stderrwarn', '');
  warned.state('plugins.json', listing(entry('html-plan@claude-community', { scope: 'project' })));
  assert.equal(step(setup(f, '--host', 'claude'), 'html-plan').status, 'installed');
  assert.equal(warned.calls().filter(call => call === 'plugin list').length, 0);

  // With a user-scope entry and a stderr warning, the JSON is still understood.
  const g = fixture(t), quiet = fakeClaude(g);
  quiet.state('stderrwarn', ''); quiet.state('plugins.json', listing(entry('html-plan@claude-community')));
  assert.equal(step(setup(g, '--host', 'claude'), 'html-plan').status, 'unchanged');

  // `plugin list --json` exits nonzero: the plain list is consulted before anything is installed.
  const h = fixture(t), broken = fakeClaude(h);
  broken.state('jsonfail', ''); broken.state('plugins', 'harness@codex-harness\nhtml-plan@claude-community\n');
  const result = setup(h, '--host', 'claude');
  assert.equal(step(result, 'html-plan').status, 'unchanged');
  assert.equal(broken.calls().some(call => call.startsWith('plugin install html-plan')), false);
  assert.ok(broken.calls().includes('plugin list'));
});

test('--help lists the setup command and its options', t => {
  const result = spawnSync(process.execPath, [cli, 'setup', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^ {2}setup \[--home PATH\] \[--host codex\|claude\|all\] \[--knowledge-repo OWNER\/REPO\] \[--knowledge-branch BRANCH\]/m);
  assert.match(result.stdout, /\[--html-plan true\|false\]/);
});
