const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fixture, write, command, tree, run } = require('./helpers.cjs');
const lib = require('../dist/skill/lib.js');
const { preferences, preferenceLocation, RemoteError, github } = require('../dist/skill/preferences.js');
function setup(t) {
  const f = fixture(t), config = structuredClone(lib.DEFAULTS);
  config.preferences = { repository: 'owner/private-memory', branch: 'main', project_key: 'shared' };
  const input = path.join(f.base, 'input.md');
  const args = { project: f.project, home: f.home };
  const calls = [], server = { content: null, sha: null, private: true, failure: null, lose: false, conflict: false };
  const hash = text => crypto.createHash('sha1').update(text).digest('hex');
  const transport = (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (server.failure) throw new RemoteError(server.failure);
    if (/\/branches\//.test(endpoint)) return { name: 'main' };
    if (!endpoint.includes('/contents/')) return { private: server.private };
    if (method === 'GET') {
      if (server.sha === null) throw new RemoteError('not_found_or_inaccessible');
      return { type: 'file', encoding: 'base64', sha: server.sha, content: Buffer.from(server.content).toString('base64') };
    }
    if (server.conflict || (body.sha || null) !== server.sha) throw new RemoteError('conflict');
    server.content = Buffer.from(body.content, 'base64').toString(); server.sha = hash(server.content);
    if (server.lose) { server.lose = false; throw new RemoteError('unavailable'); }
    return { content: { sha: server.sha } };
  };
  const action = (action, options = {}) => preferences({ ...args, action, input, ...options }, config, transport);
  const draft = (content, revision, options = {}) => { write(input, content); return action('write', { revision, ...options }); };
  const stateFile = () => path.join(preferenceLocation(args, config).directory, 'state.json');
  return { ...f, args, config, input, calls, server, transport, action, draft, hash, stateFile };
}
test('GitHub read, SHA conditional write, destination isolation and local CAS', t => {
  const f = setup(t); const first = f.action('read');
  assert.equal(first.content, ''); assert.equal(first.sha, null); assert.equal(first.freshness, 'fresh');
  assert.equal(f.draft('observations', first.revision).ok, true);
  assert.equal(f.calls.find(call => call.method === 'PUT').body.sha, undefined);
  const next = f.action('read');
  const updated = f.draft('guidelines', next.revision); assert.equal(updated.ok, true);
  assert.equal(f.calls.filter(call => call.method === 'PUT')[1].body.sha, next.sha);
  assert.throws(() => f.draft('stale', next.revision), /conflict/);
  const firstPath = f.stateFile(); f.config.preferences.project_key = 'other';
  assert.notEqual(firstPath, f.stateFile()); f.server.failure = 'unavailable';
  assert.equal(f.action('read').content, null); assert.equal(f.action('read').ok, false);
});
test('first fetch failures do not fabricate an empty canonical document; cache fallback is stale', t => {
  const f = setup(t);
  for (const failure of ['authentication', 'forbidden', 'not_found_or_inaccessible', 'unavailable']) {
    f.server.failure = failure; const value = f.action('read');
    assert.equal(value.ok, false); assert.equal(value.content, null); assert.equal(value.revision, null); assert.equal(value.error, failure);
    assert.throws(() => f.draft('unsafe', 'revision'), /no cache/);
  }
  f.server.failure = null; const initial = f.action('read'); f.draft('known', initial.revision);
  f.server.failure = 'unavailable'; const cached = f.action('read');
  assert.equal(cached.content, 'known'); assert.equal(cached.freshness, 'stale'); assert.equal(cached.ok, false);
});
test('private repository and valid branch are required before contents access', t => {
  const f = setup(t); f.server.private = false;
  assert.equal(f.action('read').error, 'private_repository_required');
  assert.equal(f.calls.some(call => call.endpoint.includes('/contents/')), false);
  f.server.private = true;
  const badBranch = (method, endpoint) => { if (endpoint.includes('/branches/')) throw new RemoteError('not_found_or_inaccessible'); return { private: true }; };
  assert.equal(preferences({ ...f.args, action: 'read' }, f.config, badBranch).content, null);
});
test('offline edits are durable, unsent, and replace both cache and pending forgotten text', t => {
  const f = setup(t); const first = f.action('read'); f.draft('forget this evidence', first.revision);
  let before = f.action('read'); const count = f.calls.length;
  const queued = f.draft('remaining evidence', before.revision, { offline: 'true' });
  assert.equal(queued.pending, true); assert.equal(queued.ok, false); assert.equal(f.calls.length, count);
  assert.equal(fs.readFileSync(f.stateFile(), 'utf8').includes('forget this evidence'), false);
  before = f.action('read', { offline: 'true' }); assert.equal(before.content, 'remaining evidence');
  assert.equal(f.calls.length, count); assert.equal(before.freshness, 'cached');
  assert.equal(f.action('sync').ok, true); assert.equal(f.server.content, 'remaining evidence');
  assert.equal(f.action('read', { offline: 'true' }).pending, false);
});
test('two PCs and sessions preserve conflicts; explicit observed remote SHA enables reconciliation', t => {
  const f = setup(t); let first = f.action('read'); f.draft('base', first.revision); first = f.action('read');
  f.draft('PC A', first.revision, { offline: 'true' });
  f.server.content = 'PC B'; f.server.sha = f.hash(f.server.content);
  const conflict = f.action('sync'); assert.equal(conflict.error, 'conflict'); assert.equal(f.server.content, 'PC B');
  assert.equal(conflict.pending, true); assert.equal(conflict.remote_content, 'PC B');
  const read = f.action('read'); assert.equal(read.error, 'conflict'); assert.equal(read.content, 'PC A');
  assert.equal(f.draft('merged A and B', read.revision, { base_sha: read.remote_sha }).ok, true);
  assert.equal(f.server.content, 'merged A and B');
});
test('PUT racing conflict and lost response retry never overwrite or duplicate', t => {
  const f = setup(t); const first = f.action('read'); f.server.conflict = true;
  const conflict = f.draft('draft', first.revision); assert.equal(conflict.error, 'conflict'); assert.equal(conflict.pending, true);
  f.server.conflict = false; f.server.lose = true;
  const failed = f.action('sync'); assert.equal(failed.ok, false); assert.equal(failed.pending, true);
  const puts = f.calls.filter(call => call.method === 'PUT').length;
  const retried = f.action('sync'); assert.equal(retried.acknowledged, true); assert.equal(retried.pending, false);
  assert.equal(f.calls.filter(call => call.method === 'PUT').length, puts);
});
test('migration is explicit, preserves source, refuses different remote and cannot reimport old source', t => {
  const f = setup(t), legacy = preferenceLocation(f.args, f.config).legacy_file;
  write(legacy, 'old evidence'); f.action('read'); assert.equal(f.server.content, null);
  assert.equal(f.action('migrate').ok, true); assert.equal(fs.readFileSync(legacy, 'utf8'), 'old evidence');
  const read = f.action('read'); f.draft('corrected', read.revision);
  assert.equal(f.action('migrate').error, 'already_migrated'); assert.equal(f.server.content, 'corrected');
  f.config.preferences.project_key = 'other';
  assert.equal(f.action('migrate').error, 'legacy_retired'); assert.equal(f.server.content, 'corrected');
  const fresh = setup(t), original = preferenceLocation(fresh.args, fresh.config).legacy_file;
  write(original, 'local source'); fresh.server.content = 'different remote'; fresh.server.sha = fresh.hash(fresh.server.content);
  assert.equal(fresh.action('migrate').error, 'migration_conflict');
  assert.equal(fs.readFileSync(original, 'utf8'), 'local source'); assert.equal(fresh.server.content, 'different remote');
  assert.equal(fs.existsSync(preferenceLocation(fresh.args, fresh.config).retirement_file), false);
});
test('migration marker survives failed send and sync can finish without source replay', t => {
  const f = setup(t), legacy = preferenceLocation(f.args, f.config).legacy_file;
  write(legacy, 'migrate'); f.server.conflict = true;
  assert.equal(f.action('migrate').pending, true); assert.equal(f.action('migrate').error, 'already_migrated');
  f.server.conflict = false; assert.equal(f.action('sync').ok, true);
});
test('persistence OFF prevents any preference files or transport; loop and measurement are independent', t => {
  const f = setup(t); f.config.persistence = false;
  const before = tree(f.base); const prohibited = () => { throw new Error('network must not run'); };
  for (const action of ['read', 'write', 'sync', 'migrate']) {
    assert.equal(preferences({ ...f.args, action, input: 'missing', revision: 'bad' }, f.config, prohibited).skipped, 'persistence disabled');
  }
  assert.deepEqual(tree(f.base), before); f.config.persistence = true; f.config.improvement_loop = false; f.config.measurement = false;
  assert.equal(f.action('read').ok, true); assert.equal(f.draft('explicit management', f.action('read').revision).ok, true);
});
test('local fallback supports revisions, atomic updates, lock/corruption/symlink protection', t => {
  const f = setup(t); f.config.preferences = { repository: '', branch: 'main', project_key: '' };
  const read = f.action('read'); assert.equal(read.backend, 'local'); assert.equal(read.content, '');
  const result = f.draft('local', read.revision); assert.equal(result.ok, true);
  assert.throws(() => f.draft('stale', read.revision), /conflict/);
  const location = preferenceLocation(f.args, f.config); fs.mkdirSync(path.join(location.directory, '.preferences.lock'));
  assert.throws(() => f.action('read'), /locked/); assert.equal(fs.readFileSync(location.file, 'utf8'), 'local');
  fs.rmdirSync(path.join(location.directory, '.preferences.lock'));
  f.config.preferences = { repository: 'owner/private-memory', branch: 'main', project_key: 'shared' };
  write(f.stateFile(), { schema: 1 }); assert.throws(() => f.action('read'), /Corrupt/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.stateFile())), { schema: 1 });
});
test('CLI management, invalid configuration, status read-only and disabled flags', t => {
  const f = setup(t); const configPath = path.join(f.project, '.harness.json');
  write(configPath, { preferences: f.config.preferences });
  const before = tree(f.base), status = command(f, 'status'); assert.equal(status.data.preferences.backend, 'github'); assert.deepEqual(tree(f.base), before);
  const noCache = command(f, 'preferences', 'read', '--offline', 'true'); assert.equal(noCache.code, 2); assert.equal(noCache.data.error, 'no_cache');
  write(configPath, { persistence: false, preferences: f.config.preferences });
  assert.equal(command(f, 'preferences', 'write', '--input', 'missing', '--revision', 'bad').data.skipped, 'persistence disabled');
  for (const value of [{ repository: 'owner/repo', branch: '' }, { project_key: '../bad' }, { repository: 'https://other/repo', project_key: 'p' }, { repository: 'o/r', project_key: 'p', branch: '' }]) {
    write(configPath, { preferences: value }); assert.equal(command(f, 'status').code, 2);
  }
  for (const args of [['preferences'], ['preferences', 'write', '--input', 'x'], ['preferences', 'read', '--offline', 'yes']]) assert.equal(command(f, ...args).code, 2);
});
test('gh transport fixes hostname and uses stdin JSON without shell or sensitive errors', { skip: process.platform === 'win32' }, t => {
  const f = setup(t), bin = path.join(f.base, 'bin'), log = path.join(f.base, 'request.json');
  fs.mkdirSync(bin); const executable = path.join(bin, 'gh');
  write(executable, '#!' + process.execPath + '\nconst fs=require("node:fs"); fs.writeFileSync(process.env.MOCK_GH_LOG,JSON.stringify({args:process.argv.slice(2),input:fs.readFileSync(0,"utf8")})); console.log(JSON.stringify({private:true}));'); fs.chmodSync(executable, 0o755);
  const child = run(['preferences', 'read', '--project', f.project, '--home', f.home], { env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, GH_HOST: 'example.invalid', MOCK_GH_LOG: log } });
  // Local backend does not invoke gh; the production transport itself is isolated below.
  assert.equal(child.code, 0); assert.equal(fs.existsSync(log), false);
  const oldPath = process.env.PATH, oldLog = process.env.MOCK_GH_LOG;
  process.env.PATH = bin + path.delimiter + oldPath; process.env.MOCK_GH_LOG = log;
  try { assert.deepEqual(github('PUT', 'repos/o/r/contents/file', { branch: 'main', content: 'data' }), { private: true }); }
  finally { process.env.PATH = oldPath; if (oldLog === undefined) delete process.env.MOCK_GH_LOG; else process.env.MOCK_GH_LOG = oldLog; }
  const request = JSON.parse(fs.readFileSync(log)); assert.deepEqual(request.args.slice(0, 5), ['api', '--hostname', 'github.com', '--method', 'PUT']);
  assert.deepEqual(JSON.parse(request.input), { branch: 'main', content: 'data' }); assert.deepEqual(request.args.slice(-2), ['--input', '-']);
});
test('independent PC cache revisions cannot overwrite each other', t => {
  const f = setup(t), second = { ...f.args, home: path.join(f.base, 'second PC') };
  const transport = (method, endpoint, body) => {
    if (endpoint.includes('/branches/')) return { name: 'main' };
    if (!endpoint.includes('/contents/')) return { private: true };
    if (method === 'GET') {
      if (!f.server.sha) throw new RemoteError('not_found_or_inaccessible');
      return { type: 'file', encoding: 'base64', sha: f.server.sha, content: Buffer.from(f.server.content).toString('base64') };
    }
    assert.equal(body.sha || null, f.server.sha);
    f.server.content = Buffer.from(body.content, 'base64').toString(); f.server.sha = f.hash(f.server.content);
    return { content: { sha: f.server.sha } };
  };
  const a = preferences({ ...f.args, action: 'read' }, f.config, transport);
  const b = preferences({ ...second, action: 'read' }, f.config, transport);
  write(f.input, 'first PC'); assert.equal(preferences({ ...f.args, action: 'write', input: f.input, revision: a.revision }, f.config, transport).ok, true);
  write(f.input, 'second PC'); const conflicting = preferences({ ...second, action: 'write', input: f.input, revision: b.revision }, f.config, transport);
  assert.equal(conflicting.error, 'conflict'); assert.equal(f.server.content, 'first PC'); assert.equal(conflicting.pending, true);
});
test('failed local acknowledgement retains durable pending after successful remote PUT', t => {
  const f = setup(t), first = f.action('read'), rename = fs.renameSync; let writes = 0;
  fs.renameSync = (...args) => { if (args[1] === f.stateFile() && ++writes === 2) throw new Error('simulated disk failure'); return rename(...args); };
  let failed;
  try { failed = f.draft('retained pending', first.revision); } finally { fs.renameSync = rename; }
  assert.equal(failed.ok, false); assert.equal(failed.pending, true);
  assert.equal(f.server.content, 'retained pending'); assert.equal(JSON.parse(fs.readFileSync(f.stateFile())).pending.content, 'retained pending');
  assert.deepEqual(fs.readdirSync(path.dirname(f.stateFile())), ['state.json']);
  assert.equal(f.action('sync').acknowledged, true);
});
test('UTF-8 Unicode roundtrips and malformed remote content fails without replacing cache', t => {
  const f = setup(t), first = f.action('read');
  const unicode = '# 好み 🎨\n結論から書く。\n'; assert.equal(f.draft(unicode, first.revision).content, unicode);
  const malformed = (method, endpoint) => endpoint.includes('/branches/') ? { name: 'main' } : endpoint.includes('/contents/') ?
    { type: 'file', encoding: 'base64', sha: f.server.sha, content: '%%%' } : { private: true };
  const before = fs.readFileSync(f.stateFile(), 'utf8');
  const result = preferences({ ...f.args, action: 'read' }, f.config, malformed);
  assert.equal(result.error, 'invalid_response'); assert.equal(result.content, unicode); assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(f.stateFile(), 'utf8'), before);
  fs.writeFileSync(f.input, Buffer.from([0xff, 0xfe])); assert.throws(() => f.action('write', { revision: first.revision }), /conflict/);
  assert.throws(() => f.action('write', { revision: f.action('read').revision }), /UTF-8/);
  const empty = setup(t); assert.equal(empty.action('sync', { offline: 'true' }).error, 'no_cache');
});

