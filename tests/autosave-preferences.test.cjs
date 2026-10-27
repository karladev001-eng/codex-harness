const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, write, init, git } = require('./helpers.cjs');
const lib = require('../dist/skill/lib.js');
const { preferences, preferenceLocation } = require('../dist/skill/preferences.js');
const records = require('../dist/skill/records.js');
const { server, explicit, automatic } = require('./records-helper.cjs');
function setup(t, config = explicit()) {
  const f = fixture(t), api = server(), args = { project: f.project, home: f.home }, input = path.join(f.base, 'input');
  write(path.join(f.project, '.harness.json'), { preferences: { ...config.preferences, autosave: true } });
  const action = (action, extra = {}) => preferences({ ...args, action, input, ...extra }, config, api.transport);
  const draft = (content, revision, extra = {}) => { write(input, content); return action('write', { revision, ...extra }); };
  return { ...f, api, args, config, input, action, draft, state: () => path.join(preferenceLocation(args, config).directory, 'state.json') };
}
test('same target shares cache, lock and pending across source paths; no-op and lost response retain operation ID', t => {
  const f = setup(t), first = f.action('read');
  f.api.fail('unavailable'); const queued = f.draft('private body', first.revision); assert.equal(queued.pending, true);
  const pending = JSON.parse(fs.readFileSync(f.state())).pending;
  const other = path.join(f.base, 'other'); fs.mkdirSync(other);
  assert.equal(preferenceLocation({ ...f.args, project: other }, f.config).directory, path.dirname(f.state()));
  assert.equal(preferences({ ...f.args, project: other, action: 'read', offline: 'true' }, f.config, f.api.transport).content, 'private body');
  f.api.fail(null); f.api.lose(); assert.equal(f.action('sync').pending, true);
  const committed = f.api.puts().at(-1).body.message.split('\n\n')[1];
  assert.equal(JSON.parse(committed).operation_id, pending.operation.operation_id);
  const puts = f.api.puts().length; assert.equal(f.action('sync').acknowledged, true);
  assert.equal(f.draft('private body', f.action('read').revision).unchanged, true); assert.equal(f.api.puts().length, puts);
  const directory = path.dirname(f.state()); fs.mkdirSync(path.join(directory, '.preferences.lock'));
  assert.throws(() => preferences({ ...f.args, project: other, action: 'read' }, f.config, f.api.transport), /locked/); fs.rmdirSync(path.join(directory, '.preferences.lock'));
});
test('old path states are validated and absorbed; differing pending stay intact and stop automatic writes', t => {
  const f = setup(t), location = preferenceLocation(f.args, f.config), target = location.target;
  const legacy = suffix => path.join(lib.codexHome(f.home), 'harness/projects', suffix.repeat(20), 'creative/github', lib.digest(JSON.stringify(target)), 'state.json');
  const one = legacy('a'), two = legacy('b');
  const old = content => ({ schema: 1, target, cache: { sha: null, content, fetched_at: '2020-01-01T00:00:00Z' }, pending: { content, base_sha: null }, migrated: false });
  write(one, old('one')); write(two, old('two'));
  assert.equal(f.action('read').error, 'legacy_pending_conflict'); assert.equal(JSON.parse(fs.readFileSync(two)).pending.content, 'two'); assert.equal(f.api.puts().length, 0);
  assert.equal(JSON.parse(fs.readFileSync(one)).schema, 2); assert.equal(JSON.parse(fs.readFileSync(f.state())).pending.content, 'one');
  assert.equal(f.action('sync-all').results[0].state, 'conflict');
});
test('legacy target mismatch cannot enter shared cache; absorbed text is retired and cannot resurrect after forget', t => {
  const f = setup(t), location = preferenceLocation(f.args, f.config);
  const oldFile = path.join(lib.localRoot(f.project, f.home), 'creative/github', lib.digest(JSON.stringify(location.target)), 'state.json');
  write(oldFile, { schema: 1, target: { ...location.target, repository: 'other/repo' }, cache: null, pending: null, migrated: false });
  assert.equal(f.action('read').content, '');
  write(oldFile, { schema: 1, target: location.target, cache: { sha: null, content: 'forgotten text', fetched_at: '2020-01-01T00:00:00Z' }, pending: { content: 'forgotten text', base_sha: null }, migrated: false });
  assert.equal(f.action('sync').ok, true);
  const changed = f.draft('', f.action('read').revision, { kind: 'forget' }); assert.equal(changed.ok, true);
  assert.equal(fs.readFileSync(oldFile, 'utf8').includes('forgotten text'), false);
  assert.equal(f.action('read').content, '');
});
test('sync-all only registered pending: independent attempts, safe summary, OFF/missing source hold and busy is not success', t => {
  const f = setup(t), first = f.action('read'); f.api.fail('unavailable'); f.draft('NEVER-IN-SUMMARY', first.revision);
  const other = path.join(f.base, 'second'); fs.mkdirSync(other); const config = explicit(); config.preferences.project_key = 'second'; write(path.join(other, '.harness.json'), { preferences: { ...config.preferences, autosave: true } });
  f.api.fail(null); const read = preferences({ project: other, home: f.home, action: 'read' }, config, f.api.transport);
  write(f.input, 'second body'); preferences({ project: other, home: f.home, action: 'write', input: f.input, revision: read.revision, offline: 'true' }, config, f.api.transport);
  const transport = (method, endpoint, body) => { if (endpoint.includes('/stable/')) throw new records.RemoteError('authentication'); return f.api.transport(method, endpoint, body); };
  const result = preferences({ project: f.base, home: f.home, action: 'sync-all' }, {}, transport);
  assert.equal(result.pending, 1); assert.equal(result.failed, 1); assert.deepEqual(result.results.map(x => x.state).sort(), ['pending', 'sent']); assert.equal(JSON.stringify(result).includes('body'), false); assert.equal(JSON.stringify(result).includes('NEVER'), false); assert.equal(JSON.stringify(result).includes(f.project), false);
  write(path.join(f.project, '.harness.json'), { preferences: { ...f.config.preferences, enabled: false } });
  const calls = f.api.calls.length; assert.equal(f.action('sync-all').results[0].reason, 'policy_disabled'); assert.equal(f.api.calls.length, calls);
  fs.rmSync(f.project, { recursive: true }); assert.equal(f.action('sync-all').results[0].reason, 'source_unavailable');
  fs.mkdirSync(f.project); write(path.join(f.project, '.harness.json'), { preferences: { ...f.config.preferences, autosave: true } });
  fs.mkdirSync(path.join(path.dirname(f.state()), '.preferences.lock')); const busy = f.action('sync-all'); assert.equal(busy.results[0].state, 'busy'); assert.equal(busy.ok, false); fs.rmdirSync(path.join(path.dirname(f.state()), '.preferences.lock'));
  assert.equal(f.action('sync-all').pending, 0);
});
test('registry outage after a verified first read preserves auto draft; later sync-all registers then delivers', t => {
  const f = setup(t, automatic()); init(f); git(f.project, 'remote', 'add', 'origin', 'git@github.com:org/new.git');
  const read = f.action('read'); f.api.fail('unavailable'); const queued = f.draft('retained auto body', read.revision);
  assert.equal(queued.pending, true); assert.equal(queued.ok, false);
  f.api.fail(null); const result = f.action('sync-all'); assert.equal(result.pending, 0); assert.equal(result.results[0].state, 'sent');
  assert.equal(f.api.files.has('improvement/projects.json'), true);
});
test('migration preserves original record bytes/dates/unknown and structured metadata separates migration/correction/forget', t => {
  const f = setup(t), legacy = preferenceLocation(f.args, f.config).legacy_file;
  const original = '# record\r\n| stable-observation | 2020-02-01 | unknown |\r\n'; write(legacy, original);
  assert.equal(f.action('migrate').ok, true); assert.equal(fs.readFileSync(legacy, 'utf8'), original);
  assert.equal(f.action('read').content, original); f.draft('corrected', f.action('read').revision, { kind: 'correction' }); f.draft('', f.action('read').revision, { kind: 'forget' });
  const operations = f.api.puts().map(call => JSON.parse(call.body.message.split('\n\n')[1]));
  assert.deepEqual(operations.map(x => x.kind), ['migrate', 'correction', 'forget']); assert.equal(new Set(operations.map(x => x.operation_id)).size, 3);
  for (const op of operations) { assert.equal(op.project_key, 'stable'); assert.equal(op.schema_version, 1); assert.equal(Number.isFinite(Date.parse(op.recorded_at)), true); }
  assert.equal([...f.api.files.keys()].some(key => key.includes('journal')), false);
});

