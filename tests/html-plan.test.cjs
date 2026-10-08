const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const skill = path.resolve(__dirname, '../authoring-skills/codex-html-plan');
const runtime = require(path.join(skill, 'runtime/htmlplan.js'));
const review = runtime.review;
const meta = { planId: 'TASK-42', version: '2', scope: '全体: 仕様1–3とAC1–4' };
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'html-plan-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function pack(input, ...args) {
  return spawnSync(process.execPath, [path.join(skill, 'runtime/pack.mjs'), input, ...args], { encoding: 'utf8' });
}
function page(body = '', metadata = 'data-plan-id="TASK-42" data-version="2" data-scope="全体" data-approval="pending"') {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>検証</title><link rel="stylesheet" href="htmlplan.css"><script src="htmlplan.js" defer></script></head><body ${metadata}><h1>検証</h1>${body}</body></html>`;
}
test('feedback identity isolates versions, plans and approval scopes', () => {
  const key = review.key(meta);
  for (const changed of [{ version: '3' }, { planId: 'TASK-43' }, { scope: '仕様1だけ' }]) {
    const next = { ...meta, ...changed };
    assert.notEqual(review.key(next), key);
    assert.equal(review.restore(next, { identity: review.identity(meta), answers: { filter: 'mine' }, approval: 'approved' }), null);
  }
  const feedback = review.restore(meta, { identity: review.identity(meta), answers: { filter: 'mine' }, seen: { q1: 1 }, approval: 'approved', authorization: true, approvalDraft: 'approve' });
  assert.deepEqual(feedback, { answers: { filter: 'mine' }, seen: { q1: 1 } });
  assert.equal(review.restore(meta, { answers: {} }), null);
});
test('approval drafts default to pending, stay separate and bind explicit scope', () => {
  const original = { ...meta };
  assert.match(review.approvalDraft(meta, ''), /まだ承認していません/);
  assert.match(review.approvalDraft(meta, 'approve'), /仕様版 2/);
  assert.match(review.approvalDraft(meta, 'approve'), /範囲「全体: 仕様1–3とAC1–4」/);
  assert.match(review.approvalDraft(meta, 'partial', '仕様1だけ'), /対象範囲: 仕様1だけ/);
  assert.throws(() => review.approvalDraft(meta, 'partial', '  '), /範囲/);
  assert.match(review.approvalDraft(meta, 'revise'), /開始は承認しません/);
  assert.match(review.header(meta, '未解決事項への回答'), /計画ID: TASK-42\n仕様版: 2\n対象範囲:/);
  assert.deepEqual(meta, original); // producing a draft does not authorize or mutate the plan
});
test('Japanese sample packs offline, with pending identity and no unresolved questions', t => {
  const root = workspace(t), output = path.join(root, 'sample.html');
  const result = pack(path.join(skill, 'examples/task-board.src.html'), '--root', skill, '-o', output);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /⚠|✗/);
  const html = fs.readFileSync(output, 'utf8');
  assert.match(html, /<style data-htmlplan>/);
  assert.match(html, /<script data-htmlplan>/);
  assert.doesNotMatch(html, /<script\b[^>]*src=|<link\b[^>]*htmlplan\.css/);
  assert.match(html, /data-approval="pending"/);
  assert.match(html, /data-persistence="off"/);
  assert.doesNotMatch(html, /<doc-ask\b/);
});
test('pack fills local code and images without altering their contents', t => {
  const root = workspace(t), source = path.join(root, 'plan.src.html'), output = path.join(root, 'plan.html');
  fs.writeFileSync(path.join(root, 'example.ts'), 'export const label = "日本語";\n');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xUAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(root, 'image.png'), png);
  fs.writeFileSync(source, page('<doc-code src="example.ts" lines="1-1" lang="ts"></doc-code><img src="image.png" alt="検証">'));
  const result = pack(source, '-o', output);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const html = fs.readFileSync(output, 'utf8');
  assert.match(html, /export const label = "日本語"/);
  assert.ok(html.includes('data:image/png;base64,' + png.toString('base64')));
});
test('pack rejects escaped symlink and secret-named files before overwriting output', { skip: process.platform === 'win32' }, t => {
  const root = workspace(t), outside = path.join(root, 'outside'), folder = path.join(root, 'plan');
  fs.mkdirSync(outside); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(outside, 'code.ts'), 'export const external = 1;');
  fs.symlinkSync(path.join(outside, 'code.ts'), path.join(folder, 'escape.ts'));
  fs.writeFileSync(path.join(folder, '.env'), 'not an actual secret');
  const source = path.join(folder, 'plan.src.html'), output = path.join(folder, 'out.html');
  for (const file of ['escape.ts', '.env']) {
    fs.writeFileSync(source, page(`<doc-code src="${file}" lang="ts"></doc-code>`));
    fs.writeFileSync(output, 'preserve previous reviewed artifact');
    const result = pack(source, '-o', output);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /outside --root|secrets file/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'preserve previous reviewed artifact');
  }
});
test('pack refuses missing identity, imported approval status and broken diagrams', t => {
  const root = workspace(t), source = path.join(root, 'invalid.html'), output = path.join(root, 'out.html');
  for (const html of [page('', ''), page('', 'data-plan-id="x" data-version="1" data-scope="all" data-approval="approved"'), page('<doc-flow><script type="text/plain">not valid syntax</script></doc-flow>')]) {
    fs.writeFileSync(source, html);
    const result = pack(source, '-o', output);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(fs.existsSync(output), false);
  }
});
test('sample document links resolve and canonical version is shared', () => {
  const examples = path.join(skill, 'examples'), source = fs.readFileSync(path.join(examples, 'task-board.src.html'), 'utf8');
  for (const match of source.matchAll(/href="(records\/[^"]+)"/g)) assert.equal(fs.existsSync(path.join(examples, match[1])), true, match[1]);
  const task = fs.readFileSync(path.join(examples, 'records/TASK-42.md'), 'utf8');
  assert.match(task, /計画ID: TASK-42/); assert.match(task, /仕様版: 2/); assert.match(task, /承認状態: pending/);
  for (const file of ['TASK-42.md', 'ADR-07.md', 'EXP-03.md', 'index.md']) {
    const record = fs.readFileSync(path.join(examples, 'records', file), 'utf8');
    for (const match of record.matchAll(/\]\(([^)]+)\)/g)) assert.equal(fs.existsSync(path.resolve(examples, 'records', match[1])), true, `${file} -> ${match[1]}`);
  }
  assert.equal(fs.existsSync(path.join(examples, 'records/LOG-01.md')), false);
});

test('packed runtime can initialize from head before body exists', () => {
  const vm = require('node:vm');
  const listeners = [];
  const document = {
    body: null,
    documentElement: { lang: 'ja' },
    readyState: 'loading',
    addEventListener: (event, callback) => listeners.push({ event, callback })
  };
  const context = vm.createContext({ document, console });
  const js = fs.readFileSync(path.join(skill, 'runtime/htmlplan.js'), 'utf8');
  assert.doesNotThrow(() => vm.runInContext(js, context));
  assert.ok(listeners.some(item => item.event === 'DOMContentLoaded'));
  assert.equal(context.HtmlPlan.review.key(meta), review.key(meta));
});

test('relocated skill packs under an ESM project without require-module support', t => {
  const root = workspace(t), relocated = path.join(root, 'installed', 'codex-html-plan');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.cpSync(skill, relocated, { recursive: true });
  const output = path.join(root, 'sample.html');
  const result = spawnSync(process.execPath, [
    '--no-experimental-require-module', path.join(relocated, 'runtime/pack.mjs'),
    path.join(relocated, 'examples/task-board.src.html'), '--root', relocated, '-o', output
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /<script data-htmlplan>/);
  const task = fs.readFileSync(path.join(relocated, 'examples/records/TASK-42.md'), 'utf8');
  const command = task.match(/```sh\s*\nopen "([^"]+)"\s*\n```/);
  assert.ok(command, 'TASK must provide an opening command');
  const target = path.resolve(relocated, command[1]);
  assert.equal(target, path.join(relocated, 'examples/task-board.plan.html'));
  assert.equal(fs.existsSync(target), true, 'the command resolves from the relocated skill root');
});
