const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const relative = 'consult-claude/scripts/consult.mjs';
const source = path.join(root, 'plugins/codex-harness/skills/harness', relative);
const input = { role: 'ideator', task: '短い会議の改善案', constraints: ['無料'], criteria: ['全員が話せる'] };
const secret = 'PRIVATE_PROMPT_TOKEN_9d5b';
const posix = { skip: process.platform === 'win32' };

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'consult-claude-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const cli = path.join(base, 'claude'), log = path.join(base, 'calls.jsonl');
  fs.writeFileSync(cli, `#!${process.execPath}
const fs = require('node:fs'), cp = require('node:child_process');
const args = process.argv.slice(2), mode = process.env.CONSULT_TEST_MODE;
let data = '';
process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.CONSULT_TEST_LOG, JSON.stringify({ args, cwd: process.cwd(), input: data }) + '\\n');
  if (args[0] === '--help') {
    console.log(mode === 'incompatible' ? '--print' : (mode === 'no-schema' ? '' : '--json-schema ') + '--print --safe-mode --tools --strict-mcp-config --mcp-config --setting-sources --settings --permission-mode --permission-prompts --no-session-persistence --disable-slash-commands --output-format'); return;
  }
  if (args[0] === 'auth') {
    if (mode === 'auth-json') { console.log('bad json ${secret}'); return; }
    if (mode === 'auth-missing') { console.log(JSON.stringify({ email: '${secret}@example.test' })); return; }
    if (mode === 'auth-false') { console.log(JSON.stringify({ loggedIn: false, email: '${secret}@example.test' })); return; }
    console.log(JSON.stringify({ loggedIn: mode !== 'unauthenticated', email: '${secret}@example.test', orgId: '${secret}' }));
    if (mode === 'unauthenticated') process.exitCode = 1;
    return;
  }
  if (mode === 'nonzero') { console.error('${secret}'); console.log(data); process.exitCode = 1; return; }
  if (mode === 'invalid-json') { console.log('bad json ${secret}'); return; }
  if (mode === 'overflow') { process.stdout.write('x'.repeat(2 * 1024 * 1024)); return; }
  if (mode === 'stderr-overflow') { process.stderr.write('x'.repeat(2 * 1024 * 1024)); return; }
  if (mode === 'hang') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); return; }
  if (mode === 'descendant') {
    cp.spawn(process.execPath, ['-e', 'const fs = require("node:fs"); fs.writeFileSync(process.env.CONSULT_TEST_READY, JSON.stringify({ pid: process.pid, writeAt: Date.now() + 6500 })); setTimeout(() => fs.writeFileSync(process.env.CONSULT_TEST_MARKER, "leaked"), 6500)'], { stdio: 'inherit' });
    setInterval(() => {}, 1000); return;
  }
  if (mode === 'is-error') { console.log(JSON.stringify({ type: 'result', is_error: true, result: '${secret}' })); return; }
  if (mode === 'empty') { console.log(JSON.stringify({ result: '' })); return; }
  if (mode === 'advice-json') { console.log(JSON.stringify({ result: 'plain text ${secret}' })); return; }
  if (mode === 'advice-summary') { console.log(JSON.stringify({ result: '{}' })); return; }
  if (mode === 'subtype') { console.log(JSON.stringify({ type: 'result', subtype: 'error_max_turns', result: '{"summary":"partial"}' })); return; }
  const fence = String.fromCharCode(96).repeat(3), review = data.includes('"role":"reviewer"'), advice ={ summary: '順番に短く共有する', points: ['1人1分'], ...(review ? { verdict: mode === 'review-none' ? 'none' : 'NEEDS_WORK', findings: [{ severity: 'high', location: 'a.txt:1', issue: '値が変わった' }] } : {}) };
  if (mode === 'fenced') { console.log(JSON.stringify({ type: 'result', result: 'Here is my advice:\\n' + fence + 'json\\n' + JSON.stringify(advice) + '\\n' + fence + '\\nThanks.' })); return; }
  if (mode === 'prefaced') { console.log(JSON.stringify({ type: 'result', result: 'Sure. ' + JSON.stringify({ ...advice, verdict: 'PASS' }) + ' Hope this helps.' })); return; }
  if (mode === 'structured') { console.log(JSON.stringify({ type: 'result', subtype: 'success', result: 'not json ${secret}', structured_output: { summary: 'structured wins', verdict: 'BLOCKED', risks: ['r'] } })); return; }
  if (mode === 'bad-list') { console.log(JSON.stringify({ result: JSON.stringify({ summary: 's', points: 'one' }) })); return; }
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(advice) }));
});
`, { mode: 0o755 });
  const env = { ...process.env, PATH: base + path.delimiter + process.env.PATH, CONSULT_TEST_LOG: log, CONSULT_TEST_MARKER: path.join(base, 'descendant-marker'), CONSULT_TEST_READY: path.join(base, 'descendant-ready.json') };
  return { base, cli, log, env, calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [] };
}
function run(f, { mode = '', value = input, args = [], helper = source } = {}) {
  const result = spawnSync(process.execPath, [helper, ...args], { input: typeof value === 'string' ? value : JSON.stringify(value), env: { ...f.env, CONSULT_TEST_MODE: mode }, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  return { ...result, data: JSON.parse(result.stdout) };
}
test('consultation uses isolated cwd, no tools/customizations, stdin context and optional model only', posix, t => {
  const f = fixture(t), value = { ...input, context: secret + '; $(echo SHELL_EXPANSION)' };
  const result = run(f, { value }); assert.equal(result.status, 0, result.stdout); assert.equal(result.data.ok, true); assert.equal(result.data.advice.summary, '順番に短く共有する');
  assert.deepEqual(result.data, { ok: true, peer: 'claude', role: 'ideator', followup: 0, commands: 0, advice: { summary: '順番に短く共有する', verdict: 'none', points: ['1人1分'], risks: [], recommendations: [], questions: [], findings: [] } });
  assert.equal(result.stderr, ''); assert.equal(result.stdout.includes(secret), false);
  const calls = f.calls(); assert.deepEqual(calls.map(call => call.args[0]), ['--help', 'auth', '--print']);
  const actual = calls[2]; assert.equal(actual.args.some(arg => arg.includes(secret)), false); assert.ok(actual.input.includes(secret));
  for (const [flag, expected] of [['--tools', ''], ['--mcp-config', '{"mcpServers":{}}'], ['--setting-sources', ''], ['--settings', '{"disableAllHooks":true}'], ['--permission-mode', 'dontAsk'], ['--permission-prompts', 'none'], ['--output-format', 'json']]) assert.equal(actual.args[actual.args.indexOf(flag) + 1], expected, flag);
  for (const flag of ['--safe-mode', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands']) assert.ok(actual.args.includes(flag), flag);
  const schema = JSON.parse(actual.args[actual.args.indexOf('--json-schema') + 1]);
  assert.deepEqual(schema.required, ['summary', 'verdict', 'points', 'risks', 'recommendations', 'questions', 'findings']); assert.deepEqual(schema.properties.findings.items.required, ['severity', 'location', 'issue', 'evidence']);
  assert.equal(actual.args.includes('--model'), false); assert.notEqual(actual.cwd, root); assert.equal(fs.existsSync(actual.cwd), false);
  assert.ok(calls.every(call => call.cwd === actual.cwd));
  const selected = run(f, { args: ['--model', 'chosen-model'] }); assert.equal(selected.status, 0);
  const finalArgs = f.calls().at(-1).args; assert.equal(finalArgs[finalArgs.indexOf('--model') + 1], 'chosen-model');
});

test('read-only check summarizes authentication without exposing account fields or making inference calls', posix, t => {
  const f = fixture(t), result = run(f, { args: ['--check'] });
  assert.equal(result.status, 0); assert.deepEqual(result.data, { ok: true, cli: 'compatible', authenticated: true });
  assert.equal(result.stdout.includes(secret), false); assert.equal(result.stderr, ''); assert.equal(f.calls().length, 2);
  const failed = run(f, { mode: 'unauthenticated', args: ['--check'] }); assert.equal(failed.data.error.code, 'auth_unavailable'); assert.match(failed.data.error.message, /sandbox\/keychain/);
  assert.equal(failed.stdout.includes(secret), false); assert.equal(failed.stderr, '');
});

for (const mode of ['unauthenticated', 'auth-false', 'auth-missing', 'auth-json']) {
  test(`read-only ${mode} check offers a sanitized host-permission hint without retrying or consulting`, posix, t => {
    const f = fixture(t), result = run(f, { mode, args: ['--check'] });
    assert.equal(result.status, 1); assert.equal(result.data.error.code, 'auth_unavailable');
    assert.match(result.data.error.message, /could not confirm an existing login/);
    assert.match(result.data.error.message, /rerun this same command once with host-approved escalation if available and not denied/);
    assert.match(result.data.error.message, /never elevates permissions or retries/);
    assert.equal(result.stdout.includes(secret), false); assert.equal(result.stderr, '');
    assert.deepEqual(f.calls().map(call => call.args), [['--help'], ['auth', 'status']]);
    for (const call of f.calls()) assert.equal(fs.existsSync(call.cwd), false);
  });
}

for (const [mode, code] of [['incompatible', 'incompatible_cli'], ['unauthenticated', 'auth_unavailable'], ['auth-json', 'auth_unavailable'], ['nonzero', 'cli_failed'], ['invalid-json', 'invalid_response'], ['is-error', 'response_error'], ['subtype', 'response_error'], ['empty', 'empty_response'], ['advice-json', 'invalid_advice'], ['advice-summary', 'invalid_advice'], ['bad-list', 'invalid_advice'], ['no-schema', 'incompatible_cli'], ['overflow', 'output_limit'], ['stderr-overflow', 'output_limit'], ['hang', 'timeout']]) {
  test(`fails closed for ${mode} without leaking diagnostics`, posix, t => {
    // Response classification must not race the help/auth startup under parallel suites.
    const f = fixture(t), result = run(f, { mode, value: { ...input, context: secret }, args: ['--timeout-ms', mode === 'hang' ? '3000' : '7000'] });
    assert.equal(result.status, 1); assert.equal(result.data.ok, false); assert.equal(result.data.error.code, code, result.stdout); assert.equal(result.stdout.includes(secret), false); assert.equal(result.stderr, '');
    for (const call of f.calls()) assert.equal(fs.existsSync(call.cwd), false);
  });
}

test('missing CLI returns a sanitized failure', posix, t => {
  const f = fixture(t); fs.unlinkSync(f.cli); f.env.PATH = f.base;
  const result = run(f); assert.equal(result.status, 1); assert.equal(result.data.error.code, 'cli_unavailable'); assert.equal(result.stderr, '');
});

test('timeout stops descendants before they can mutate and removes the temp cwd', posix, async t => {
  const f = fixture(t), child = spawn(process.execPath, [source, '--timeout-ms', '5000'], { env: { ...f.env, CONSULT_TEST_MODE: 'descendant' } });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
  let out = '', err = '', descendant;
  child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
  child.stdin.end(JSON.stringify(input));
  const completed = new Promise(resolve => child.on('close', code => resolve({ code, out, err })));
  const guard = setTimeout(() => child.kill('SIGKILL'), 10000);
  t.after(() => { clearTimeout(guard); if (child.exitCode === null) child.kill('SIGKILL'); if (descendant && alive(descendant.pid)) process.kill(descendant.pid, 'SIGKILL'); });
  const readyDeadline = Date.now() + 4500;
  while (!fs.existsSync(f.env.CONSULT_TEST_READY) && Date.now() < readyDeadline) await sleep(20);
  assert.equal(fs.existsSync(f.env.CONSULT_TEST_READY), true, 'the descendant must actually start before testing timeout cleanup');
  descendant = JSON.parse(fs.readFileSync(f.env.CONSULT_TEST_READY, 'utf8'));
  assert.ok(Number.isInteger(descendant.pid)); assert.equal(alive(descendant.pid), true, 'ready evidence must come from a live descendant');
  const result = await completed;
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.out).error.code, 'timeout'); assert.equal(result.err, '');
  const reapedDeadline = Date.now() + 1000;
  while (alive(descendant.pid) && Date.now() < reapedDeadline) await sleep(20);
  assert.equal(alive(descendant.pid), false, 'the started descendant must no longer be alive after timeout');
  await sleep(Math.max(0, descendant.writeAt + 150 - Date.now()));
  assert.equal(fs.existsSync(f.env.CONSULT_TEST_MARKER), false);
  for (const call of f.calls()) assert.equal(fs.existsSync(call.cwd), false);
});

test('interrupting the helper stops its active child and removes its isolated directory', posix, async t => {
  const f = fixture(t);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [source], { env: { ...f.env, CONSULT_TEST_MODE: 'hang' } });
    let out = '', err = '';
    child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
    child.stdin.end(JSON.stringify(input));
    const guard = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('helper did not terminate')); }, 5000);
    const poll = setInterval(() => { if (f.calls().some(call => call.args[0] === '--print')) { clearInterval(poll); child.kill('SIGTERM'); } }, 20);
    child.on('close', code => { clearTimeout(guard); clearInterval(poll); resolve({ code, out, err }); });
  });
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.out).error.code, 'interrupted'); assert.equal(result.err, '');
  for (const call of f.calls()) assert.equal(fs.existsSync(call.cwd), false);
});

