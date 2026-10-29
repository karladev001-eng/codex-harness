const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, write, init, git, tree, command } = require('./helpers.cjs');
const lib = require('../dist/skill/lib.js');
const { normalizeOrigin, projectIdentity, resolveIdentity } = require('../dist/skill/identity.js');
const { preferences, preferenceLocation } = require('../dist/skill/preferences.js');
const { server, automatic } = require('./records-helper.cjs');

test('origin identity strips authentication and unifies GitHub SSH/HTTPS without merging forks or unknown host case', () => {
  const same = ['https://token-secret@GitHub.com/Owner/Repo.git', 'git@github.com:owner/repo', 'ssh://git@github.com:22/OWNER/REPO.git/', 'https://github.com/owner/repo'];
  assert.equal(new Set(same.map(normalizeOrigin)).size, 1);
  assert.notEqual(normalizeOrigin('git@github.com:owner/repo'), normalizeOrigin('git@github.com:fork/repo'));
  assert.notEqual(normalizeOrigin('ssh://git@example.test/Owner/Repo.git'), normalizeOrigin('ssh://git@example.test/owner/repo.git'));
  for (const bad of ['/path/to/local', 'https://github.com/owner/repo?secret=x', 'file:///local', 'https://github.com/a/%2e%2e']) assert.throws(() => normalizeOrigin(bad), /Unsupported/);
});
test('read-only unresolved status; first record registry resolves across path, origin spellings and isolated PC home', t => {
  const f = fixture(t), config = automatic(), api = server(); init(f); git(f.project, 'remote', 'add', 'origin', 'git@github.com:Org/Project.git');
  write(path.join(f.home, '.codex/harness/settings.json'), { preferences: config.preferences });
  const before = tree(f.base), status = command(f, 'status');
  assert.equal(status.data.preferences.backend, 'github'); assert.equal(status.data.preferences.identity.resolved, false); assert.equal(status.data.preferences.target, null); assert.deepEqual(tree(f.base), before);
  const args = { project: f.project, home: f.home };
  const first = preferences({ ...args, action: 'read' }, config, api.transport);
  assert.equal(first.identity.resolved, false); assert.equal(api.puts().length, 0);
  const input = path.join(f.base, 'input.md'); write(input, 'existing ID | 2023-01-01 | unknown');
  assert.equal(preferences({ ...args, action: 'write', input, revision: first.revision }, config, api.transport).ok, true);
  const registry = JSON.parse(api.files.get('improvement/projects.json').content), key = registry.projects[0].project_key;
  const other = path.join(f.base, 'other checkout'); fs.mkdirSync(other); git(other, 'init'); git(other, 'remote', 'add', 'origin', 'https://github.com/org/project');
  const second = preferences({ project: other, home: path.join(f.base, 'another PC'), action: 'read' }, config, api.transport);
  assert.equal(second.identity.project_key, key); assert.equal(second.content, 'existing ID | 2023-01-01 | unknown');
  assert.equal(preferences({ project: other, home: f.home, action: 'read' }, config, api.transport).target.path, first.target.path);
  const fork = path.join(f.base, 'fork'); fs.mkdirSync(fork); git(fork, 'init'); git(fork, 'remote', 'add', 'origin', 'https://github.com/else/project');
  assert.notEqual(resolveIdentity({ project: fork, home: f.home }, config, api.transport, false).project_key, key);
});
test('worktrees inherit common project policy and a local override wins', t => {
  const f = fixture(t); init(f); write(path.join(f.project, '.harness.json'), { preferences: { repository: 'o/kb', project_key: 'preserved' }, review: false });
  const other = path.join(f.base, 'linked'); git(f.project, 'worktree', 'add', '--detach', other);
  assert.equal(lib.settings(other, f.home).preferences.project_key, 'preserved'); assert.equal(lib.settings(other, f.home).review, false);
  write(path.join(other, '.harness.json'), { preferences: { project_key: 'override' }, review: true });
  assert.equal(lib.settings(other, f.home).preferences.project_key, 'override'); assert.equal(lib.settings(other, f.home).review, true);
});
test('non-Git registration persists portable key before registry, explicit identity survives later Git conversion', async t => {
  const f = fixture(t), config = automatic(), api = server(), args = { project: f.project, home: f.home };
  write(path.join(f.home, '.codex/harness/settings.json'), { preferences: config.preferences });
  assert.equal(preferences({ ...args, action: 'read' }, config, api.transport).error, 'identity_unresolved');
  const registered = preferences({ ...args, action: 'register' }, config, api.transport); assert.equal(registered.ok, true);
  const policy = JSON.parse(fs.readFileSync(path.join(f.project, '.harness.json'))); assert.equal(policy.preferences.project_key, registered.identity.project_key);
  // Node 22's native fs.cpSync path check aborts the process on Windows for this non-ASCII source path; fs.promises.cp does not use it.
  const moved = path.join(f.base, 'moved'); await fs.promises.cp(f.project, moved, { recursive: true });
  const resolved = lib.settings(moved, f.home); resolved.preferences.repository = config.preferences.repository; resolved.preferences.autosave = true;
  assert.equal(preferences({ project: moved, home: f.home, action: 'register' }, resolved, api.transport).identity.project_key, registered.identity.project_key);
  // After Git conversion an explicit key is authoritative; conflicting identity is stopped, never assigned a new key.
  git(moved, 'init'); git(moved, 'remote', 'add', 'origin', 'https://github.com/new/repo');
  assert.equal(preferenceLocation({ project: moved, home: f.home }, resolved).target.path.includes(registered.identity.project_key), true);
  assert.equal(preferences({ project: moved, home: f.home, action: 'register' }, resolved, api.transport).identity.project_key, registered.identity.project_key);
});
test('registry CAS retry preserves other projects, keeps explicit harness key, and detects identity/key collisions', t => {
  const f = fixture(t), config = automatic(), api = server(); init(f); git(f.project, 'remote', 'add', 'origin', 'git@github.com:org/harness.git'); config.preferences.project_key = 'harness';
  let raced = false;
  const transport = (method, endpoint, body) => {
    if (!raced && method === 'PUT' && endpoint.endsWith('/improvement/projects.json')) {
      raced = true; api.set('improvement/projects.json', JSON.stringify({ schema_version: 1, projects: [{ identity: 'git:github.com/other/project', project_key: 'other' }] }));
    }
    return api.transport(method, endpoint, body);
  };
  const registered = preferences({ project: f.project, home: f.home, action: 'register' }, config, transport);
  assert.equal(registered.ok, true); assert.equal(registered.identity.project_key, 'harness');
  const registry = JSON.parse(api.files.get('improvement/projects.json').content); assert.equal(registry.projects.length, 2); assert.equal(registry.projects[0].project_key, 'other');
  config.preferences.project_key = 'collision';
  assert.equal(preferences({ project: f.project, home: f.home, action: 'register' }, config, api.transport).error, 'registry_conflict');
  api.set('improvement/projects.json', JSON.stringify({ schema_version: 1, projects: [{ identity: 'git:github.com/other/project', project_key: 'harness' }] })); config.preferences.project_key = 'harness';
  assert.equal(preferences({ project: f.project, home: f.home, action: 'register' }, config, api.transport).error, 'registry_conflict');
});

