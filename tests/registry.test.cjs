const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { fixture, root, tree, write } = require('./helpers.cjs');
const { npmEnvironment } = require('./npm-fixture.cjs');
const { stageRegistry } = require('../scripts/stage-registry.cjs');

test('GitHub staging and actual npm exec lifecycle through isolated loopback registry', { timeout: 180000 }, async t => {
  const f = fixture(t), npm = process.env.npm_execpath;
  assert.ok(npm && fs.existsSync(npm), 'Run using npm test');
  const env = npmEnvironment(f);
  // The cwd models a user's home without a package.json, including spaces/Unicode.
  assert.equal(fs.existsSync(path.join(f.project, 'package.json')), false);
  function command(script, args, cwd = f.project) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out: ' + args.join(' '))); }, 30000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
  }
  function success(result) { assert.equal(result.code, 0, result.stderr + result.stdout); return JSON.parse(result.stdout); }
  const current = stageRegistry(path.join(f.base, 'current stage'), npm);
  const staged = JSON.parse(fs.readFileSync(path.join(current.directory, 'package.json')));
  assert.equal(require('../package.json').private, true); assert.equal(staged.private, undefined);
  assert.equal(staged.version, require('../package.json').version); assert.equal(staged.license, 'UNLICENSED');
  assert.equal(staged.name, '@karladev001-eng/codex-harness');
  assert.equal(staged.publishConfig.registry, 'https://npm.pkg.github.com');
  assert.equal(staged.repository.url, 'git+https://github.com/karladev001-eng/harness.git');
  assert.equal(staged.scripts, undefined); assert.equal(staged.dependencies, undefined); assert.equal(staged.devDependencies, undefined);
  const beforeStage = tree(current.directory);
  assert.throws(() => stageRegistry(current.directory, npm), /already exists/); assert.deepEqual(tree(current.directory), beforeStage);
  const occupied = path.join(f.base, 'user file'); write(occupied, 'keep');
  assert.throws(() => stageRegistry(occupied, npm), /already exists/); assert.equal(fs.readFileSync(occupied, 'utf8'), 'keep');
  // Distinct fixture releases exercise npm's real cache and installer inventories.
  const old = path.join(f.base, 'old stage'); fs.cpSync(current.directory, old, { recursive: true });
  write(path.join(old, 'package.json'), { ...staged, version: '0.4.1' });
  fs.appendFileSync(path.join(old, 'dist/skill/SKILL.md'), '\nOld registry fixture marker\n');
  const archives = {};
  for (const [version, directory] of [['0.4.1', old], [staged.version, current.directory]]) {
    const packed = success(await command(npm, ['pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', f.base], directory))[0];
    assert.equal(packed.files.some(file => /^(?:src|scripts|tests|docs\/harness|benchmarks|node_modules)\//.test(file.path)), false);
    const extracted = path.join(f.base, 'extracted ' + version); fs.mkdirSync(extracted);
    // Use the existing package test for exhaustive contents and installed links; here check staging links.
    const tar = await new Promise((resolve, reject) => {
      const child = spawn('tar', ['-xzf', path.join(f.base, packed.filename), '-C', extracted]);
      child.once('error', reject); child.once('close', resolve);
    });
    assert.equal(tar, 0); assert.deepEqual(require('../scripts/check-doc-links.cjs').check(path.join(extracted, 'package')).errors, []);
    archives[version] = fs.readFileSync(path.join(f.base, packed.filename));
  }
  let latest = '0.4.1', failure = null, registry;
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    assert.equal(request.headers.authorization, undefined, 'no real credentials reach the fixture');
    if (failure === 'communication') { request.socket.destroy(); return; }
    if (failure) { response.writeHead(failure); response.end(JSON.stringify({ error: 'fixture acquisition failure' })); return; }
    if (request.url.startsWith('/archive/')) {
      const bytes = archives[path.basename(request.url, '.tgz')];
      if (!bytes) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(bytes); return;
    }
    if (decodeURIComponent(request.url).toLowerCase() !== '/@karladev001-eng/codex-harness') { response.writeHead(404); response.end(); return; }
    const versions = Object.fromEntries(Object.entries(archives).map(([version, bytes]) => [version, { ...staged, version,
      dist: { tarball: registry + '/archive/' + version + '.tgz', integrity: 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64') } }]));
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=31536000' });
    response.end(JSON.stringify({ name: staged.name, 'dist-tags': { latest }, versions }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  registry = 'http://127.0.0.1:' + server.address().port;
  env.npm_config_registry = registry;
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  async function exec(version, ...args) {
    return command(npm, ['exec', '--yes', '--prefer-online', '--registry=' + registry, '--package=' + staged.name + '@' + version, '--', 'codex-harness', ...args]);
  }
  const agents = path.join(f.home, '.codex/AGENTS.md'); write(agents, '\uFEFF# Keep personal instructions\r\n日本語');
  const settings = path.join(f.home, '.codex/harness/settings.json'); write(settings, '{"measurement":false}\r\n');
  const memory = path.join(require('../dist/skill/lib.js').localRoot(f.project, f.home), 'creative/preferences.md'); write(memory, '# Keep existing memory\r\n');
  const projectSettings = path.join(f.project, '.harness.json'); write(projectSettings, '{"max_agents":2}\r\n');
  const preserved = [settings, memory, projectSettings].map(file => fs.readFileSync(file));
  const initial = success(await exec('latest', 'install')); assert.equal(initial.status, 'installed');
  const permanent = path.join(initial.target, 'runtime.js');
  assert.match(fs.readFileSync(path.join(initial.target, 'SKILL.md'), 'utf8'), /Old registry fixture marker/);
  const initialHome = tree(f.home);
  assert.equal(success(await exec('latest', 'install')).status, 'unchanged'); assert.deepEqual(tree(f.home), initialHome);
  assert.ok(requests.includes('/archive/0.4.1.tgz'), 'old release is populated in the real npm cache');
  latest = staged.version; const requestIndex = requests.length;
  assert.equal(success(await exec('latest', 'install')).status, 'installed');
  assert.ok(requests.slice(requestIndex).some(url => decodeURIComponent(url).includes(staged.name)), 'prefer-online refreshes a long-lived old packument');
  assert.ok(requests.includes('/archive/' + staged.version + '.tgz'));
  assert.doesNotMatch(fs.readFileSync(path.join(initial.target, 'SKILL.md'), 'utf8'), /Old registry fixture marker/);
  for (const [index, file] of [settings, memory, projectSettings].entries()) assert.deepEqual(fs.readFileSync(file), preserved[index]);
  assert.ok(fs.readFileSync(agents, 'utf8').startsWith('\uFEFF# Keep personal instructions\r\n日本語'));
  assert.equal(success(await exec('latest', 'install')).status, 'unchanged');
  assert.equal(success(await exec('0.4.1', 'install')).status, 'installed');
  assert.match(fs.readFileSync(path.join(initial.target, 'SKILL.md'), 'utf8'), /Old registry fixture marker/);
  assert.equal(success(await exec(staged.version, 'install')).status, 'installed');
  // Force a genuine acquisition error with an uncached version; no CLI can run.
  for (const error of [401, 403, 404, 'communication']) {
    const before = tree(f.home); failure = error;
    const populatedCache = env.npm_config_cache;
    env.npm_config_cache = path.join(f.base, 'empty failure cache ' + error);
    const result = await exec('0.4.99', 'install'); assert.notEqual(result.code, 0, String(error));
    env.npm_config_cache = populatedCache;
    assert.match(result.stderr, error === 'communication' ? /ECONNRESET|socket hang up|network/i : new RegExp('E' + error));
    assert.deepEqual(tree(f.home), before, 'acquisition error leaves permanent home unchanged: ' + error);
  }
  failure = null;
  fs.appendFileSync(path.join(initial.target, 'SKILL.md'), '\nUser edit\n');
  const edited = tree(f.home);
  const refused = await exec('latest', 'install'); assert.notEqual(refused.code, 0); assert.match(refused.stderr, /user changes/); assert.deepEqual(tree(f.home), edited);
  fs.writeFileSync(path.join(initial.target, 'SKILL.md'), fs.readFileSync(path.join(current.directory, 'dist/skill/SKILL.md')));
  const beforeAuthoring = tree(f.home);
  assert.deepEqual(success(await exec('latest', 'authoring', 'install', '--project', f.project, '--skill', 'inspect-harness')).skills, ['inspect-harness']);
  assert.equal(fs.existsSync(path.join(f.project, '.agents/skills/inspect-harness/SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(f.project, 'AGENTS.md')), false); assert.deepEqual(tree(f.home), beforeAuthoring);
  assert.equal(success(await exec('latest', 'authoring', 'uninstall', '--project', f.project, '--skill', 'inspect-harness')).status, 'uninstalled');
  const bootstrap = fs.readFileSync(agents, 'utf8'); assert.ok(bootstrap.includes(permanent)); assert.equal(bootstrap.includes(env.npm_config_cache), false);
  fs.rmSync(env.npm_config_cache, { recursive: true, force: true });
  const status = success(await command(permanent, ['status', '--project', f.project]));
  assert.equal(status.config.measurement, false); assert.equal(status.config.max_agents, 2);
  assert.equal(success(await exec('latest', 'uninstall')).status, 'uninstalled');
  assert.equal(fs.existsSync(initial.target), false); assert.equal(fs.readFileSync(agents, 'utf8'), '\uFEFF# Keep personal instructions\r\n日本語');
  for (const [index, file] of [settings, memory, projectSettings].entries()) assert.deepEqual(fs.readFileSync(file), preserved[index]);
});
