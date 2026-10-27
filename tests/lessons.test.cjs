const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, write, command, git } = require('./helpers.cjs');
const lib = require('../dist/skill/lib.js');
const { lessons, validateLesson } = require('../dist/skill/lessons.js');
const { preferences } = require('../dist/skill/preferences.js');
const records = require('../dist/skill/records.js');
const { server, explicit, automatic } = require('./records-helper.cjs');
function sample(id = 'fetch-lock') { return { schema_version: 1, id, cause: 'An interrupted fetch left a lock', remedy: 'Fetch into a new isolated repository', verification: ['Interrupted a fetch and the next run succeeds'], scope: ['Git snapshot reader'], sources: ['task:reader-recovery'], recorded_at: '2020-01-02T03:04:05+09:00', evaluation: 'unknown' }; }
function setup(t) {
  const f = fixture(t), config = explicit(), api = server(), input = path.join(f.base, 'lesson.json'); config.preferences.autosave = true; write(path.join(f.project, '.harness.json'), { preferences: { ...config.preferences, autosave: true } });
  const action = (action, extra = {}) => lessons({ project: f.project, home: f.home, action, id: 'fetch-lock', input, ...extra }, config, api.transport);
  return { ...f, config, api, input, action };
}
test('lesson schema requires cause/remedy/verification/scope/source/time and preserves unknown evaluation', () => {
  assert.deepEqual(validateLesson(sample()), sample());
  for (const field of ['cause', 'remedy', 'verification', 'scope', 'sources', 'recorded_at', 'evaluation']) { const value = sample(); delete value[field]; assert.throws(() => validateLesson(value)); }
  assert.throws(() => validateLesson({ ...sample(), evaluation: 'accepted' }), /evaluation_sources/);
  assert.throws(() => validateLesson({ ...sample(), id: '../unsafe' }));
  assert.throws(() => validateLesson({ ...sample(), arbitrary: 'not in schema' }));
});
test('lesson write/read/search is separate from preferences; stale and pending records never auto-apply', t => {
  const f = setup(t), first = f.action('read'); write(f.input, sample());
  const saved = f.action('write', { revision: first.revision }); assert.equal(saved.ok, true); assert.equal(saved.lesson.evaluation, 'unknown');
  assert.equal(f.api.files.has('improvement/projects/stable/preferences.md'), false);
  assert.equal(f.action('read').lesson.recorded_at, sample().recorded_at);
  const search = f.action('search', { query: 'interrupted', limit: '1' }); assert.equal(search.lessons.length, 1); assert.equal(search.freshness, 'fresh');
  const before = f.action('read'); write(f.input, { ...sample(), remedy: 'Updated remedy' }); f.api.fail('unavailable');
  assert.equal(f.action('write', { revision: before.revision }).pending, true);
  assert.equal(f.action('read', { automatic: true }).lesson, null);
  const stale = f.action('search'); assert.equal(stale.ok, false); assert.deepEqual(stale.lessons, []);
  f.api.fail(null); assert.equal(f.action('read', { automatic: true }).error, 'fresh_required');
  const synced = preferences({ project: f.base, home: f.home, action: 'sync-all' }, {}, f.api.transport); assert.equal(synced.pending, 0);
  assert.equal(f.action('search', { query: 'Updated remedy' }).lessons.length, 1);
});
test('lesson forget deletes remote and all current cache/pending/search copies, retry is idempotent after lost response', t => {
  const f = setup(t); write(f.input, sample()); f.action('write', { revision: f.action('read').revision });
  f.api.lose(); const forgotten = f.action('forget', { revision: f.action('read').revision }); assert.equal(forgotten.pending, true); assert.equal(forgotten.lesson, null);
  const entry = Object.values(records.targetIndex(f.home).targets)[0], stateFile = path.join(records.targetDirectory(entry.target, f.home), 'state.json');
  assert.equal(fs.readFileSync(stateFile, 'utf8').includes('An interrupted fetch'), false);
  const deletes = f.api.calls.filter(call => call.method === 'DELETE'); assert.equal(deletes.length, 1); const op = JSON.parse(deletes[0].body.message.split('\n\n')[1]); assert.equal(op.kind, 'forget'); assert.equal(op.record_kind, 'lesson');
  assert.equal(f.action('sync').acknowledged, true); assert.equal(f.api.calls.filter(call => call.method === 'DELETE').length, 1);
  assert.deepEqual(f.action('search').lessons, []); assert.equal(f.action('read').lesson, null);
  assert.equal(f.action('forget', { revision: f.action('read').revision }).unchanged, true);
});
test('lesson CLI local management and policy OFF validate required arguments and keep preferences independent', t => {
  const f = setup(t); write(path.join(f.project, '.harness.json'), {}); write(f.input, sample());
  const first = command(f, 'lessons', 'read', '--id', 'fetch-lock'); assert.equal(first.code, 0);
  const saved = command(f, 'lessons', 'write', '--input', f.input, '--revision', first.data.revision); assert.equal(saved.code, 0); assert.equal(saved.data.lesson.evaluation, 'unknown');
  assert.equal(command(f, 'preferences', 'read').data.content, '');
  assert.equal(command(f, 'lessons', 'write', '--input', f.input).code, 2);
  assert.equal(command(f, 'lessons', 'search', '--limit', '11').code, 2);
  write(path.join(f.project, '.harness.json'), { preferences: { enabled: false } });
  assert.equal(command(f, 'lessons', 'read', '--id', 'fetch-lock').data.skipped, 'record policy disabled');
});

