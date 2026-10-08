const path = require('node:path');
const assert = require('node:assert/strict');
const { write, run } = require('./helpers.cjs');

// Run a compiled snapshot of the actual pre-creative-loop JS installer. This
// creates its original schema-2 ownership hashes and bootstrap, not new state
// relabelled as old. Runtime dependencies and assets remain entirely local.
function installLegacyJs(f, version) {
  const source = path.join(f.base, 'legacy JS release');
  for (const [name, text] of Object.entries(require(version === '0.3.0' ? './fixtures/legacy-js-0.3.json' : './fixtures/legacy-js-schema2.json').files)) write(path.join(source, name), text);
  const result = run(['install', '--home', f.home], { cwd: f.project, cli: path.join(source, 'runtime.js') });
  assert.equal(result.code, 0, result.error);
  assert.equal(result.data.status, 'installed');
  return result.data;
}
module.exports = { installLegacyJs };
