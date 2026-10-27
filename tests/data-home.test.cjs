const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../dist/skill/lib.js');
const { fixture, write, command, run, tree } = require('./helpers.cjs');

test('fresh homes use the shared store; status stays read-only', t => {
  const f = fixture(t), shared = path.join(f.home, '.agents/harness');
  const status = command(f, 'status');
  assert.equal(status.code, 0); assert.equal(status.data.data_home, lib.sharedHome(f.home));
  assert.equal(fs.existsSync(shared), false);
  assert.deepEqual(run(['data', 'migrate', '--home', f.home]).data, { status: 'nothing_to_migrate', data_home: lib.sharedHome(f.home) });
  assert.equal(fs.existsSync(shared), false);
});

test('a pre-0.5 Codex store stays authoritative until migrated, then is copied intact', t => {
  const f = fixture(t), legacy = path.join(f.home, '.codex/harness'), shared = path.join(f.home, '.agents/harness');
  write(path.join(legacy, 'settings.json'), { max_agents: 5 });
  write(path.join(legacy, 'projects/abc/creative/preferences.md'), '# keep\n');
  write(path.join(legacy, 'install.json'), '{}');
  assert.equal(command(f, 'status').data.data_home, lib.canonical(legacy));
  assert.equal(command(f, 'status').data.config.max_agents, 5);
  const before = tree(legacy);

  const migrated = run(['data', 'migrate', '--home', f.home]);
  assert.equal(migrated.code, 0); assert.equal(migrated.data.status, 'migrated');
  assert.deepEqual(migrated.data.items, ['settings.json', 'projects']);
  // Host-owned files are not shared; legacy data is kept for older runtimes.
  assert.equal(fs.existsSync(path.join(shared, 'install.json')), false);
  for (const file of Object.keys(before)) assert.equal(fs.existsSync(path.join(legacy, file)), true);
  assert.equal(lib.readJson(path.join(legacy, 'MIGRATED.json')).migrated_to, lib.sharedHome(f.home));
  assert.equal(fs.readFileSync(path.join(shared, 'projects/abc/creative/preferences.md'), 'utf8'), '# keep\n');

  write(path.join(legacy, 'settings.json'), { max_agents: 9 });
  const status = command(f, 'status').data;
  assert.equal(status.data_home, lib.sharedHome(f.home)); assert.equal(status.config.max_agents, 5);
  assert.equal(run(['data', 'migrate', '--home', f.home]).data.status, 'current');
  assert.equal(fs.readdirSync(path.join(f.home, '.agents')).some(name => name.startsWith('.harness-migrate-')), false);
});

test('HARNESS_HOME overrides the shared location and symlinked legacy data is refused', t => {
  const f = fixture(t), custom = path.join(f.base, 'custom store'), legacy = path.join(f.base, 'legacy codex');
  const env = { ...process.env, HOME: f.home, USERPROFILE: f.home, HARNESS_HOME: custom, CODEX_HOME: legacy };
  assert.equal(run(['data', 'where'], { env }).data.data_home, lib.canonical(custom));
  fs.mkdirSync(path.join(legacy, 'harness'), { recursive: true }); write(path.join(f.base, 'elsewhere/x'), '1');
  fs.symlinkSync(path.join(f.base, 'elsewhere'), path.join(legacy, 'harness/projects'));
  const refused = run(['data', 'migrate'], { env });
  assert.equal(refused.code, 2); assert.match(refused.error, /must not be a symlink/);
  assert.equal(fs.existsSync(custom), false);
});

test('a migration that loses the publish race keeps the winner intact and reports current', t => {
  const f = fixture(t), legacy = path.join(f.home, '.codex/harness'), shared = lib.sharedHome(f.home);
  write(path.join(legacy, 'settings.json'), { max_agents: 5 });
  const rename = fs.renameSync;
  t.after(() => { fs.renameSync = rename; });
  fs.renameSync = (from, to) => {
    if (to === shared) { write(path.join(shared, 'settings.json'), { max_agents: 8 }); throw Object.assign(new Error('ENOTEMPTY'), { code: 'ENOTEMPTY' }); }
    return rename(from, to);
  };
  assert.deepEqual(lib.migrateData(f.home), { status: 'current', data_home: shared });
  fs.renameSync = rename;
  assert.equal(lib.readJson(path.join(shared, 'settings.json')).max_agents, 8);
  assert.equal(fs.readdirSync(path.dirname(shared)).some(name => name.startsWith('.harness-migrate-')), false);
  assert.equal(fs.existsSync(path.join(legacy, 'MIGRATED.json')), false);
});

test('an unwritable MIGRATED.json marker is a warning, not a failed migration', t => {
  const f = fixture(t), legacy = path.join(f.home, '.codex/harness');
  write(path.join(legacy, 'settings.json'), { max_agents: 5 });
  fs.mkdirSync(path.join(legacy, 'MIGRATED.json'));
  const result = run(['data', 'migrate', '--home', f.home]);
  assert.equal(result.code, 0); assert.equal(result.data.status, 'migrated'); assert.match(result.data.warning, /MIGRATED\.json not written/);
  assert.equal(command(f, 'status').data.config.max_agents, 5);
  assert.equal(command(f, 'status').data.data_home, lib.sharedHome(f.home));
});
