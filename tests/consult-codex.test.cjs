const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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
  if (mode === 'bad_verdict') advice.verdict = 'PASS';
  fs.writeFileSync(out, JSON.stringify(advice));
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

test('forbidden tools, incomplete turns, wrong verdicts and missing login fail closed', t => {
  const f = setup(t), critic = { role: 'critic', task: 't' };
  assert.equal(consult(f, critic, 'tool').data.error.code, 'tool_forbidden');
  assert.equal(consult(f, critic, 'incomplete').data.error.code, 'response_error');
  assert.equal(consult(f, critic, 'bad_verdict').data.error.code, 'invalid_advice');
  const out = consult(f, critic, 'logged_out');
  assert.equal(out.code, 1); assert.equal(out.data.error.code, 'auth_unavailable');
  assert.equal(consult(f, { role: 'ideator', task: 't', candidate: 'x' }).data.error.code, 'invalid_input');
  assert.equal(consult(f, { ...critic, extra: 1 }).data.error.code, 'invalid_input');
  assert.deepEqual(consult(f, null, 'ok', '--check').data, { ok: true, cli: 'available', authenticated: true });
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