test('retirement blocks legacy resurrection after configuration removal without altering source', t => {
  const f = setup(t), location = preferenceLocation(f.args, f.config);
  write(location.legacy_file, 'forgotten legacy evidence');
  assert.equal(f.action('migrate').ok, true);
  const read = f.action('read'); assert.equal(f.draft('remaining evidence', read.revision).ok, true);
  const marker = fs.readFileSync(location.retirement_file, 'utf8');
  assert.equal(marker.includes('forgotten legacy evidence'), false);
  assert.equal(JSON.parse(marker).retired, true);
  assert.equal(fs.readFileSync(location.legacy_file, 'utf8'), 'forgotten legacy evidence');
  f.config.preferences = { repository: '', branch: 'main', project_key: '' };
  for (const action of ['read', 'write', 'sync']) assert.throws(() => f.action(action), /retired.*restore the GitHub/i);
  assert.equal(fs.readFileSync(location.legacy_file, 'utf8'), 'forgotten legacy evidence');
  write(path.join(f.project, '.harness.json'), { preferences: f.config.preferences });
  const before = tree(f.base); assert.equal(command(f, 'status').code, 0); assert.deepEqual(tree(f.base), before);
  assert.equal(command(f, 'preferences', 'read').code, 2);
});
test('migration draft save failure reports only persisted state for absent and existing cache', t => {
  for (const existing of [false, true]) {
    const f = setup(t), location = preferenceLocation(f.args, f.config);
    write(location.legacy_file, 'migration source'); if (existing) f.action('read');
    const before = existing ? fs.readFileSync(f.stateFile(), 'utf8') : null;
    const rename = fs.renameSync;
    fs.renameSync = (...args) => { if (args[1] === f.stateFile()) throw new Error('draft rename failed'); return rename(...args); };
    let failed;
    try { failed = f.action('migrate'); } finally { fs.renameSync = rename; }
    assert.equal(failed.ok, false); assert.equal(failed.pending, false);
    assert.equal(failed.content, existing ? '' : null);
    assert.equal(fs.existsSync(location.retirement_file), false);
    assert.equal(f.calls.some(call => call.method === 'PUT'), false);
    if (existing) assert.equal(fs.readFileSync(f.stateFile(), 'utf8'), before);
    else assert.equal(fs.existsSync(f.stateFile()), false);
    assert.equal(f.action('sync').pending, false); assert.equal(f.server.content, null);
    assert.equal(f.action('migrate').ok, true); assert.equal(f.server.content, 'migration source');
  }
});
test('retirement save failure keeps real pending and blocks sync transport until retirement persists', t => {
  const f = setup(t), location = preferenceLocation(f.args, f.config);
  write(location.legacy_file, 'migration source'); const rename = fs.renameSync;
  fs.renameSync = (...args) => { if (args[1] === location.retirement_file) throw new Error('retirement rename failed'); return rename(...args); };
  let failed;
  try {
    failed = f.action('migrate'); assert.equal(failed.ok, false); assert.equal(failed.pending, true);
    assert.equal(JSON.parse(fs.readFileSync(f.stateFile())).migrated, true);
    assert.equal(JSON.parse(fs.readFileSync(f.stateFile())).pending.content, 'migration source');
    const calls = f.calls.length, synced = f.action('sync');
    assert.equal(synced.ok, false); assert.equal(synced.pending, true); assert.equal(f.calls.length, calls);
    assert.equal(f.server.content, null); assert.equal(fs.existsSync(location.retirement_file), false);
  } finally { fs.renameSync = rename; }
  assert.equal(f.action('sync').ok, true); assert.equal(f.server.content, 'migration source');
  assert.equal(fs.existsSync(location.retirement_file), true);
  f.config.preferences = { repository: '', branch: 'main', project_key: '' };
  assert.throws(() => f.action('read'), /retired/);
});
test('retirement marker is saved before PUT even when remote delivery fails', t => {
  const f = setup(t), location = preferenceLocation(f.args, f.config);
  write(location.legacy_file, 'source'); f.server.conflict = true;
  const checked = (method, endpoint, body) => {
    if (method === 'PUT') assert.equal(JSON.parse(fs.readFileSync(location.retirement_file)).retired, true);
    return f.transport(method, endpoint, body);
  };
  assert.equal(preferences({ ...f.args, action: 'migrate' }, f.config, checked).pending, true);
  assert.equal(JSON.parse(fs.readFileSync(location.retirement_file)).retired, true);
  f.config.preferences = { repository: '', branch: 'main', project_key: '' };
  assert.throws(() => f.action('read'), /retired/);
  assert.equal(fs.readFileSync(location.legacy_file, 'utf8'), 'source');
});