test('invalid input, oversize input and followup boundaries fail before any Claude invocation', posix, t => {
  const f = fixture(t);
  for (const value of ['bad json ' + secret, { ...input, role: 'executor' }, { ...input, candidate: 'Codex idea' }, { ...input, previous: 'reply' }, { ...input, followup: 2, previous: 'reply' }, { ...input, followup: 1 }, { ...input, unknown: secret }, { ...input, constraints: secret }]) {
    const result = run(f, { value }); assert.equal(result.status, 1); assert.equal(result.data.error.code, 'invalid_input'); assert.equal(result.stdout.includes(secret), false);
  }
  const large = run(f, { value: { ...input, context: 'x'.repeat(256 * 1024) } }); assert.equal(large.data.error.code, 'input_limit');
  assert.deepEqual(f.calls(), []);
  const followup = run(f, { value: { ...input, followup: 1, previous: { summary: 'first advice' }, candidate: 'Codex idea' } }); assert.equal(followup.status, 0); assert.equal(followup.data.followup, 1);
  for (const role of ['consultant', 'critic']) assert.equal(run(f, { value: { ...input, role, candidate: { proposal: 'plan' } } }).status, 0);
});

test('file input is explicit and stdin waiting has a deadline', posix, async t => {
  const f = fixture(t), file = path.join(f.base, 'input with spaces.json'); fs.writeFileSync(file, JSON.stringify(input));
  assert.equal(run(f, { args: ['--input', file], value: '' }).status, 0);
  const missing = run(f, { args: ['--input', path.join(f.base, secret)] }); assert.equal(missing.data.error.code, 'input_unavailable'); assert.equal(missing.stdout.includes(secret), false);
  const fifo = path.join(f.base, 'input-pipe');
  const mkfifo = spawnSync('mkfifo', [fifo]); assert.equal(mkfifo.status, 0);
  assert.equal(run(f, { args: ['--input', fifo] }).data.error.code, 'input_unavailable');
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [source, '--timeout-ms', '100'], { env: f.env }); let out = '', err = '';
    child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
    child.on('close', code => resolve({ code, out, err }));
  });
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.out).error.code, 'input_timeout'); assert.equal(result.err, '');
});