test('explicit autosave OFF holds automatic operations and sync-all, while manual explicit-key management works', t => {
  const f = setup(t), first = f.action('read');
  f.draft('queued for later', first.revision, { offline: 'true' });
  write(path.join(f.project, '.harness.json'), { preferences: { ...f.config.preferences, autosave: false } });
  const before = fs.readFileSync(f.state(), 'utf8'), calls = f.api.calls.length;
  const automatic = f.action('write', { automatic: true, input: '/missing', revision: 'bad' }); assert.equal(automatic.skipped, 'autosave disabled');
  const held = f.action('sync-all'); assert.equal(held.pending, 1); assert.equal(held.results[0].state, 'skipped'); assert.equal(held.results[0].reason, 'policy_disabled');
  assert.equal(f.api.calls.length, calls); assert.equal(fs.readFileSync(f.state(), 'utf8'), before);
  assert.equal(f.action('sync').ok, true);
  assert.equal(f.draft('manual update', f.action('read').revision).ok, true);
});

test('project autosave OFF overrides personal opt-in without a key, keeps unresolved GitHub identity and creates no local canonical file', t => {
  const f = fixture(t), config = automatic(), api = server();
  write(path.join(f.home, '.codex/harness/settings.json'), { preferences: config.preferences });
  write(path.join(f.project, '.harness.json'), { preferences: { autosave: false } });
  const current = lib.settings(f.project, f.home); assert.equal(current.preferences.autosave, false); assert.equal(current.preferences.repository, config.preferences.repository);
  const before = require('./helpers.cjs').tree(f.base), status = require('./helpers.cjs').command(f, 'status');
  assert.equal(status.code, 0); assert.equal(status.data.preferences.backend, 'github'); assert.equal(status.data.preferences.identity.resolved, false); assert.equal(status.data.preferences.target, null);
  const args = { project: f.project, home: f.home };
  assert.equal(preferences({ ...args, action: 'read' }, current, api.transport).error, 'identity_unresolved');
  assert.equal(preferences({ ...args, action: 'read', automatic: true }, current, api.transport).skipped, 'autosave disabled');
  assert.equal(api.calls.length, 0); assert.deepEqual(require('./helpers.cjs').tree(f.base), before);
});
