const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const r = require('../dist/skill/runtime.js');
const lib = require('../dist/skill/lib.js');
const { fixture, write, command, git, init, tree, run } = require('./helpers.cjs');
const create = ['task', 'create', '--id', 'a', '--goal', 'goal', '--acceptance', 'works', '--scope', 'src'];
const sample = () => ({ task_id: 'a', run_id: 'a-1', condition: 'harness', start: '2026-09-21T01:00:00Z', end: '2026-09-21T01:02:00Z' });

test('nested settings, exact types and validation', t => {
  const f = fixture(t);
  write(path.join(f.home, '.codex/harness/settings.json'), { max_agents: 4, models: { standard: { model: 'custom' } } });
  write(path.join(f.project, '.harness.json'), { max_agents: 2 });
  const cfg = lib.settings(f.project, f.home);
  assert.equal(cfg.max_agents, 2); assert.deepEqual(cfg.models.standard, { model: 'custom', reasoning_effort: 'medium' });
  for (const bad of [{ review: 1 }, { unknown: true }, { schema_version: 2 }, { max_agents: 0 }, { max_agents: 1.1 }, { models: [] }, { models: null }, { models: { standard: { reasoning_effort: 'invalid' } } }]) {
    write(path.join(f.project, '.harness.json'), bad); assert.equal(command(f, 'status').code, 2);
  }
});
test('all flags off and enabled false skip writes and input validation', t => {
  const f = fixture(t);
  for (const config of [Object.fromEntries(lib.FLAGS.map(flag => [flag, false])), { enabled: false }]) {
    write(path.join(f.project, '.harness.json'), config); const before = tree(f.base);
    assert.equal(command(f, 'task', 'create', '--id', '../x', '--goal', 'x').code, 0);
    assert.equal(command(f, 'measure', 'record', '--input', 'nonexistent').code, 0);
    assert.equal(command(f, 'doctor').data.active, false); assert.deepEqual(tree(f.base), before);
  }
});
test('task packets, graph validation, scopes, explicit base and no persistence', t => {
  const f = fixture(t);
  assert.equal(command(f, ...create).code, 0); assert.equal(command(f, ...create).code, 2);
  assert.deepEqual(command(f, 'task', 'validate').data.tasks, ['a']);
  assert.equal(command(f, 'task', 'show', '--id', '../a').code, 2);
  assert.equal(command(f, ...create.map(value => value === 'a' ? 'b' : value), '--depends-on', 'missing').code, 2);
  write(path.join(f.project, '.harness.json'), { persistence: false });
  assert.equal(command(f, ...create).code, 0);
  for (const scope of ['../file', '/absolute', 'C:\\absolute', '..\\escape']) assert.equal(command(f, ...create, '--scope', scope).code, 2);
  assert.equal(command(f, ...create, '--base', 'missing').code, 2);
  assert.equal(command(f, 'task', 'show', '--id', 'none').data.skipped, 'persistence disabled; use inline packet');
  for (const graph of [{ a: { dependencies: ['b'] } }, { a: { dependencies: ['b'] }, b: { dependencies: ['a'] } }, { a: {} }, { a: { dependencies: [null] } }]) assert.throws(() => r.validateGraph(graph));
  assert.doesNotThrow(() => r.validateGraph({ a: { dependencies: [] }, b: { dependencies: ['a'] } }));
});
test('canonical project hash stays compatible with Python SHA256 path encoding', t => {
  const f = fixture(t); const expected = crypto.createHash('sha256').update(fs.realpathSync(f.project)).digest('hex').slice(0, 20);
  assert.equal(path.basename(command(f, 'status').data.local_root), expected);
  assert.equal(command(f, 'status').data.project, fs.realpathSync(f.project));
});
test('symlink escape is rejected with a missing path tail', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t), outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.project, 'docs'), 'dir');
  assert.equal(command(f, ...create).code, 2); assert.deepEqual(fs.readdirSync(outside), []);
  assert.throws(() => lib.safePath(f.project, '.'), /escapes/);
  assert.throws(() => lib.safePath(f.project, 'docs', 'missing', 'deep'), /escapes/);
  fs.symlinkSync(path.join(outside, 'missing'), path.join(f.project, 'dangling'), 'dir');
  assert.throws(() => lib.safePath(f.project, 'dangling', 'deep'), /escapes/);
});
test('measurement missing/reset/overlap/decreased and exclusive record', t => {
  const f = fixture(t), base = sample();
  assert.equal(r.measurement(base).account_usage_delta, null);
  Object.assign(base, { usage_before: 10, usage_after: 12, window_before: 'same', window_after: 'same', overlap: false });
  assert.equal(r.measurement(base).account_usage_delta, 2); assert.equal(r.measurement(base).elapsed_seconds, 120);
  for (const change of [{ window_after: 'new' }, { overlap: true }, { usage_after: 1 }]) assert.equal(r.measurement({ ...base, ...change }).comparable, false);
  for (const change of [{ task_id: 123 }, { usage_before: true }, { usage_before: -1 }, { usage_after: 101 }, { start: '2026-02-30T01:00:00Z' }, { start: '2026-09-21T01:00:00' }, { end: '2025-09-21T01:00:00Z' }]) assert.throws(() => r.measurement({ ...base, ...change }));
  const source = path.join(f.base, 'measurement.json'); write(source, base);
  assert.equal(command(f, 'measure', 'record', '--input', source).code, 0);
  assert.equal(command(f, 'measure', 'record', '--input', source).code, 2);
  write(path.join(f.project, '.harness.json'), { measurement: false });
  assert.equal(command(f, 'measure', 'record', '--input', 'missing').data.skipped, 'measurement disabled');
});
test('measurement timezone offsets, leap dates and fractional seconds', () => {
  const base = sample();
  assert.equal(r.measurement({ ...base, start: '2024-02-29T10:00:00.123456+09:00', end: '2024-02-29T01:00:01.123456Z' }).elapsed_seconds, 1);
  assert.equal(r.measurement({ ...base, start: '2026-09-21T01:00:00.000000Z', end: '2026-09-21T01:00:00.000001Z' }).elapsed_seconds, 0.000001);
});
test('worktree isolation, coordinator dirty exemptions and collisions', t => {
  const f = fixture(t); git(f.project, 'init'); assert.equal(command(f, 'doctor').data.parallel_worktrees, false); init(f);
  assert.equal(command(f, ...create).code, 0); write(path.join(f.project, '.harness.json'), { max_agents: 2 });
  const result = command(f, 'worktree', 'create', '--id', 'a', '--base', 'HEAD'); assert.equal(result.code, 0, result.error);
  assert.equal(fs.existsSync(path.join(result.data.path, '.harness.json')), false);
  assert.equal(fs.existsSync(path.join(result.data.path, 'docs/harness/tasks/a.json')), false);
  write(path.join(result.data.path, 'file'), 'separate'); assert.equal(fs.readFileSync(path.join(f.project, 'file'), 'utf8'), 'initial');
  assert.equal(command(f, 'worktree', 'create', '--id', 'a', '--base', 'HEAD').code, 2);
  assert.equal(command(f, 'worktree', 'create', '--id', 'b', '--base', 'missing').code, 2);
  write(path.join(f.project, 'file'), 'user changes');
  assert.equal(command(f, 'worktree', 'create', '--id', 'b', '--base', 'HEAD').code, 2);
  assert.equal(fs.readFileSync(path.join(f.project, 'file'), 'utf8'), 'user changes');
  write(path.join(f.project, '.harness.json'), { delegation: false });
  assert.deepEqual(command(f, 'worktree', 'create', '--id', 'c', '--base', 'HEAD').data, { skipped: 'delegation disabled' });
});
test('worktree recorded base mismatch, matching historical base and absent packet', t => {
  const f = fixture(t), initial = init(f); assert.equal(command(f, ...create).code, 0);
  write(path.join(f.project, 'file'), 'advance'); git(f.project, 'add', 'file'); git(f.project, 'commit', '-m', 'advance');
  const mismatch = command(f, 'worktree', 'create', '--id', 'a', '--base', 'HEAD');
  assert.equal(mismatch.code, 2); assert.match(mismatch.error, /code_base_revision does not match/);
  assert.equal(git(f.project, 'branch', '--list', 'harness/a'), '');
  assert.equal(command(f, 'worktree', 'create', '--id', 'a', '--base', initial).data.base_revision, initial);
  assert.equal(command(f, 'worktree', 'create', '--id', 'integration', '--base', 'HEAD').code, 0);
});
test('malformed or null-base worktree packet refuses before mutation', t => {
  const f = fixture(t); init(f);
  for (const packet of [[], {}, { code_base_revision: null }]) {
    write(path.join(f.project, 'docs/harness/tasks/malformed.json'), packet);
    assert.equal(command(f, 'worktree', 'create', '--id', 'malformed', '--base', 'HEAD').code, 2);
    assert.equal(git(f.project, 'branch', '--list', 'harness/malformed'), '');
    assert.equal(fs.existsSync(path.join(lib.localRoot(f.project, f.home), 'worktrees/malformed')), false);
  }
});
test('CLI rejects malformed commands/options and missing required base', t => {
  const f = fixture(t);
  for (const args of [[], ['task'], ['worktree', 'create', '--id', 'x'], ['status', '--unknown', 'x'], ['status', '--project'], ['task', 'show']]) assert.equal(run(args, { cwd: f.project }).code, 2);
  assert.equal(command(f, 'status', '--project=' + f.project).code, 0);
});
test('measurement preserves microseconds near datetime year limit', () => {
  assert.equal(r.measurement({ ...sample(), start: '9999-12-31T23:59:59.000001Z', end: '9999-12-31T23:59:59.000002Z' }).elapsed_seconds, 0.000001);
});
test('canonical paths resolve symlinks before parent traversal, including missing tails', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t), actual = path.join(f.base, 'actual'), nested = path.join(actual, 'nested');
  fs.mkdirSync(nested, { recursive: true }); fs.symlinkSync(nested, path.join(f.project, 'link'), 'dir');
  const input = f.project + '/link/..';
  assert.equal(lib.canonical(input), actual);
  assert.equal(lib.canonical(input + '/missing/tail'), path.join(actual, 'missing/tail'));
  assert.equal(run(['status', '--project', input, '--home', f.home]).data.local_root, lib.localRoot(actual, f.home));
  assert.throws(() => lib.safePath(f.project, 'link/../missing'), /escapes/);
});