test('build, discovered plugin and permanent install preserve a self-contained usable consultation skill', posix, t => {
  const f = fixture(t), installer = require('../dist/skill/install.js');
  const installed = installer.install({ home: path.join(f.base, 'home') });
  for (const skill of [path.join(root, 'dist/skill/consult-claude'), path.join(root, 'dist/plugins/codex-harness/skills/harness/consult-claude'), path.join(root, 'dist/plugins/codex-harness/skills/consult-claude'), path.join(installed.target, 'consult-claude')]) {
    for (const name of ['SKILL.md', 'agents/openai.yaml', 'scripts/consult.mjs']) assert.deepEqual(fs.readFileSync(path.join(skill, name)), fs.readFileSync(path.join(path.dirname(path.dirname(source)), name)), skill + '/' + name);
    const result = run(f, { helper: path.join(skill, 'scripts/consult.mjs'), args: ['--check'] }); assert.equal(result.status, 0, result.stdout);
  }
  const links = require('../scripts/check-doc-links.cjs'); assert.deepEqual(links.check(installed.target, { skillOnly: true }).errors, []);
  assert.match(fs.readFileSync(path.join(f.base, 'home/.codex/AGENTS.md'), 'utf8'), /pure ideation, strategy consultation/);
  assert.equal(installer.install({ home: path.join(f.base, 'home') }).status, 'unchanged'); installer.uninstall({ home: path.join(f.base, 'home') });
});

