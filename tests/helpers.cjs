const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'dist/skill/runtime.js');
function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness test ')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const project = path.join(base, 'project with spaces 日本語'), home = path.join(base, 'user home');
  fs.mkdirSync(project);
  return { base, project, home };
}
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data)); }
function run(args, options = {}) {
  const result = spawnSync(process.execPath, [options.cli || cli, ...args], { encoding: 'utf8', cwd: options.cwd || root, env: options.env || process.env });
  assert.ifError(result.error);
  return { code: result.status, data: result.stdout.trim() ? JSON.parse(result.stdout) : null, error: result.stderr };
}
function command(f, ...args) { return run([...args, '--project', f.project, '--home', f.home]); }
function git(project, ...args) {
  const result = spawnSync('git', ['-C', project, ...args], { encoding: 'utf8' });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function init(f) { git(f.project, 'init'); git(f.project, 'config', 'user.name', 'Test'); git(f.project, 'config', 'user.email', 'test@example.invalid'); write(path.join(f.project, 'file'), 'initial'); git(f.project, 'add', 'file'); git(f.project, 'commit', '-m', 'initial'); return git(f.project, 'rev-parse', 'HEAD'); }
function tree(root) {
  if (!fs.existsSync(root)) return {};
  const files = {};
  function walk(dir) { for (const name of fs.readdirSync(dir)) { const file = path.join(dir, name); const stat = fs.lstatSync(file); if (stat.isSymbolicLink()) files[path.relative(root, file)] = 'symlink:' + fs.readlinkSync(file); else if (stat.isDirectory()) walk(file); else files[path.relative(root, file)] = fs.readFileSync(file).toString('base64'); } }
  walk(root); return files;
}
module.exports = { fixture, write, run, command, git, init, root, cli, tree };
