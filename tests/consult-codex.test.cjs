const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { fixture, write, root, command } = require('./helpers.cjs');
const source = path.join(root, 'plugins/codex-harness/skills/harness/consult-codex/scripts/consult.mjs');

// The fake records argv and stdin, then answers as `codex login status` / `codex exec` would.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs'); const args = process.argv.slice(2), mode = process.env.FAKE_MODE || 'ok';
let input = ''; process.stdin.on('data', d => input += d).on('end', () => {
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, cwd: process.cwd(), input, env: Object.keys(process.env).filter(k => /^(GH_|ANTHROPIC_|CLAUDE_)/.test(k)) }) + '\\n');
  if (args[0] === 'login') process.exit(mode === 'logged_out' ? 1 : 0);
  const out = args[args.indexOf('--output-last-message') + 1], review = input.includes('"role":"reviewer"');
  const item = type => console.log(JSON.stringify({ type: 'item.completed', item: { type } }));
  item('reasoning');
  if (mode === 'tool') item('file_change');
  if (review) item('command_execution');
  if (mode !== 'incomplete') console.log(JSON.stringify({ type: 'turn.completed' }));
  const advice = { summary: '要約', verdict: review ? 'NEEDS_WORK' : 'none', points: ['p'], risks: [], recommendations: [], questions: [], findings: review ? [{ severity: 'high', location: 'src/a.ts:3', issue: 'i', evidence: 'e' }] : [] };
  if (mode === 'bad_verdict') advice.verdict = review ? 'none' : 'PASS';
  if (mode === 'sparse') for (const key of ['points', 'risks', 'recommendations', 'questions', 'findings']) delete advice[key];
  if (mode === 'empty_summary') advice.summary = '  ';
  const text = JSON.stringify(advice);
  fs.writeFileSync(out, mode === 'fenced' ? '\\x60\\x60\\x60json\\n' + text + '\\n\\x60\\x60\\x60\\n' : mode === 'prose' ? 'Here is the advice:\\n' + text + '\\nThanks.' : text);
});
`;
function setup(t) {
  const f = fixture(t), bin = path.join(f.base, 'bin'), log = path.join(f.base, 'codex.log');
  write(path.join(bin, 'codex'), FAKE); fs.chmodSync(path.join(bin, 'codex'), 0o755);
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_LOG: log, GH_TOKEN: 'secret', ANTHROPIC_API_KEY: 'secret' };
  return { ...f, env, calls: () => fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) };
}
function consult(f, value, mode = 'ok', ...args) {
  const result = spawnSync(process.execPath, [source, ...args], { input: JSON.stringify(value), env: { ...f.env, FAKE_MODE: mode }, encoding: 'utf8', timeout: 20000 });
  return { code: result.status, data: JSON.parse(result.stdout) };
}

test('advisory roles run isolated with every tool disabled and no prompt in argv', t => {
  const f = setup(t), result = consult(f, { role: 'critic', task: '秘密のタスク', candidate: '案' });
  assert.equal(result.code, 0); assert.deepEqual(result.data, { ok: true, peer: 'codex', role: 'critic', followup: 0, commands: 0, advice: { summary: '要約', verdict: 'none', points: ['p'], risks: [], recommendations: [], questions: [], findings: [] } });
  const [login, exec] = f.calls();
  assert.deepEqual(login.args, ['login', 'status']);
  for (const flag of ['--ignore-user-config', '--ephemeral', '--json', '-']) assert.ok(exec.args.includes(flag), flag);
  assert.equal(exec.args[exec.args.indexOf('--sandbox') + 1], 'read-only');
  for (const setting of ['features.shell_tool=false', 'features.image_generation=false', 'features.multi_agent=false', 'web_search="disabled"']) assert.ok(exec.args.includes(setting), setting);
  assert.equal(exec.args.join(' ').includes('秘密のタスク'), false); assert.ok(exec.input.includes('秘密のタスク'));
  assert.deepEqual(exec.env, []);
  assert.notEqual(exec.cwd, f.project);
});

test('reviewer reads the given repository with a read-only shell and must return a verdict', t => {
  const f = setup(t), input = { role: 'reviewer', task: 'review', repository: f.project, base: 'abc1234', head: 'def5678', criteria: ['1. works'] };
  const result = consult(f, input);
  assert.equal(result.code, 0); assert.equal(result.data.advice.verdict, 'NEEDS_WORK'); assert.equal(result.data.commands, 1);
  const exec = f.calls()[1];
  assert.equal(exec.cwd, fs.realpathSync(f.project)); assert.ok(exec.args.includes('features.shell_tool=true'));
  assert.equal(exec.args[exec.args.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(consult(f, { ...input, base: undefined }).data.error.code, 'invalid_input');
  assert.equal(consult(f, { ...input, criteria: [] }).data.error.code, 'invalid_input');
  assert.equal(consult(f, { ...input, repository: 'relative' }).data.error.code, 'invalid_input');
  assert.equal(consult(f, { role: 'critic', task: 't', repository: f.project }).data.error.code, 'invalid_input');
});

test('forbidden tools, incomplete turns, reviewer verdicts and missing login fail closed', t => {
  const f = setup(t), critic = { role: 'critic', task: 't' };
  assert.equal(consult(f, critic, 'tool').data.error.code, 'tool_forbidden');
  assert.equal(consult(f, critic, 'incomplete').data.error.code, 'response_error');
  const reviewer = { role: 'reviewer', task: 'review', repository: f.project, base: 'abc1234', head: 'def5678', criteria: ['1. works'] };
  assert.equal(consult(f, reviewer, 'bad_verdict').data.error.code, 'invalid_advice');
  const out = consult(f, critic, 'logged_out');
  assert.equal(out.code, 1); assert.equal(out.data.error.code, 'auth_unavailable');
  assert.equal(consult(f, { role: 'ideator', task: 't', candidate: 'x' }).data.error.code, 'invalid_input');
  assert.equal(consult(f, { ...critic, extra: 1 }).data.error.code, 'invalid_input');
  assert.deepEqual(consult(f, null, 'ok', '--check').data, { ok: true, cli: 'available', authenticated: true });
});

test('final messages are accepted as plain JSON, fenced JSON or JSON inside prose, and normalized', t => {
  const f = setup(t), critic = { role: 'critic', task: 't' };
  const expected = { summary: '要約', verdict: 'none', points: ['p'], risks: [], recommendations: [], questions: [], findings: [] };
  for (const mode of ['fenced', 'prose']) assert.deepEqual(consult(f, critic, mode).data.advice, expected, mode);
  // An advisory role with a reviewer verdict is normalized instead of failing.
  const advisory = consult(f, critic, 'bad_verdict');
  assert.equal(advisory.code, 0); assert.equal(advisory.data.advice.verdict, 'none');
  assert.deepEqual(consult(f, critic, 'sparse').data.advice, { ...expected, points: [] });
  const empty = consult(f, critic, 'empty_summary');
  assert.equal(empty.code, 1); assert.equal(empty.data.error.code, 'invalid_advice');
  assert.match(empty.data.error.message, /summary/); assert.equal(empty.data.error.message.includes('要約'), false);
  assert.deepEqual(Object.keys(advisory.data), ['ok', 'peer', 'role', 'followup', 'commands', 'advice']);
});

test('input errors name the field and its expected type; structured context is sent as JSON text', t => {
  const f = setup(t);
  const error = value => consult(f, value).data.error;
  assert.deepEqual(error({ role: 'critic', task: 't', criteria: ['a', 'b', ''] }), { code: 'invalid_input', message: 'criteria[2] must be a nonempty string' });
  assert.equal(error({ role: 'critic', task: 't', foo: 1 }).message, 'unsupported field: foo');
  assert.match(error({ role: 'critic', task: '' }).message, /^task must be a nonempty string/);
  assert.match(error({ role: 'nobody', task: 't' }).message, /^role must be one of ideator, consultant, critic, reviewer/);
  assert.match(error({ role: 'critic', task: 't', constraints: 'x' }).message, /^constraints must be an array of nonempty strings/);
  assert.match(error({ role: 'critic', task: 't', context: 3 }).message, /^context must be a string, an object or an array/);
  assert.match(error({ role: 'reviewer', task: 't', repository: f.project, head: 'def5678', criteria: ['1'] }).message, /^base is required for reviewer/);
  assert.match(error({ role: 'reviewer', task: 't', repository: f.project, base: 'xyz', head: 'def5678', criteria: ['1'] }).message, /^base must be a commit ID/);
  const ok = consult(f, { role: 'consultant', task: 't', context: { files: ['a.ts'], note: '秘密' } });
  assert.equal(ok.code, 0);
  assert.ok(f.calls().at(-1).input.includes(JSON.stringify(JSON.stringify({ files: ['a.ts'], note: '秘密' }))));
});

test('empty or silent stdin fails quickly with heredoc and --input guidance', async t => {
  const f = setup(t);
  const empty = spawnSync(process.execPath, [source], { input: '', env: f.env, encoding: 'utf8', timeout: 5000 });
  assert.equal(empty.status, 1);
  const emptyError = JSON.parse(empty.stdout).error;
  assert.equal(emptyError.code, 'input_unavailable'); assert.match(emptyError.message, /heredoc[\s\S]*--input/);
  const started = Date.now();
  const silent = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [source], { env: { ...f.env, CONSULT_CODEX_STDIN_FIRST_BYTE_MS: '200' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; child.stdout.on('data', chunk => stdout += chunk);
    const guard = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('stdin wait did not end')); }, 5000);
    child.on('close', code => { clearTimeout(guard); child.stdin.destroy(); resolve({ code, data: JSON.parse(stdout) }); });
  });
  assert.equal(silent.code, 1); assert.equal(silent.data.error.code, 'input_timeout'); assert.match(silent.data.error.message, /heredoc[\s\S]*--input/);
  assert.ok(Date.now() - started < 4000);
  assert.equal(fs.existsSync(path.join(f.base, 'codex.log')), false);
});

function approval(project, ...args) {
  const result = spawnSync(process.execPath, [source, '--approval', '--project', project, ...args], { encoding: 'utf8', timeout: 10000 });
  return { code: result.status, data: JSON.parse(result.stdout) };
}
function record(project, frontmatter, body = '# Codexへの送信事前承認\n') {
  write(path.join(project, 'docs/harness/authorizations/codex-send.md'), frontmatter === null ? body : `---\n${frontmatter}\n---\n\n${body}`);
}

test('--approval decides send approval from the record frontmatter and always exits 0', t => {
  const f = fixture(t), file = path.join(f.project, 'docs/harness/authorizations/codex-send.md');
  const front = (overrides = {}) => Object.entries({ peer: 'codex', project: f.project, purposes: '[advice, review]', status: 'approved', recorded: '2026-10-28', ...overrides }).map(([key, value]) => `${key}: ${value}`).join('\n');
  const reason = (...args) => { const result = approval(f.project, ...args); assert.equal(result.code, 0); assert.equal(result.data.ok, true); assert.equal(result.data.record, file); return result.data; };
  assert.deepEqual(reason('--purpose', 'advice'), { ok: true, approved: false, reason: 'missing', record: file, purposes: [], message: 'No send approval record exists for this project.' });
  record(f.project, null, '# 承認\n- 状態: 承認済み\n');
  assert.match(reason().message, /^line 1:/);
  record(f.project, front().replace('recorded: 2026-10-28', 'recorded: yesterday'));
  const malformed = reason();
  assert.equal(malformed.reason, 'malformed'); assert.equal(malformed.approved, false); assert.match(malformed.message, /^line 6: recorded/);
  record(f.project, front({ purposes: '[advice, chat]' }));
  assert.match(reason().message, /^line 4: purposes may contain only advice, review, image/);
  record(f.project, front({ peer: 'claude' }));
  assert.match(reason().message, /^line 2: peer must be codex/);
  record(f.project, front({ status: 'revoked' }));
  assert.deepEqual([reason('--purpose', 'advice').reason, reason().purposes], ['revoked', ['advice', 'review']]);
  record(f.project, front({ project: path.join(f.base, 'other') }));
  assert.equal(reason('--purpose', 'advice').reason, 'project_mismatch');
  record(f.project, front());
  assert.deepEqual(reason('--purpose', 'review'), { ok: true, approved: true, reason: 'approved', record: file, purposes: ['advice', 'review'] });
  assert.equal(reason().reason, 'approved');
  assert.deepEqual([reason('--purpose', 'image').reason, reason('--purpose', 'image').approved], ['purpose_missing', false]);
  // project paths are compared after realpath, and block lists are accepted.
  const link = path.join(f.base, 'link');
  fs.symlinkSync(f.project, link);
  record(f.project, front({ project: link, purposes: '\n  - advice' }));
  assert.equal(reason('--purpose', 'advice').reason, 'approved');
  assert.equal(approval('relative', '--purpose', 'advice').data.error.code, 'invalid_options');
  assert.equal(approval(f.project, '--purpose', 'chat').data.error.code, 'invalid_options');
});

test('the migrated harness approval records follow the shared frontmatter form', async t => {
  const f = fixture(t), records = path.join(root, 'docs/harness/authorizations');
  const { checkApproval, ROLE_PURPOSE } = await import(require('node:url').pathToFileURL(source).href);
  assert.deepEqual(ROLE_PURPOSE, { ideator: 'advice', consultant: 'advice', critic: 'advice', reviewer: 'review' });
  const relocate = name => {
    const text = fs.readFileSync(path.join(records, name), 'utf8');
    assert.match(text, /^---\npeer: \w+\nproject: \/Users\/kan\/dev\/harness\npurposes: \[[\w, ]+\]\nstatus: approved\nrecorded: \d{4}-\d{2}-\d{2}\n---\n\n# /);
    write(path.join(f.project, 'docs/harness/authorizations', name), text.replace('project: /Users/kan/dev/harness', `project: ${f.project}`));
  };
  relocate('codex-send.md'); relocate('claude-send.md');
  for (const purpose of ['advice', 'review']) assert.equal((await checkApproval({ project: f.project, purpose })).reason, 'approved', purpose);
  assert.equal((await checkApproval({ project: f.project, purpose: 'image' })).reason, 'purpose_missing');
  const claude = await checkApproval({ project: f.project, purpose: 'advice', peer: 'claude' });
  assert.deepEqual([claude.reason, claude.purposes], ['approved', ['advice']]);
  assert.equal((await checkApproval({ project: f.project, purpose: 'review', peer: 'claude' })).reason, 'purpose_missing');
});

test('collaboration settings resolve relative to the running host and reject unknown modes', t => {
  const f = fixture(t);
  assert.deepEqual(command(f, 'status', '--host', 'claude').data.collaboration, { host: 'claude', peer: 'codex', tasks: { advice: 'peer', code_review: 'both', html_mock: 'host', image_generation: 'peer' } });
  assert.deepEqual(command(f, 'status').data.collaboration.tasks, { advice: 'peer', code_review: 'both', html_mock: 'peer', image_generation: 'host' });
  write(path.join(f.project, '.harness.json'), { collaboration: { code_review: 'off' } });
  assert.equal(command(f, 'status', '--host', 'claude').data.collaboration.tasks.code_review, 'off');
  write(path.join(f.project, '.harness.json'), { collaboration: { code_review: 'gemini' } });
  assert.equal(command(f, 'status').code, 2);
});