test('programmatic validation enforces the same initial independence and explicit followup contract', async () => {
  const { validateInput } = await import(pathToFileURL(source));
  assert.equal(validateInput(input).followup, 0);
  assert.throws(() => validateInput({ ...input, candidate: 'existing' }), /initial ideator/);
  assert.throws(() => validateInput({ ...input, followup: 1 }), /previous/);
});

function repository(t, { big = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consult-claude-repo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => { const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '-q'); fs.writeFileSync(path.join(dir, 'a.txt'), 'old value\n'); git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'new value REVIEW_MARKER\n');
  if (big) fs.writeFileSync(path.join(dir, 'big.txt'), 'line of filler text for the diff limit\n'.repeat(8000));
  git('add', '.'); git('commit', '-qm', 'head');
  return { dir, base, head: git('rev-parse', 'HEAD') };
}
const review = repo => ({ role: 'reviewer', task: '変更をレビューする', repository: repo.dir, base: repo.base, head: repo.head, criteria: ['1. 値を保つ'] });

test('reviewer reads the real diff into the prompt and runs in the repository with Read, Grep and Glob only', posix, t => {
  const f = fixture(t), repo = repository(t), result = run(f, { value: review(repo) });
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.data.peer, 'claude'); assert.equal(result.data.role, 'reviewer'); assert.equal(result.data.commands, 0);
  assert.equal(result.data.advice.verdict, 'NEEDS_WORK'); assert.deepEqual(result.data.advice.findings, [{ severity: 'high', location: 'a.txt:1', issue: '値が変わった', evidence: '' }]);
  const calls = f.calls(), actual = calls[2];
  assert.deepEqual(calls.map(call => call.args[0]), ['--help', 'auth', '--print']);
  assert.equal(actual.cwd, fs.realpathSync(repo.dir)); assert.notEqual(calls[0].cwd, actual.cwd); assert.equal(fs.existsSync(calls[0].cwd), false);
  assert.equal(actual.args[actual.args.indexOf('--tools') + 1], 'Read,Grep,Glob');
  for (const flag of ['--safe-mode', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--json-schema']) assert.ok(actual.args.includes(flag), flag);
  assert.equal(actual.args[actual.args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.match(actual.input, /git diff --stat [0-9a-f]+\.\.[0-9a-f]+:/); assert.match(actual.input, /\+new value REVIEW_MARKER/); assert.match(actual.input, /-old value/);
  assert.doesNotMatch(actual.input, /diff truncated/);
  const none = run(f, { mode: 'review-none', value: review(repo) }); assert.equal(none.data.error.code, 'invalid_advice'); assert.match(none.data.error.message, /PASS, NEEDS_WORK or BLOCKED/);
});

test('reviewer diff is capped at 200 KiB and says so', posix, t => {
  const f = fixture(t), repo = repository(t, { big: true }), result = run(f, { value: review(repo) });
  assert.equal(result.status, 0, result.stdout);
  const prompt = f.calls()[2].input; assert.match(prompt, /diff truncated at 200 KiB/); assert.ok(Buffer.byteLength(prompt) < 260 * 1024);
});

test('reviewer inputs are validated with field names before any Claude call', posix, t => {
  const f = fixture(t), repo = repository(t), value = review(repo);
  for (const [bad, message] of [
    [{ ...value, criteria: undefined }, /criteria is required for role reviewer/],
    [{ ...value, repository: 'relative/path' }, /repository must be an absolute path/],
    [{ ...value, base: 'main' }, /base must be a commit ID/],
    [{ ...value, head: undefined }, /head is required for role reviewer/],
    [{ ...input, repository: repo.dir }, /repository is allowed only for role reviewer/],
    [{ ...value, repository: path.join(repo.dir, 'missing') }, /repository does not exist/],
  ]) {
    const result = run(f, { value: JSON.parse(JSON.stringify(bad)) }); assert.equal(result.status, 1); assert.equal(result.data.error.code, 'invalid_input'); assert.match(result.data.error.message, message);
  }
  assert.deepEqual(f.calls(), []);
  const unknownCommit = run(f, { value: { ...value, base: 'deadbeefdeadbeef' } }); assert.equal(unknownCommit.data.error.code, 'invalid_input'); assert.match(unknownCommit.data.error.message, /git diff base\.\.head failed/);
});

test('fenced or prefaced replies are accepted, structured_output wins and advisory verdicts become none', posix, t => {
  const f = fixture(t);
  const fenced = run(f, { mode: 'fenced' }); assert.equal(fenced.status, 0, fenced.stdout); assert.equal(fenced.data.advice.summary, '順番に短く共有する');
  const prefaced = run(f, { mode: 'prefaced', value: { ...input, role: 'critic', candidate: 'plan' } }); assert.equal(prefaced.status, 0, prefaced.stdout); assert.equal(prefaced.data.advice.verdict, 'none');
  const structured = run(f, { mode: 'structured', value: { ...input, role: 'consultant' } }); assert.equal(structured.status, 0, structured.stdout);
  assert.deepEqual(structured.data.advice, { summary: 'structured wins', verdict: 'none', points: [], risks: ['r'], recommendations: [], questions: [], findings: [] });
  const plain = run(f, { mode: 'advice-json', value: { ...input, context: secret } }); assert.equal(plain.data.error.code, 'invalid_advice'); assert.match(plain.data.error.message, /\d+-character non-JSON response/); assert.equal(plain.stdout.includes(secret), false);
});

test('input errors name the field and the expected type, and object context becomes JSON text', posix, async t => {
  const f = fixture(t);
  for (const [value, message] of [
    [{ ...input, criteria: ['a', 'b', ''] }, /criteria\[2\] must be a nonempty string/],
    [{ ...input, foo: secret }, /unsupported field: "foo"/],
    [{ ...input, role: 'executor' }, /role must be one of ideator, consultant, critic, reviewer/],
    [{ ...input, task: 3 }, /task must be a nonempty string/],
    [{ ...input, context: 5 }, /context must be a string/],
    [{ ...input, constraints: 'free' }, /constraints must be an array of nonempty strings/],
    [{ ...input, followup: 2 }, /followup must be 0 or 1/],
  ]) {
    const result = run(f, { value }); assert.equal(result.data.error.code, 'invalid_input'); assert.match(result.data.error.message, message); assert.equal(result.stdout.includes(secret), false);
  }
  assert.deepEqual(f.calls(), []);
  const { validateInput, purposeForRole } = await import(pathToFileURL(source));
  assert.equal(validateInput({ ...input, context: { team: 4, notes: ['x'] } }).context, '{"team":4,"notes":["x"]}');
  assert.equal(validateInput({ ...input, context: ['a'] }).context, '["a"]');
  const ok = run(f, { value: { ...input, context: { marker: 'CTX_MARK' } } }); assert.equal(ok.status, 0, ok.stdout); assert.ok(f.calls().at(-1).input.includes('{\\"marker\\":\\"CTX_MARK\\"}'));
  assert.deepEqual(['ideator', 'consultant', 'critic', 'reviewer'].map(purposeForRole), ['advice', 'advice', 'advice', 'review']);
});

test('silent non-TTY stdin fails fast with input_timeout and a TTY fails at once', posix, async t => {
  const f = fixture(t), started = Date.now();
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [source], { env: { ...f.env, CONSULT_CLAUDE_FIRST_BYTE_MS: '200' } }); let out = '', err = '';
    child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
    const guard = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.on('close', code => { clearTimeout(guard); resolve({ code, out, err }); });
  });
  assert.equal(result.code, 1); assert.equal(result.err, ''); assert.ok(Date.now() - started < 4000);
  const error = JSON.parse(result.out).error; assert.equal(error.code, 'input_timeout'); assert.match(error.message, /heredoc/); assert.match(error.message, /--input/);
  const empty = run(f, { value: '' }); assert.equal(empty.data.error.code, 'invalid_input');
  assert.deepEqual(f.calls(), []);
  const python = spawnSync('python3', ['-I', '-c', 'import pty,sys; pty.spawn(sys.argv[1:])', process.execPath, source], { input: '', env: f.env, encoding: 'utf8', timeout: 5000 });
  if (python.error || python.status === null) { t.diagnostic('python3 pty unavailable; TTY case skipped'); return; }
  const tty = JSON.parse(python.stdout.trim().split(/\r?\n/).at(-1)).error; assert.equal(tty.code, 'input_unavailable'); assert.match(tty.message, /terminal/); assert.match(tty.message, /heredoc/);
});

