// Build at the source, then copy npm's existing allowlist into a new release directory.
// This never publishes, logs in, or replaces an existing destination.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function stageRegistry(destination, npm = process.env.npm_execpath) {
  if (!destination) throw new Error('Usage: npm run stage:registry -- /absolute/new/staging-directory');
  const output = path.resolve(destination);
  if (fs.existsSync(output)) throw new Error('Staging destination already exists; choose a new directory: ' + output);
  if (!npm || !fs.existsSync(npm)) throw new Error('Run using npm run stage:registry so npm_execpath is available');
  if (!fs.existsSync(path.join(root, 'dist/skill/runtime.js'))) throw new Error('Build the source before staging');
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stage-npm-'));
  const userconfig = path.join(isolated, 'user.npmrc'), globalconfig = path.join(isolated, 'global.npmrc');
  fs.writeFileSync(userconfig, ''); fs.writeFileSync(globalconfig, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key) && !/^(?:NPM_TOKEN|NODE_AUTH_TOKEN|NODE_OPTIONS)$/i.test(key)));
  let result;
  try {
    result = spawnSync(process.execPath, [npm, 'pack', '--dry-run', '--ignore-scripts', '--offline', '--json',
      '--cache=' + path.join(isolated, 'cache'), '--userconfig=' + userconfig, '--globalconfig=' + globalconfig,
      '--registry=http://127.0.0.1:9'], { cwd: root, encoding: 'utf8', env: { ...env, HOME: isolated, USERPROFILE: isolated } });
  } finally { fs.rmSync(isolated, { recursive: true, force: true }); }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const packed = JSON.parse(result.stdout)[0];
  const source = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const manifest = {
    name: '@karladev001-eng/codex-harness', version: source.version,
    description: source.description, license: source.license, type: source.type,
    engines: source.engines, bin: source.bin,
    repository: { type: 'git', url: 'git+https://github.com/karladev001-eng/harness.git' },
    publishConfig: { registry: 'https://npm.pkg.github.com' },
  };
  // mkdir without recursive ensures a racing/existing target cannot be overwritten.
  fs.mkdirSync(output);
  for (const entry of packed.files) {
    const file = entry.path;
    if (file === 'package.json') continue;
    const from = path.resolve(root, file), to = path.resolve(output, file);
    if (!from.startsWith(root + path.sep) || !to.startsWith(output + path.sep) || !fs.lstatSync(from).isFile()) {
      throw new Error('Unexpected package entry: ' + file);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    fs.chmodSync(to, fs.statSync(from).mode & 0o777);
  }
  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { directory: output, name: manifest.name, version: manifest.version, registry: manifest.publishConfig.registry, files: packed.files.length };
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Supply exactly one new staging directory');
    console.log(JSON.stringify(stageRegistry(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { stageRegistry };
