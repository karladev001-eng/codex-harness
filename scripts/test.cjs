const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.cjs')).map(file => path.join(root, 'tests', file));
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit', cwd: root });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