test('--approval reports every reason, matches the project by realpath and never calls Claude', posix, t => {
  const f = fixture(t), project = fs.mkdtempSync(path.join(os.tmpdir(), 'consult-claude-project-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const real = fs.realpathSync(project), dir = path.join(project, 'docs/harness/authorizations'), record = path.join(real, 'docs/harness/authorizations/claude-send.md');
  const link = path.join(f.base, 'project-link'); fs.symlinkSync(project, link);
  const write = text => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'claude-send.md'), text); };
  const front = (fields = {}) => '---\n' + Object.entries({ peer: 'claude', project: real, purposes: '[advice, review]', status: 'approved', recorded: '2026-10-24', ...fields }).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n# 記録\n';
  const ask = (args, target = project) => { const result = run(f, { args: ['--approval', '--project', target, ...args], value: '' }); assert.equal(result.status, 0, result.stdout); assert.equal(result.data.ok, true); return result.data; };
  assert.deepEqual(ask(['--purpose', 'advice']), { ok: true, approved: false, reason: 'missing', record, purposes: [] });
  write('# 記録だけ\n'); let data = ask([]); assert.equal(data.reason, 'malformed'); assert.match(data.message, /line 1/);
  write(front({ purposes: 'advice' })); data = ask([]); assert.equal(data.reason, 'malformed'); assert.match(data.message, /line 4: purposes/);
  write(front({ purposes: '[advice, chat]' })); assert.equal(ask([]).reason, 'malformed');
  write(front({ peer: 'codex' })); data = ask([]); assert.equal(data.reason, 'malformed'); assert.match(data.message, /line 2: peer must be claude/);
  write(front({ recorded: null })); data = ask([]); assert.equal(data.reason, 'malformed'); assert.match(data.message, /missing recorded/);
  write(front({ status: 'revoked' })); assert.deepEqual(ask(['--purpose', 'advice']), { ok: true, approved: false, reason: 'revoked', record, purposes: ['advice', 'review'] });
  write(front({ project: path.join(real, 'other') })); assert.equal(ask(['--purpose', 'advice']).reason, 'project_mismatch');
  write(front({ purposes: '[advice]' })); assert.deepEqual(ask(['--purpose', 'review']), { ok: true, approved: false, reason: 'purpose_missing', record, purposes: ['advice'] });
  write(front()); assert.deepEqual(ask(['--purpose', 'review']), { ok: true, approved: true, reason: 'approved', record, purposes: ['advice', 'review'] });
  assert.equal(ask([], link).approved, true);
  write(front({ project: link })); assert.equal(ask(['--purpose', 'advice']).approved, true);
  for (const args of [['--approval', '--project', 'relative'], ['--approval', '--project', project, '--purpose', 'chat'], ['--approval'], ['--approval', '--project', project, '--check'], ['--project', project]]) {
    const result = run(f, { args, value: '' }); assert.equal(result.status, 1); assert.equal(result.data.error.code, 'invalid_options');
  }
  assert.deepEqual(f.calls(), []);
});
