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
    console.log(mode === 'incompatible' ? '--print' : '--print --safe-mode --tools --strict-mcp-config --mcp-config --setting-sources --settings --permission-mode --permission-prompts --no-session-persistence --disable-slash-commands --output-format'); return;
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
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify({ summary: '順番に短く共有する', ideas: ['1人1分'] }) }));
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
  assert.equal(result.stderr, ''); assert.equal(result.stdout.includes(secret), false);
  const calls = f.calls(); assert.deepEqual(calls.map(call => call.args[0]), ['--help', 'auth', '--print']);
  const actual = calls[2]; assert.equal(actual.args.some(arg => arg.includes(secret)), false); assert.ok(actual.input.includes(secret));
  for (const [flag, expected] of [['--tools', ''], ['--mcp-config', '{"mcpServers":{}}'], ['--setting-sources', ''], ['--settings', '{"disableAllHooks":true}'], ['--permission-mode', 'dontAsk'], ['--permission-prompts', 'none'], ['--output-format', 'json']]) assert.equal(actual.args[actual.args.indexOf(flag) + 1], expected, flag);
  for (const flag of ['--safe-mode', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands']) assert.ok(actual.args.includes(flag), flag);
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
    assert.match(result.data.error.message, /one host-approved --check retry if available and not denied/);
    assert.match(result.data.error.message, /never elevates permissions or retries/);
    assert.equal(result.stdout.includes(secret), false); assert.equal(result.stderr, '');
    assert.deepEqual(f.calls().map(call => call.args), [['--help'], ['auth', 'status']]);
    for (const call of f.calls()) assert.equal(fs.existsSync(call.cwd), false);
  });
}

for (const [mode, code] of [['incompatible', 'incompatible_cli'], ['unauthenticated', 'auth_unavailable'], ['auth-json', 'auth_unavailable'], ['nonzero', 'cli_failed'], ['invalid-json', 'invalid_response'], ['is-error', 'response_error'], ['subtype', 'response_error'], ['empty', 'empty_response'], ['advice-json', 'invalid_advice'], ['advice-summary', 'invalid_advice'], ['overflow', 'output_limit'], ['stderr-overflow', 'output_limit'], ['hang', 'timeout']]) {
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
