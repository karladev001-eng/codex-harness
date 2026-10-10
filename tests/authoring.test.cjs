const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authoring, SKILLS, DEFAULT_SKILLS } = require('../dist/skill/authoring.js');
const { fixture, write, tree, root, run } = require('./helpers.cjs');
const lib = require('../dist/skill/lib.js');
function args(f, action = 'install', skill = []) { return { project: f.project, action, skill }; }

test('five default authoring skills install/update/uninstall independently with no activation', t => {
  const f = fixture(t); write(path.join(f.project, 'AGENTS.md'), 'Keep instructions\r\n'); write(path.join(f.project, '.harness.json'), '{"enabled":false}\n');
  const result = authoring(args(f)); assert.equal(result.status, 'installed'); assert.deepEqual(result.skills, DEFAULT_SKILLS);
  for (const name of DEFAULT_SKILLS) assert.deepEqual(lib.inventory(path.join(result.root, name)), lib.inventory(path.join(root, 'authoring-skills', name)));
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
test('legacy four-skill selection and standalone skill installs remain supported', t => {
  const f = fixture(t), legacy = ['create-rulebooks', 'create-subagent', 'create-harness', 'inspect-harness'];
  const result = authoring(args(f, 'install', legacy)); assert.deepEqual(result.skills, legacy);
  assert.equal(fs.existsSync(path.join(result.root, 'codex-html-plan')), false);
  assert.equal(authoring(args(f, 'install', ['codex-html-plan'])).skills[0], 'codex-html-plan');
  const htmlPlan = path.join(result.root, 'codex-html-plan');
  for (const file of ['LICENSE', 'runtime/pack.mjs', 'examples/task-board.plan.html']) assert.equal(fs.existsSync(path.join(htmlPlan, file)), true, file);
  assert.equal(authoring(args(f, 'uninstall', ['codex-html-plan'])).status, 'uninstalled');
  assert.equal(authoring(args(f, 'uninstall', legacy)).status, 'uninstalled');
  const slides = authoring(args(f, 'install', ['codex-slide-plan'])); assert.deepEqual(slides.skills, ['codex-slide-plan']);
  const slidePlan = path.join(slides.root, 'codex-slide-plan');
  for (const file of ['SKILL.md', 'references/schema.md', 'references/workflow.md', 'references/quality-review.md', 'references/masters.md', 'scripts/legacy-v1.json', 'scripts/pack.mjs', 'scripts/review.js', 'scripts/style.css', 'scripts/inspect-master.py', 'scripts/make-fixtures.py', 'examples/deck.json', 'examples/deck-revised.json', 'examples/visual-first/generate-example.mjs', 'examples/visual-first/references/r2-deck.json', 'examples/visual-first/scripts/aggregate.mjs', 'examples/visual-first/data/brief.md', 'examples/visual-first/data/measurements.csv', 'examples/visual-first/assets/comparison.svg'])
    assert.equal(fs.existsSync(path.join(slidePlan, file)), true, file);
  assert.equal(authoring(args(f, 'uninstall', ['codex-slide-plan'])).status, 'uninstalled');
});
test('a previous five-skill manifest remains unchanged without optional selection', t => {
  const f = fixture(t), previous = ['create-rulebooks', 'create-subagent', 'create-harness', 'inspect-harness', 'codex-html-plan'];
  const initial = authoring(args(f, 'install', previous)); assert.deepEqual(initial.skills, previous);
  const update = authoring(args(f)); assert.equal(update.status, 'unchanged'); assert.deepEqual(update.skills, previous);
  assert.equal(fs.existsSync(path.join(initial.root, 'codex-slide-plan')), false);
  for (const name of previous) assert.equal(fs.existsSync(path.join(initial.root, name, 'SKILL.md')), true, name);
  assert.equal(authoring(args(f, 'uninstall')).status, 'uninstalled');
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
test('incomplete codex-html-plan source is rejected before any project mutation', t => {
  const f = fixture(t), source = path.join(f.base, 'release'); lib.copySkill(path.join(root, 'authoring-skills'), source);
  fs.unlinkSync(path.join(source, 'codex-html-plan/runtime/pack.mjs'));
  const before = tree(f.project); assert.throws(() => authoring(args(f), source), /incomplete: codex-html-plan: runtime\/pack\.mjs/); assert.deepEqual(tree(f.project), before);
});
test('incomplete codex-slide-plan source is rejected before any project mutation', t => {
  const f = fixture(t), source = path.join(f.base, 'release'); lib.copySkill(path.join(root, 'authoring-skills'), source);
  fs.unlinkSync(path.join(source, 'codex-slide-plan/scripts/pack.mjs'));
  const before = tree(f.project); assert.throws(() => authoring(args(f, 'install', ['codex-slide-plan']), source), /incomplete: codex-slide-plan:.*scripts\/pack\.mjs/); assert.deepEqual(tree(f.project), before);
});
test('codex-slide-plan install rejects a missing required review guide before project mutation', t => {
  const f = fixture(t), source = path.join(f.base, 'release'); lib.copySkill(path.join(root, 'authoring-skills'), source);
  fs.unlinkSync(path.join(source, 'codex-slide-plan/references/quality-review.md'));
  const before = tree(f.project);
  assert.throws(() => authoring(args(f, 'install', ['codex-slide-plan']), source), /incomplete: codex-slide-plan:.*references\/quality-review\.md/);
  assert.deepEqual(tree(f.project), before);
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

test('default operations preserve independently installed optional even when edited', t => {
  const f = fixture(t), optional = authoring(args(f, 'install', ['codex-slide-plan']));
  fs.appendFileSync(path.join(optional.root, 'codex-slide-plan/SKILL.md'), '\nUser customization');
  const saved = tree(path.join(optional.root, 'codex-slide-plan'));
  authoring(args(f)); assert.deepEqual(tree(path.join(optional.root, 'codex-slide-plan')), saved);
  assert.equal(authoring(args(f)).status, 'unchanged');
  authoring(args(f, 'uninstall')); assert.deepEqual(tree(path.join(optional.root, 'codex-slide-plan')), saved);
  for (const action of ['install', 'uninstall']) assert.throws(() => authoring(args(f, action, ['codex-slide-plan'])), /user changes/);
});
test('optional explicit reinstall, update, conflict and personal removal remain independent', t => {
  const f = fixture(t), source = path.join(f.base, 'release'); lib.copySkill(path.join(root, 'authoring-skills'), source);
  const selected = args(f, 'install', ['codex-slide-plan']); selected.skills_dir = path.join(f.home, 'personal skills');
  const installed = authoring(selected, source); assert.equal(authoring(selected, source).status, 'unchanged');
  fs.appendFileSync(path.join(source, 'codex-slide-plan/SKILL.md'), '\nNew release');
  assert.equal(authoring(selected, source).status, 'installed');
  assert.deepEqual(lib.inventory(path.join(installed.root, 'codex-slide-plan')), lib.inventory(path.join(source, 'codex-slide-plan')));
  assert.equal(fs.existsSync(path.join(f.project, '.agents')), false);
  fs.appendFileSync(path.join(installed.root, 'codex-slide-plan/SKILL.md'), '\nUser edit');
  const saved = tree(f.base); assert.throws(() => authoring(selected, source), /user changes/); assert.deepEqual(tree(f.base), saved);
  fs.copyFileSync(path.join(source, 'codex-slide-plan/SKILL.md'), path.join(installed.root, 'codex-slide-plan/SKILL.md'));
  assert.equal(authoring({ ...selected, action: 'uninstall' }).status, 'uninstalled');
  write(path.join(installed.root, 'codex-slide-plan/SKILL.md'), 'unowned');
  assert.throws(() => authoring(selected, source), /Unowned/);
});
test('permanent runtime cannot accidentally consume sibling optional sources', t => {
  const f = fixture(t), installed = require('../dist/skill/install.js').install({ home: f.home });
  const sibling = path.resolve(installed.target, '../../authoring-skills/codex-slide-plan');
  lib.copySkill(path.join(root, 'authoring-skills/codex-slide-plan'), sibling);
  const before = tree(f.base);
  const result = run(['authoring', 'install', '--project', f.project, '--skill', 'codex-slide-plan'], { cli: path.join(installed.target, 'runtime.js') });
  assert.equal(result.code, 1); assert.match(result.error, /supporting release npm package or tarball/); assert.deepEqual(tree(f.base), before);
});
