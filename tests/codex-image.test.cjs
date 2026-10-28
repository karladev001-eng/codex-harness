const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { fixture, write, root } = require('./helpers.cjs');
const source = path.join(root, 'plugins/codex-harness/skills/harness/codex-image/scripts/image.mjs');

// The fake records argv, cwd, stdin and leaked env names, then answers as the Codex CLI would.
// `exec` writes into $CODEX_HOME/generated_images/<id>/ the way image_gen stores its output.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'); const args = process.argv.slice(2), mode = process.env.FAKE_MODE || 'ok';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]), JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 5, 6]);
let input = ''; process.stdin.on('data', d => input += d).on('end', () => {
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, cwd: process.cwd(), entries: fs.readdirSync(process.cwd()), input, env: Object.keys(process.env).filter(k => /^(GH_|GITHUB_|AWS_|ANTHROPIC_|CLAUDE_)/.test(k)) }) + '\\n');
  if (args[0] === 'login') process.exit(mode === 'logged_out' ? 1 : 0);
  if (args[0] === 'features') { console.log('apps stable false'); console.log('image_generation stable ' + (mode === 'no_feature' ? 'false' : 'true')); process.exit(0); }
  const store = path.join(process.env.CODEX_HOME, 'generated_images', 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const save = (name, data) => { fs.mkdirSync(store, { recursive: true }); fs.writeFileSync(path.join(store, name), data); return path.join(store, name); };
  const emit = value => console.log(JSON.stringify(value));
  emit({ type: 'thread.started', thread_id: 't' }); emit({ type: 'turn.started' });
  emit({ type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'thinking' } });
  let saved;
  if (mode === 'ok' || mode === 'tool' || mode === 'outside') saved = save('img.png', PNG);
  if (mode === 'two') { save('a.png', PNG); save('b.png', PNG); }
  if (mode === 'jpeg') saved = save('img.png', JPG);
  if (mode === 'event') { save('decoy.png', PNG); saved = save('chosen.png', PNG); }
  if (mode === 'outside') { const elsewhere = path.join(process.env.FAKE_ELSEWHERE, 'outside.png'); fs.writeFileSync(elsewhere, PNG); saved = elsewhere; }
  emit({ type: 'item.completed', item: { id: 'i', type: 'image_generation', ...(mode === 'event' || mode === 'outside' ? { saved_path: saved } : {}) } });
  if (mode === 'tool') emit({ type: 'item.completed', item: { id: 'c', type: 'command_execution', command: 'ls' } });
  if (mode === 'failed') { emit({ type: 'turn.failed', error: { message: 'raw secret detail' } }); process.exit(0); }
  emit({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'done' } });
  emit({ type: 'turn.completed', usage: {} });
});
`;
function setup(t) {
  const f = fixture(t), bin = path.join(f.base, 'bin'), log = path.join(f.base, 'codex.log'), codexHome = path.join(f.base, 'codex home');
  const elsewhere = path.join(f.base, 'elsewhere'); fs.mkdirSync(elsewhere);
  write(path.join(bin, 'codex'), FAKE); fs.chmodSync(path.join(bin, 'codex'), 0o755);
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_LOG: log, FAKE_ELSEWHERE: elsewhere, CODEX_HOME: codexHome, GH_TOKEN: 'secret', GITHUB_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', CLAUDE_CODE_OAUTH_TOKEN: 'secret' };
  return { ...f, env, codexHome, elsewhere, calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [] };
}
function image(f, value, mode = 'ok', ...args) {
  const result = spawnSync(process.execPath, [source, ...args], { input: value === undefined ? '' : JSON.stringify(value), env: { ...f.env, FAKE_MODE: mode }, encoding: 'utf8', timeout: 20000 });
  return { code: result.status, data: JSON.parse(result.stdout), stderr: result.stderr };
}
const request = (f, extra = {}) => ({ project: f.project, prompt: '秘密の港町の絵', out: path.join(f.project, 'assets/harbor.png'), ...extra });

test('a generated image is copied into the project from an isolated, image-only Codex run', t => {
  const f = setup(t), result = image(f, request(f, { size: '1536x1024', transparent: true }));
  assert.equal(result.code, 0, JSON.stringify(result.data));
  const out = path.join(f.project, 'assets/harbor.png');
  assert.deepEqual(result.data.files, [{ path: out, bytes: 12 }]);
  assert.equal(result.data.ok, true); assert.equal(result.data.peer, 'codex');
  assert.equal(result.data.sources.length, 1);
  assert.ok(result.data.sources[0].startsWith(path.join(f.codexHome, 'generated_images') + path.sep));
  assert.deepEqual(fs.readFileSync(out), fs.readFileSync(result.data.sources[0]));
  const [login, exec] = f.calls();
  assert.deepEqual(login.args, ['login', 'status']);
  for (const flag of ['--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--json', '-']) assert.ok(exec.args.includes(flag), flag);
  assert.equal(exec.args[exec.args.indexOf('--sandbox') + 1], 'read-only');
  for (const setting of ['features.image_generation=true', 'features.shell_tool=false', 'features.view_image=false', 'features.multi_agent=false', 'features.apps=false', 'web_search="disabled"']) assert.ok(exec.args.includes(setting), setting);
  assert.equal(exec.args.includes('features.image_generation=false'), false);
  assert.equal(exec.args.join(' ').includes('秘密'), false);
  for (const text of ['秘密の港町の絵', 'image_gen', 'exactly once', 'Size: 1536x1024', 'Background: transparent']) assert.ok(exec.input.includes(text), text);
  const scratch = exec.args[exec.args.indexOf('-C') + 1];
  assert.match(path.basename(scratch), /^claude-codex-image-/); assert.equal(path.basename(exec.cwd), path.basename(scratch));
  assert.deepEqual(exec.entries, []); assert.equal(fs.existsSync(scratch), false);
  assert.equal(exec.cwd.startsWith(f.project), false);
  // GitHub, cloud and Anthropic credentials never reach the child.
  assert.deepEqual(login.env, []); assert.deepEqual(exec.env, []);
});

test('existing files are never overwritten and extra images get numbered names', t => {
  const f = setup(t), out = path.join(f.project, 'assets/harbor.png');
  write(out, 'keep me');
  const first = image(f, request(f));
  assert.equal(first.data.files[0].path, path.join(f.project, 'assets/harbor-v2.png'));
  assert.equal(image(f, request(f)).data.files[0].path, path.join(f.project, 'assets/harbor-v3.png'));
  assert.equal(fs.readFileSync(out, 'utf8'), 'keep me');
  const two = image(f, request(f, { out: path.join(f.project, 'pair.png') }), 'two');
  assert.deepEqual(two.data.files.map(file => path.basename(file.path)), ['pair.png', 'pair-2.png']);
  assert.equal(two.data.sources.length, 2);
  // The real format wins over a mismatching extension.
  const jpeg = image(f, request(f, { out: path.join(f.project, 'photo.png') }), 'jpeg');
  assert.equal(jpeg.data.files[0].path, path.join(f.project, 'photo.jpg'));
});

test('paths reported in events are preferred only inside generated_images', t => {
  const f = setup(t);
  const chosen = image(f, request(f), 'event');
  assert.equal(chosen.code, 0); assert.equal(chosen.data.sources.length, 1); assert.equal(path.basename(chosen.data.sources[0]), 'chosen.png');
  const outside = image(f, request(f, { out: path.join(f.project, 'b.png') }), 'outside');
  assert.equal(outside.code, 0); assert.equal(outside.data.sources.length, 1);
  assert.ok(outside.data.sources[0].startsWith(path.join(f.codexHome, 'generated_images') + path.sep));
});

test('outputs and references must stay inside the project, including through symlinks', t => {
  const f = setup(t);
  const outside = image(f, request(f, { out: path.join(f.base, 'escape.png') }));
  assert.equal(outside.code, 1); assert.equal(outside.data.error.code, 'invalid_input'); assert.match(outside.data.error.message, /out must be inside project/);
  fs.symlinkSync(f.elsewhere, path.join(f.project, 'link'));
  const linked = image(f, request(f, { out: path.join(f.project, 'link/sub/x.png') }));
  assert.equal(linked.data.error.code, 'path_outside_project');
  assert.deepEqual(fs.readdirSync(f.elsewhere), []);
  write(path.join(f.elsewhere, 'ref.png'), 'x');
  assert.equal(image(f, request(f, { references: [path.join(f.project, 'link/ref.png')] })).data.error.code, 'path_outside_project');
  assert.equal(image(f, request(f, { references: [path.join(f.base, 'elsewhere/ref.png')] })).data.error.code, 'path_outside_project');
  // Valid references are attached with -i ahead of the other flags.
  const refs = [path.join(f.project, 'r1.png'), path.join(f.project, 'r2.webp')];
  for (const file of refs) write(file, 'img');
  assert.equal(image(f, request(f, { references: refs })).code, 0);
  const exec = f.calls().at(-1);
  assert.deepEqual(exec.args.slice(0, 5), ['exec', '-i', fs.realpathSync(refs[0]), '-i', fs.realpathSync(refs[1])]);
  assert.equal(image(f, request(f, { references: Array(5).fill(refs[0]) })).data.error.code, 'invalid_input');
});

test('input validation names unknown fields and the expected types', t => {
  const f = setup(t);
  const unknown = image(f, request(f, { colour: 'red', quality: 'hd' }));
  assert.equal(unknown.code, 1); assert.equal(unknown.data.error.code, 'invalid_input');
  assert.match(unknown.data.error.message, /"colour"/); assert.match(unknown.data.error.message, /"quality"/);
  const cases = [
    [{ transparent: 'yes' }, /transparent must be a boolean/], [{ size: '512x512' }, /size must be one of/], [{ prompt: '  ' }, /prompt must be a nonempty string/],
    [{ project: 'relative' }, /project must be an absolute path string/], [{ out: path.join(f.project, 'x.gif') }, /\.png, \.jpg, \.jpeg or \.webp/],
    [{ references: 'a.png' }, /references must be an array of absolute path strings/],
  ];
  for (const [extra, message] of cases) {
    const result = image(f, request(f, extra));
    assert.equal(result.data.error.code, 'invalid_input', JSON.stringify(extra)); assert.match(result.data.error.message, message);
  }
  assert.equal(image(f, [1]).data.error.code, 'invalid_input');
  assert.equal(f.calls().length, 0);
});

test('forbidden tools, failed turns, missing images and missing login fail closed without raw output', t => {
  const f = setup(t);
  const tool = image(f, request(f), 'tool');
  assert.equal(tool.code, 1); assert.equal(tool.data.error.code, 'tool_forbidden');
  assert.equal(fs.existsSync(path.join(f.project, 'assets/harbor.png')), false);
  const failed = image(f, request(f), 'failed');
  assert.equal(failed.data.error.code, 'response_error'); assert.equal(JSON.stringify(failed.data).includes('raw secret'), false);
  assert.equal(failed.stderr, '');
  assert.equal(image(f, request(f), 'none').data.error.code, 'empty_response');
  const logged = image(f, request(f), 'logged_out');
  assert.equal(logged.data.error.code, 'auth_unavailable'); assert.match(logged.data.error.message, /! codex login/);
});

test('--check confirms the CLI, the login and the image_generation feature', t => {
  const f = setup(t);
  assert.deepEqual(image(f, undefined, 'ok', '--check').data, { ok: true, cli: 'available', authenticated: true, image_generation: true });
  assert.deepEqual(f.calls().map(call => call.args), [['login', 'status'], ['features', 'list']]);
  assert.equal(image(f, undefined, 'no_feature', '--check').data.error.code, 'feature_unavailable');
  assert.equal(image(f, undefined, 'logged_out', '--check').data.error.code, 'auth_unavailable');
});

test('stdin that never sends data times out quickly; empty stdin is refused with guidance', async t => {
  const f = setup(t), started = Date.now();
  const child = spawn(process.execPath, [source], { env: { ...f.env, CODEX_IMAGE_FIRST_BYTE_MS: '200' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.on('data', chunk => stdout += chunk);
  const code = await new Promise(resolve => child.on('close', resolve));
  child.stdin.destroy();
  assert.equal(code, 1); assert.ok(Date.now() - started < 5000);
  const data = JSON.parse(stdout);
  assert.equal(data.error.code, 'input_timeout'); assert.match(data.error.message, /heredoc/); assert.match(data.error.message, /--input/);
  const empty = image(f, undefined);
  assert.equal(empty.data.error.code, 'input_unavailable'); assert.match(empty.data.error.message, /heredoc/);
  const file = path.join(f.base, 'input.json'); write(file, request(f));
  assert.equal(image(f, undefined, 'ok', '--input', file).code, 0);
});

test('--approval reads the shared send-approval record and always exits 0', t => {
  const f = setup(t), record = path.join(f.project, 'docs/harness/authorizations/codex-send.md');
  const approve = (...args) => image(f, undefined, 'ok', '--approval', '--project', f.project, ...args);
  const body = (fields = {}) => {
    const values = { peer: 'codex', project: f.project, purposes: '[advice, review, image]', status: 'approved', recorded: '2026-10-28', ...fields };
    return `---\n${Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# Codexへの送信事前承認\n`;
  };
  let result = approve();
  assert.equal(result.code, 0); assert.deepEqual(result.data, { ok: true, approved: false, reason: 'missing', record, purposes: [] });
  write(record, body());
  assert.deepEqual(approve().data, { ok: true, approved: true, reason: 'approved', record, purposes: ['advice', 'review', 'image'] });
  assert.equal(approve('--purpose', 'advice').data.approved, true);
  write(record, body({ purposes: '[advice]' }));
  result = approve(); assert.equal(result.code, 0); assert.equal(result.data.reason, 'purpose_missing'); assert.deepEqual(result.data.purposes, ['advice']);
  write(record, body({ status: 'revoked' }));
  assert.equal(approve().data.reason, 'revoked');
  write(record, body({ project: f.base }));
  assert.equal(approve().data.reason, 'project_mismatch');
  write(record, body({ purposes: 'advice, image' }));
  result = approve(); assert.equal(result.data.reason, 'malformed'); assert.equal(result.data.approved, false); assert.match(result.data.message, /line 4/);
  write(record, body({ purposes: '[advice, painting]' }));
  assert.match(approve().data.message, /line 4: unknown purpose "painting"/);
  write(record, body({ recorded: null }));
  assert.match(approve().data.message, /missing "recorded"/);
  write(record, '# Codexへの送信事前承認\n\n- 状態: 承認済み\n');
  result = approve(); assert.equal(result.data.reason, 'malformed'); assert.match(result.data.message, /line 1/);
  // A symlinked project path resolves to the recorded real path.
  write(record, body());
  const alias = path.join(f.base, 'alias'); fs.symlinkSync(f.project, alias);
  result = image(f, undefined, 'ok', '--approval', '--project', alias);
  assert.equal(result.data.reason, 'approved');
  assert.equal(image(f, undefined, 'ok', '--approval', '--project', 'relative').data.error.code, 'invalid_options');
  assert.equal(f.calls().length, 0);
});
