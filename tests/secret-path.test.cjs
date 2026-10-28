const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { root } = require('./helpers.cjs');

// Both reviewer helpers keep their own copy of the secret-path check so each stays self-contained.
const skills = path.join(root, 'plugins/codex-harness/skills/harness');
const helpers = {
  'consult-codex': path.join(skills, 'consult-codex/scripts/consult.mjs'),
  'consult-claude': path.join(skills, 'consult-claude/scripts/consult.mjs'),
};
const BEGIN = '// BEGIN shared secret-path check (keep identical across consult-codex, consult-claude)';
const END = '// END shared secret-path check';

function block(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const begin = lines.indexOf(BEGIN), end = lines.indexOf(END);
  assert.ok(begin !== -1 && end > begin, `${file} has one BEGIN/END shared secret-path block`);
  assert.equal(lines.lastIndexOf(BEGIN), begin); assert.equal(lines.lastIndexOf(END), end);
  return lines.slice(begin, end + 1).join('\n');
}

test('the two reviewer helpers carry an identical secret-path block', () => {
  const [first, ...rest] = Object.entries(helpers).map(([name, file]) => ({ name, text: block(file) }));
  for (const { name, text } of rest) assert.equal(text, first.text, `${name} matches ${first.name}`);
  assert.match(first.text, /const SECRET_NAMES = \[/);
  assert.match(first.text, /fail\('secret_path', /);
});

const SECRET = ['.env', '.ENV', '.env.local', '.env.production', 'config/prod.pem', 'certs/server.KEY', 'store.p12', 'a.pfx', 'release.keystore', 'android.jks',
  'id_rsa', 'home/.ssh/id_dsa', 'id_ecdsa_sk', 'id_ed25519', 'id_ed25519.bak', '.npmrc', 'pkg/.pypirc', '.netrc', 'credentials', '.aws/credentials', 'credentials.json',
  'config/secrets.yml', 'api.secret', 'service-account.json', 'gcp/service-account-prod.json', '.git-credentials', 'auth.json', 'credentials/readme.txt', '.env/notes.md'];
const ALLOWED = ['.env.example', '.env.Sample', 'app/.env.template', 'id_ed25519.pub', 'keys/id_rsa.pub', 'environment.ts', 'README.md', 'src/env.js', 'pem.md', 'keyboard.js',
  'my-credentials.md', 'secrets', 'secret.txt', 'service-account.yaml', 'docs/auth.md', 'auth.json.md', 'public.key.txt', 'tests/.envrc'];

test('secret-looking paths are matched per component and case-insensitively, with the listed exceptions', async () => {
  for (const [name, file] of Object.entries(helpers)) {
    const { secretLike, refuseSecretPaths } = await import(pathToFileURL(file).href);
    for (const item of SECRET) assert.equal(secretLike(item), true, `${name} ${item}`);
    for (const item of ALLOWED) assert.equal(secretLike(item), false, `${name} ${item}`);
    assert.equal(refuseSecretPaths(ALLOWED), undefined);
    assert.throws(() => refuseSecretPaths(['a.txt', ...SECRET.slice(0, 7)]), error => {
      assert.equal(error.code, 'secret_path');
      assert.equal(error.message, '秘密ファイルらしい変更が範囲に含まれるため送信しません: .env, .ENV, .env.local, .env.production, config/prod.pem ほか2件。除外するか、ユーザーに確認してください');
      return true;
    }, name);
  }
});