test('portable explicit ID remains readable after Git conversion with unsupported file origin', t => {
  const f = fixture(t), config = automatic(), api = server(), args = { project: f.project, home: f.home };
  write(path.join(f.home, '.codex/harness/settings.json'), { preferences: config.preferences });
  const registered = preferences({ ...args, action: 'register' }, config, api.transport);
  const key = registered.identity.project_key;
  git(f.project, 'init'); git(f.project, 'remote', 'add', 'origin', 'file:///tmp/local-repo');
  const current = lib.settings(f.project, f.home);
  const before = tree(f.base), status = command(f, 'status');
  assert.equal(status.code, 0); assert.equal(status.data.preferences.target.path, `improvement/projects/${key}/preferences.md`); assert.deepEqual(tree(f.base), before);
  const puts = api.puts().length, read = preferences({ ...args, action: 'read' }, current, api.transport);
  assert.equal(read.ok, true); assert.equal(read.identity.project_key, key); assert.equal(read.identity.identity, 'id:' + key); assert.equal(api.puts().length, puts);
  const input = path.join(f.base, 'record.md'); write(input, 'portable record');
  assert.equal(preferences({ ...args, action: 'write', input, revision: read.revision }, current, api.transport).ok, true);
  api.fail('unavailable'); assert.equal(preferences({ ...args, action: 'read' }, current, api.transport).error, 'unavailable');
});

test('separate Git metadata inherits the main checkout settings in linked worktrees, with local override', t => {
  const f = fixture(t), metadata = path.join(f.base, 'metadata');
  git(f.project, 'init', '--separate-git-dir', metadata);
  git(f.project, 'config', 'user.name', 'Test'); git(f.project, 'config', 'user.email', 'test@example.invalid');
  write(path.join(f.project, 'file'), 'initial'); git(f.project, 'add', 'file'); git(f.project, 'commit', '-m', 'initial');
  write(path.join(f.project, '.harness.json'), { review: false, preferences: { repository: 'owner/kb', project_key: 'stable' } });
  // Windows file names cannot contain a newline, so the checkout there uses a plain name.
  const linked = path.join(f.base, process.platform === 'win32' ? 'linked checkout' : 'linked checkout\nwith newline'); git(f.project, 'worktree', 'add', '--detach', linked);
  assert.throws(() => lib.settings(linked, f.home), /Common project settings unresolved.*core.worktree/);
  const unresolved = command({ ...f, project: linked }, 'status'); assert.equal(unresolved.code, 2); assert.match(unresolved.error, /Common project settings unresolved/);
  git(f.project, 'config', 'core.worktree', f.project);
  assert.equal(lib.settings(linked, f.home).preferences.project_key, 'stable'); assert.equal(lib.settings(linked, f.home).review, false);
  write(path.join(linked, '.harness.json'), { review: true, preferences: { project_key: 'local' } });
  assert.equal(lib.settings(linked, f.home).preferences.project_key, 'local'); assert.equal(lib.settings(linked, f.home).review, true);
});
