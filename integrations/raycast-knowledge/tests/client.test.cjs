const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { invoke, safeUrl, cardMarkdown, search, freshnessLabel, freshnessShortLabel, RequestGate, resolvePaths } = require('../src/client.cjs');
const card = { capture_id: '123', title: 'title', url: 'https://example.com', kind: 'web', captured_at: '2026-01-01', analysis_state: 'current', note_excerpt: '', summary: null, appearance: null, tags: [], use_cases: [], evidence: [], source_limitations: [], analysis_limitations: [], image_limitations: [] };
test('passes hostile query and paths as argv without a shell, only read operations', async () => {
  const paths = { node: '/node space', cli: '/cli $(danger)', state: '/state space' };
  const query = '$(touch /tmp/should-not-exist) `echo dangerous` --force';
  await invoke(paths, 'search', ['--query', query], async (file, args, options) => {
    assert.equal(file, paths.node); assert.deepEqual(args, [paths.cli, 'search', '--query', query, '--state', paths.state]); assert.equal(options.shell, false);
    return { stdout: '{"ok":true}' };
  });
  await assert.rejects(invoke(paths, 'analyze'), /読み取り/);
});
test('only safe HTTP(S) page URLs enable actions', () => {
  for (const input of ['javascript:alert(1)', 'file:///tmp/a', 'data:text/html,a', 'https://user:pw@example.com', 'https://example.com\n']) assert.equal(safeUrl(input), null);
  assert.equal(safeUrl('https://example.com/a?q=x'), 'https://example.com/a?q=x');
});
test('untrusted Markdown cannot include remote images, HTML, or reference images', () => {
  const markdown = cardMarkdown({ ...card, summary: '![image](https://bad.test/a)\n<img src="https://bad.test/a">\n![image][ref]\n[ref]: https://bad.test/b' });
  assert.ok(!markdown.includes('![')); assert.ok(!markdown.includes('<img')); assert.ok(markdown.includes('\\!\\[image\\]'));
});
test('stale request is invalidated as soon as text changes', () => {
  const gate = new RequestGate(); const first = gate.invalidate(); gate.invalidate(); assert.equal(gate.current(first), false);
  const latest = gate.invalidate(); assert.equal(gate.current(latest), true);
});
test('throttled offline snapshot never claims sync success; cache cards remain', async () => {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), 'raycast-knowledge-test-'));
  try {
    await fs.mkdir(path.join(state, 'read')); await fs.writeFile(path.join(state, 'read/health.json'), JSON.stringify({ state: 'offline', reason: 'NETWORK' }));
    const result = await search({ node: '/node', cli: '/cli', state }, '', async () => ({ stdout: JSON.stringify({ freshness: { state: 'throttled' }, commit: 'abc', results: [card] }) }));
    assert.equal(result.freshness.state, 'offline'); assert.equal(result.results.length, 1); assert.match(freshnessLabel(result), /同期失敗.*キャッシュ/);
  } finally { await fs.rm(state, { recursive: true, force: true }); }
});
test('unconfigured, unsynced, busy, cached, current are distinguished', () => {
  for (const [value, label] of [ [{freshness:{state:'unconfigured'},results:[]}, /未設定/], [{freshness:{state:'offline'},results:[]}, /未同期/], [{freshness:{state:'busy'},results:[card]}, /busy.*キャッシュ/], [{freshness:{state:'throttled'},commit:'abc',results:[card]}, /省略/], [{freshness:{state:'current'},commit:'abc',results:[card]}, /同期確認済み/] ]) assert.match(freshnessLabel(value), label);
});
test('malformed responses and oversize queries fail clearly', async () => {
  const paths = { node: '/node', cli: '/cli', state: '/state' };
  await assert.rejects(search(paths, 'あ'.repeat(334)), /1000/);
  await assert.rejects(search(paths, '', async () => ({ stdout: '{"results":[]}' })), /応答が不正/);
  await assert.rejects(search(paths, '', async () => ({ stdout: JSON.stringify({ freshness: { state: 'current' }, results: [{}] }) })), /カードが不正/);
  await assert.rejects(invoke(paths, 'search', [], async () => { throw { stderr: 'NODE_22_REQUIRED' }; }), /NODE_22_REQUIRED/);
});
test('relative configured paths rejected; home alias accepted', async () => {
  await assert.rejects(resolvePaths({ cliPath: 'relative' }), /絶対パス/);
  const paths = await resolvePaths({ nodePath: process.execPath, cliPath: '~/dev/harness/knowledge/cli.cjs' });
  assert.equal(paths.cli, path.join(os.homedir(), 'dev/harness/knowledge/cli.cjs'));
});

test('compact list status omits timestamps while detail preserves successful check time', () => {
  const current = { freshness: { state: 'current' }, commit: 'abc', checked_at: '2026-10-07T01:02:03Z', results: [card] };
  assert.equal(freshnessShortLabel(current), '同期確認済み');
  assert.match(freshnessLabel(current), /2026-10-07T01:02:03Z/);
  assert.equal(freshnessShortLabel({ ...current, freshness: { state: 'offline' } }), '同期失敗・キャッシュ');
  assert.equal(freshnessShortLabel({ ...current, freshness: { state: 'throttled' } }), 'キャッシュ表示');
});