test('manual lesson search remains available with autosave OFF; automatic search stays held', t => {
  const f = setup(t); write(f.input, sample()); f.action('write', { revision: f.action('read').revision });
  f.config.preferences.autosave = false;
  assert.equal(f.action('search', { query: 'interrupted' }).lessons.length, 1);
  const calls = f.api.calls.length, automatic = f.action('search', { automatic: true });
  assert.equal(automatic.skipped, 'record policy disabled');
  assert.equal(f.api.calls.length, calls);
});

test('portable lesson ID survives file-origin Git conversion and network outages with durable new drafts and later sync', t => {
  const f = fixture(t), api = server(), config = automatic(), args = { project: f.project, home: f.home }, input = path.join(f.base, 'lesson.json');
  write(path.join(f.home, '.codex/harness/settings.json'), { preferences: config.preferences });
  const registered = preferences({ ...args, action: 'register' }, config, api.transport); assert.equal(registered.ok, true);
  const current = lib.settings(f.project, f.home), key = current.preferences.project_key;
  git(f.project, 'init'); git(f.project, 'remote', 'add', 'origin', 'file:///tmp/local-repo');
  const action = (action, extra = {}) => lessons({ ...args, action, id: 'fetch-lock', input, ...extra }, current, api.transport);
  write(input, sample()); assert.equal(action('write', { revision: action('read').revision }).ok, true);
  for (const autosave of [true, false]) {
    current.preferences.autosave = autosave;
    const verified = action('read'); assert.equal(verified.ok, true);
    const updated = { ...sample(), remedy: `Durable new remedy ${autosave}` }; write(input, updated);
    api.fail('unavailable');
    const stale = action('read'); assert.equal(stale.ok, false); assert.equal(stale.error, 'unavailable'); assert.equal(stale.revision, verified.revision);
    const queued = action('write', { revision: verified.revision }); assert.equal(queued.ok, false); assert.equal(queued.pending, true); assert.equal(queued.error, 'unavailable'); assert.deepEqual(queued.lesson, updated);
    const entry = Object.values(records.targetIndex(f.home).targets).find(entry => entry.target.path.endsWith('/lessons/fetch-lock.json'));
    assert.equal(entry.target.path, `improvement/projects/${key}/lessons/fetch-lock.json`);
    const stored = JSON.parse(fs.readFileSync(path.join(records.targetDirectory(entry.target, f.home), 'state.json')));
    assert.deepEqual(JSON.parse(stored.pending.content), updated); assert.equal(stored.pending.operation.project_key, key);
    api.fail(null); assert.equal(action('sync').ok, true); assert.equal(action('read').pending, false); assert.deepEqual(action('read').lesson, updated);
  }
});