test('existing retirement marker flush opens with write access and preserves bytes', t => {
  const f = setup(t), location = preferenceLocation(f.args, f.config);
  write(location.legacy_file, 'source');
  const open = fs.openSync, flush = fs.fsyncSync, close = fs.closeSync;
  const markerDescriptors = new Map(), flags = [];
  fs.openSync = (...args) => {
    const fd = open(...args);
    if (args[0] === location.retirement_file) { markerDescriptors.set(fd, args[1]); flags.push(args[1]); }
    return fd;
  };
  fs.fsyncSync = fd => {
    if (markerDescriptors.get(fd) === 'r') throw new Error('simulated Windows FlushFileBuffers needs write access');
    return flush(fd);
  };
  fs.closeSync = fd => { markerDescriptors.delete(fd); return close(fd); };
  try {
    // migrate creates the marker, then sync immediately reopens it to ensure durability.
    assert.equal(f.action('migrate').ok, true);
    const before = fs.readFileSync(location.retirement_file, 'utf8');
    assert.equal(f.action('sync').ok, true);
    assert.equal(fs.readFileSync(location.retirement_file, 'utf8'), before);
    assert.deepEqual(flags, ['r+', 'r+']);
    assert.equal(JSON.parse(before).retired, true);
  } finally { fs.openSync = open; fs.fsyncSync = flush; fs.closeSync = close; }
});
