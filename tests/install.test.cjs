const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const installer = require('../dist/skill/install.js');
const lib = require('../dist/skill/lib.js');
const { fixture, write, run, root, tree } = require('./helpers.cjs');
function locations(f) { return { args: { home: f.home }, codex: path.join(f.home, '.codex'), agents: path.join(f.home, '.codex/AGENTS.md'), manifest: path.join(f.home, '.codex/harness/install.json') }; }
function failOnce(t, method, predicate) { const original = fs[method]; let fired = false; fs[method] = function (...args) { if (!fired && predicate(...args)) { fired = true; throw new Error('simulated failure'); } return original.apply(this, args); }; t.after(() => { fs[method] = original; }); return () => { fs[method] = original; }; }
function legacy(f) {
  const l = locations(f), target = path.join(f.home, '.agents/skills/codex-harness');
  for (const [name, text] of Object.entries(require('./fixtures/legacy-schema1.json').files)) write(path.join(target, name), text);
  const block = `${installer.START}\nA delegated worker performs only its bounded assignment and never starts this coordinator.\nFor coding requests, invoke Python 3.9+ on \`${path.join(target, 'runtime.py')}\`\nwith arguments \`status --project .\`, quoting its path for the active shell.\nIf inactive, continue normally without additional harness actions. If active, read\n\`${path.join(target, 'SKILL.md')}\` and follow its orchestration instructions.\nHonor higher-priority environment and project instructions. If the skill is absent, continue normally.\nIf status fails, report the configuration or compatibility error; do not activate features silently.\n${installer.END}`;
  const original = '\uFEFF# User instructions\r\nKeep these bytes. 日本語';
  write(l.agents, original + '\n\n' + block + '\n');
  write(l.manifest, { schema_version: 1, target, agents: l.agents, files: lib.inventory(target), block, separator: '\n\n', suffix: '\n', agents_existed: true });
  write(path.join(target, '__pycache__/runtime.pyc'), 'ignored legacy cache');
  return { ...l, target, original };
}
test('install idempotence, exact CRLF/BOM/unrelated content/settings preservation', t => {
  const f = fixture(t), l = locations(f), original = '\uFEFF# User instructions\r\nKeep these bytes.';
  write(l.agents, original); const settings = path.join(l.codex, 'harness/settings.json'); write(settings, '{"enabled": false}\r\n');
  const result = installer.install(l.args); assert.equal(fs.existsSync(path.join(result.target, 'runtime.js')), true);
  const modified = fs.statSync(l.agents).mtimeMs;
  assert.equal(installer.install(l.args).status, 'unchanged'); assert.equal(fs.statSync(l.agents).mtimeMs, modified);
  fs.appendFileSync(l.agents, 'Additional instruction.\n'); installer.uninstall(l.args);
  assert.equal(fs.readFileSync(l.agents, 'utf8'), original + 'Additional instruction.\n');
  assert.equal(fs.readFileSync(settings, 'utf8'), '{"enabled": false}\r\n'); assert.equal(fs.existsSync(result.target), false);
  assert.equal(installer.uninstall(l.args).status, 'not_installed');
});
test('new AGENTS removed and post-install unrelated AGENTS retained', t => {
  const f = fixture(t), l = locations(f); installer.install(l.args); installer.uninstall(l.args); assert.equal(fs.existsSync(l.agents), false);
  installer.install(l.args); fs.appendFileSync(l.agents, 'New instruction\r\n'); installer.uninstall(l.args); assert.equal(fs.readFileSync(l.agents, 'utf8'), 'New instruction\r\n');
});
test('edited or added skill files refuse both update and uninstall', t => {
  const f = fixture(t), l = locations(f), result = installer.install(l.args);
  fs.appendFileSync(path.join(result.target, 'SKILL.md'), '\nUser edit\n');
  for (const operation of [installer.install, installer.uninstall]) assert.throws(() => operation(l.args), /user changes/);
  assert.match(fs.readFileSync(path.join(result.target, 'SKILL.md'), 'utf8'), /User edit/);
});
test('added user file and edited managed block are refused', t => {
  const f = fixture(t), l = locations(f), result = installer.install(l.args), userFile = path.join(result.target, 'notes.txt');
  write(userFile, 'notes'); assert.throws(() => installer.uninstall(l.args), /user changes/); fs.unlinkSync(userFile);
  write(l.agents, fs.readFileSync(l.agents, 'utf8').replace('For coding requests', 'Edited'));
  for (const operation of [installer.install, installer.uninstall]) assert.throws(() => operation(l.args), /edited/);
});
test('unowned target or markers and override refuse without mutation', t => {
  const f = fixture(t), l = locations(f), target = path.join(f.home, '.agents/skills/codex-harness');
  write(path.join(target, 'user.txt'), 'mine'); const before = tree(f.base);
  assert.throws(() => installer.install(l.args), /Unowned/); assert.deepEqual(tree(f.base), before);
  fs.rmSync(target, { recursive: true }); write(l.agents, installer.START); assert.throws(() => installer.install(l.args), /Unowned/);
  fs.unlinkSync(l.agents); write(path.join(l.codex, 'AGENTS.override.md'), 'override');
  assert.throws(() => installer.install(l.args), /shadow/); assert.equal(fs.existsSync(l.agents), false);
});
test('custom CODEX_HOME with default skill home and explicit home override', t => {
  const f = fixture(t), custom = path.join(f.base, 'custom codex');
  const env = { ...process.env, HOME: f.home, USERPROFILE: f.home, CODEX_HOME: custom };
  const result = run(['install'], { env }); assert.equal(result.code, 0, result.error);
  assert.equal(result.data.target, path.join(f.home, '.agents/skills/codex-harness'));
  assert.equal(fs.existsSync(path.join(custom, 'AGENTS.md')), true); assert.equal(run(['uninstall'], { env }).code, 0);
  const parent = path.join(f.home, 'my skills');
  const explicit = run(['install', '--home', f.home, '--skills-dir', parent], { env }); assert.equal(explicit.code, 0, explicit.error);
  assert.equal(explicit.data.target, path.join(parent, 'codex-harness'));
  assert.equal(run(['install', '--home', f.home], { env }).data.status, 'unchanged');
  assert.equal(run(['uninstall', '--home', f.home], { env }).code, 0);
});
test('valid prior release updates with backup', t => {
  const f = fixture(t), l = locations(f); const result = installer.install(l.args);
  write(path.join(result.target, 'old-release.txt'), 'old'); const state = lib.readJson(l.manifest); state.files = lib.inventory(result.target); write(l.manifest, state);
  const updated = installer.install(l.args); assert.equal(updated.status, 'installed');
  assert.equal(fs.existsSync(path.join(updated.backup, 'skill/old-release.txt')), true); assert.equal(fs.existsSync(path.join(result.target, 'old-release.txt')), false);
});
test('copied runtime works outside repo and inside a module-typed parent', t => {
  const f = fixture(t), l = locations(f); write(path.join(f.home, 'package.json'), { type: 'module' });
  const result = installer.install(l.args);
  const status = run(['status', '--project', f.project, '--home', f.home], { cwd: f.base, cli: path.join(result.target, 'runtime.js') });
  assert.equal(status.code, 0, status.error); assert.equal(status.data.active, true);
  assert.match(fs.readFileSync(l.agents, 'utf8'), new RegExp('runtime\\.js'));
  installer.uninstall(l.args);
});
test('first-install failed manifest write rolls back AGENTS and target', t => {
  const f = fixture(t), l = locations(f); write(l.agents, 'Original\r\n');
  failOnce(t, 'writeFileSync', file => file === l.manifest);
  assert.throws(() => installer.install(l.args), /simulated/);
  assert.equal(fs.readFileSync(l.agents, 'utf8'), 'Original\r\n'); assert.equal(fs.existsSync(path.join(f.home, '.agents/skills/codex-harness')), false); assert.equal(fs.existsSync(l.manifest), false);
});
test('failed update and uninstall restore all owned bytes', t => {
  const f = fixture(t), l = legacy(f), beforeSkill = tree(l.target), beforeAgents = fs.readFileSync(l.agents), beforeManifest = fs.readFileSync(l.manifest);
  let restore = failOnce(t, 'writeFileSync', file => file === l.manifest); assert.throws(() => installer.install(l.args), /simulated/); restore();
  assert.deepEqual(tree(l.target), beforeSkill); assert.deepEqual(fs.readFileSync(l.agents), beforeAgents); assert.deepEqual(fs.readFileSync(l.manifest), beforeManifest);
  restore = failOnce(t, 'unlinkSync', file => file === l.manifest); assert.throws(() => installer.uninstall(l.args), /simulated/); restore();
  assert.deepEqual(tree(l.target), beforeSkill); assert.deepEqual(fs.readFileSync(l.agents), beforeAgents); assert.deepEqual(fs.readFileSync(l.manifest), beforeManifest);
});
test('source target overlap refused before mutation', t => {
  const f = fixture(t), source = path.join(f.base, 'release/skill'); lib.copySkill(path.join(root, 'dist/skill'), source);
  const before = tree(f.base); assert.throws(() => installer.install({ home: f.home, skills_dir: path.join(source, 'nested') }, source), /overlap/); assert.deepEqual(tree(f.base), before);
});
test('every required source asset is checked before backup/mutation', t => {
  const f = fixture(t), l = locations(f), source = path.join(f.base, 'release/skill'); lib.copySkill(path.join(root, 'dist/skill'), source); write(l.agents, 'Original');
  for (const file of installer.REQUIRED_SOURCE_FILES) {
    const missing = path.join(source, file), bytes = fs.readFileSync(missing); fs.unlinkSync(missing); const before = tree(f.base);
    assert.throws(() => installer.install(l.args, source), /Source skill is incomplete/, file); assert.deepEqual(tree(f.base), before); fs.writeFileSync(missing, bytes);
  }
});
test('schema1 legacy migrates without Python and keeps exact unrelated bytes/settings', t => {
  const f = fixture(t), l = legacy(f); write(path.join(l.codex, 'harness/settings.json'), '{"enabled":false}\r\n');
  const result = installer.install(l.args); assert.equal(result.status, 'installed'); assert.equal(lib.readJson(l.manifest).schema_version, 2);
  assert.equal(fs.existsSync(path.join(l.target, 'runtime.py')), false); assert.equal(fs.existsSync(path.join(result.backup, 'skill/runtime.py')), true);
  assert.equal(fs.existsSync(path.join(l.target, '__pycache__')), false);
  assert.equal(fs.readFileSync(l.agents, 'utf8'), l.original + '\n\n' + installer.bootstrap(l.target) + '\n');
  assert.equal(installer.install(l.args).status, 'unchanged'); installer.uninstall(l.args);
  assert.equal(fs.readFileSync(l.agents, 'utf8'), l.original); assert.equal(fs.readFileSync(path.join(l.codex, 'harness/settings.json'), 'utf8'), '{"enabled":false}\r\n');
});
test('schema1 edited owned file or block refuses migration without writing', t => {
  const f = fixture(t), l = legacy(f); fs.appendFileSync(path.join(l.target, 'runtime.py'), '# edit');
  let before = tree(f.base); assert.throws(() => installer.install(l.args), /user changes/); assert.deepEqual(tree(f.base), before);
  const state = lib.readJson(l.manifest); state.files = lib.inventory(l.target); write(l.manifest, state);
  write(l.agents, fs.readFileSync(l.agents, 'utf8').replace('invoke Python', 'invoke edited Python'));
  before = tree(f.base); assert.throws(() => installer.install(l.args), /edited/); assert.deepEqual(tree(f.base), before);
});
test('symlink targets, manifests and source assets refused', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t), l = locations(f), outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  fs.mkdirSync(path.join(f.home, '.agents/skills'), { recursive: true }); fs.symlinkSync(outside, path.join(f.home, '.agents/skills/codex-harness'), 'dir');
  assert.throws(() => installer.install(l.args), /symlink/);
  fs.unlinkSync(path.join(f.home, '.agents/skills/codex-harness')); fs.mkdirSync(l.codex); fs.symlinkSync(path.join(f.base, 'missing'), l.agents);
  assert.throws(() => installer.install(l.args), /symlink/);
});
test('built plugin runtime is self-contained when copied outside the repository', t => {
  const f = fixture(t), copied = path.join(f.base, 'portable plugin');
  fs.cpSync(path.join(root, 'dist/plugins/codex-harness'), copied, { recursive: true });
  assert.equal(lib.readJson(path.join(copied, '.codex-plugin/plugin.json')).skills, './skills/');
  const result = run(['status', '--project', f.project, '--home', f.home], { cwd: f.base, cli: path.join(copied, 'skills/harness/runtime.js') });
  assert.equal(result.code, 0, result.error); assert.equal(result.data.active, true);
});
test('failure before AGENTS write restores the previous installation', t => {
  const f = fixture(t), l = legacy(f), before = { skill: tree(l.target), agents: fs.readFileSync(l.agents), manifest: fs.readFileSync(l.manifest) };
  failOnce(t, 'writeFileSync', file => file === l.agents);
  assert.throws(() => installer.install(l.args), /simulated/);
  assert.deepEqual(tree(l.target), before.skill); assert.deepEqual(fs.readFileSync(l.agents), before.agents); assert.deepEqual(fs.readFileSync(l.manifest), before.manifest);
});
test('rollback failure retains previous skill and reports recovery location', t => {
  const f = fixture(t), l = legacy(f), originalWrite = fs.writeFileSync, originalRename = fs.renameSync;
  fs.writeFileSync = function (file, ...args) { if (file === l.manifest) throw new Error('simulated manifest failure'); return originalWrite.call(this, file, ...args); };
  fs.renameSync = function (source, target) { if (path.basename(source) === 'previous') throw new Error('simulated rollback failure'); return originalRename.call(this, source, target); };
  t.after(() => { fs.writeFileSync = originalWrite; fs.renameSync = originalRename; });
  let recovery;
  assert.throws(() => installer.install(l.args), error => { assert.match(error.message, /rollback incomplete; recovery files kept at/); recovery = /recovery files kept at (.*): Error: simulated rollback/.exec(error.message)[1]; return true; });
  assert.equal(fs.existsSync(path.join(recovery, 'previous/runtime.py')), true);
});
