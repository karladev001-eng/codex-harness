const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authoring, SKILLS } = require('../dist/skill/authoring.js');
const { fixture, write, tree, root, run } = require('./helpers.cjs');
const lib = require('../dist/skill/lib.js');
function args(f, action = 'install', skill = []) { return { project: f.project, action, skill }; }

test('four authoring skills install/update/uninstall independently with no activation', t => {
  const f = fixture(t); write(path.join(f.project, 'AGENTS.md'), 'Keep instructions\r\n'); write(path.join(f.project, '.harness.json'), '{"enabled":false}\n');
  const result = authoring(args(f)); assert.equal(result.status, 'installed'); assert.deepEqual(result.skills, SKILLS);
  for (const name of SKILLS) assert.deepEqual(lib.inventory(path.join(result.root, name)), lib.inventory(path.join(root, 'authoring-skills', name)));
  assert.equal(fs.existsSync(path.join(f.project, 'docs/harness')), false); assert.equal(fs.readFileSync(path.join(f.project, 'AGENTS.md'), 'utf8'), 'Keep instructions\r\n');
  assert.equal(authoring(args(f)).status, 'unchanged');
  assert.equal(authoring(args(f, 'uninstall', ['inspect-harness'])).status, 'uninstalled');
  assert.equal(fs.existsSync(path.join(result.root, 'create-harness')), true);
  assert.equal(authoring(args(f, 'install', ['inspect-harness'])).status, 'installed');
  assert.equal(authoring(args(f, 'uninstall')).status, 'uninstalled');
  assert.equal(authoring(args(f, 'uninstall')).status, 'not_installed');
  assert.equal(fs.existsSync(path.join(result.root, '.codex-harness-authoring.json')), false);
  assert.equal(fs.readFileSync(path.join(f.project, '.harness.json'), 'utf8'), '{"enabled":false}\n');
});
test('authoring preflights all targets and preserves unowned collisions', t => {
  const f = fixture(t); write(path.join(f.project, '.agents/skills/inspect-harness/SKILL.md'), 'user skill'); const before = tree(f.base);
  assert.throws(() => authoring(args(f)), /Unowned/); assert.deepEqual(tree(f.base), before);
});
test('edited authoring skills prevent updates and removals; unrelated skills retained', t => {
  const f = fixture(t), result = authoring(args(f));
  write(path.join(result.root, 'another-skill/SKILL.md'), 'unrelated'); fs.appendFileSync(path.join(result.root, 'inspect-harness/SKILL.md'), '\nuser edit');
  const before = tree(f.base);
  for (const action of ['install', 'uninstall']) assert.throws(() => authoring(args(f, action)), /user changes/);
  assert.deepEqual(tree(f.base), before);
});
test('authoring update is transactionally rolled back when manifest write fails', t => {
  const f = fixture(t), result = authoring(args(f)), source = path.join(f.base, 'release'); lib.copySkill(path.join(root, 'authoring-skills'), source);
  for (const name of SKILLS) fs.appendFileSync(path.join(source, name, 'SKILL.md'), '\nNew version');
  const before = tree(result.root), original = fs.writeFileSync; let fired = false;
  fs.writeFileSync = function (file, ...rest) { if (!fired && file === path.join(result.root, '.codex-harness-authoring.json')) { fired = true; throw new Error('simulated failure'); } return original.call(this, file, ...rest); };
  t.after(() => { fs.writeFileSync = original; });
  assert.throws(() => authoring(args(f), source), /simulated/); assert.deepEqual(tree(result.root), before);
});
test('authoring incomplete source rejected before any project mutation', t => {
  const f = fixture(t), source = path.join(f.base, 'release'); lib.copySkill(path.join(root, 'authoring-skills'), source); fs.unlinkSync(path.join(source, 'create-harness/assets/workflow.md'));
  const before = tree(f.project); assert.throws(() => authoring(args(f), source), /incomplete/); assert.deepEqual(tree(f.project), before);
});
test('authoring explicit skills-dir supports personal path and subset', t => {
  const f = fixture(t), destination = path.join(f.home, '.codex/skills');
  const result = run(['authoring', 'install', '--project', f.project, '--skills-dir', destination, '--skill', 'inspect-harness']);
  assert.equal(result.code, 0, result.error); assert.deepEqual(result.data.skills, ['inspect-harness']);
  assert.equal(fs.existsSync(path.join(f.project, '.agents')), false);
  assert.equal(run(['authoring', 'uninstall', '--project', f.project, '--skills-dir', destination, '--skill', 'inspect-harness']).code, 0);
});
test('authoring symlink project escape refuses before mutation', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t), outside = path.join(f.base, 'outside'); fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(f.project, '.agents'), 'dir');
  const before = tree(f.base); assert.throws(() => authoring(args(f)), /escapes/); assert.deepEqual(tree(f.base), before);
});
