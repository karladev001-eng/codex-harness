const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist/skill');
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
const compiled = require('node:child_process').spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', path.join(root, 'tsconfig.json')], { stdio: 'inherit', cwd: root });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status || 1);
for (const name of ['SKILL.md', 'assets', 'references']) {
  fs.cpSync(path.join(root, 'plugins/codex-harness/skills/harness', name), path.join(target, name), { recursive: true });
}
for (const name of ['create-rulebooks', 'create-subagent', 'create-harness', 'inspect-harness']) {
  fs.cpSync(path.join(root, 'authoring-skills', name), path.join(target, 'authoring-skills', name), { recursive: true });
}
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ private: true, type: 'commonjs' }) + '\n');
fs.chmodSync(path.join(target, 'runtime.js'), 0o755);

const plugin = path.join(root, 'dist/plugins/codex-harness');
fs.cpSync(path.join(root, 'plugins/codex-harness/.codex-plugin'), path.join(plugin, '.codex-plugin'), { recursive: true });
fs.cpSync(target, path.join(plugin, 'skills/harness'), { recursive: true });
