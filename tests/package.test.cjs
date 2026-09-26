const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture, root, run, tree, write } = require('./helpers.cjs');

test('packed release runs through actual npx outside repo without compiler/network/Python', { timeout: 120000 }, t => {
  const f = fixture(t), npm = process.env.npm_execpath;
  assert.ok(npm && fs.existsSync(npm), 'Run packaging tests using npm test');
  const env = { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH, npm_config_cache: path.join(f.base, 'npm cache'), npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' };
  function invoke(script, args, cwd) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd, env, timeout: 90000 });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr + result.stdout); return result.stdout;
  }
  const packResult = JSON.parse(invoke(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', f.base], root));
  const packed = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0];
  const archive = path.join(f.base, packed.filename), files = packed.files.map(file => file.path);
  assert.ok(files.includes('dist/skill/runtime.js'));
  assert.ok(files.includes('dist/plugins/codex-harness/.codex-plugin/plugin.json'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/runtime.js')); assert.ok(files.includes('dist/skill/authoring-skills/inspect-harness/SKILL.md'));
  assert.equal(files.some(file => /(?:node_modules|^src\/|\.py$)/.test(file)), false);
  const npx = path.join(path.dirname(npm), 'npx-cli.js'); assert.ok(fs.existsSync(npx));
  function packaged(...args) { return JSON.parse(invoke(npx, ['--yes', '--offline', '--package', archive, 'codex-harness', ...args], f.project)); }
  assert.equal(packaged('doctor', '--project', f.project, '--home', f.home).node, process.versions.node);
  const status = packaged('status', '--project', f.project, '--home', f.home); assert.equal(status.active, true);
  const installed = packaged('install', '--home', f.home); assert.equal(installed.status, 'installed');
  const agents = fs.readFileSync(path.join(f.home, '.codex/AGENTS.md'), 'utf8'); assert.ok(agents.includes(path.join(installed.target, 'runtime.js'))); assert.equal(agents.includes('npm cache'), false);
  // Deleting the npx cache demonstrates that the bootstrap uses permanent installed files.
  fs.rmSync(env.npm_config_cache, { recursive: true, force: true });
  const direct = run(['status', '--project', f.project, '--home', f.home], { cwd: f.project, cli: path.join(installed.target, 'runtime.js') }); assert.equal(direct.code, 0, direct.error);
  const skillResult = packaged('authoring', 'install', '--project', f.project); assert.equal(skillResult.skills.length, 4);
  assert.equal(fs.existsSync(path.join(f.project, 'AGENTS.md')), false); assert.equal(fs.existsSync(path.join(f.project, '.git')), false);
  assert.equal(packaged('authoring', 'uninstall', '--project', f.project).status, 'uninstalled');
  assert.equal(packaged('uninstall', '--home', f.home).status, 'uninstalled');
});
