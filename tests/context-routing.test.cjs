const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { routes, chart, report, digest, scenarios } = require('../scripts/context-routing.cjs');
const { check } = require('../scripts/check-doc-links.cjs');
const root = path.resolve(__dirname, '..');
const skill = path.join(root, 'plugins/codex-harness/skills/harness');
const fixture = path.join(__dirname, 'fixtures/context-routing');
const read = file => fs.readFileSync(file, 'utf8');
const keys = ['settings', 'preimplementation', 'claude', 'web', 'creative', 'coordination', 'continuity'];
const original = read(path.join(fixture, 'before-SKILL.md'));

test('historical source remains immutable and each original block has an explicit semantic mapping', () => {
  const sections = [...original.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  assert.equal(sections.length, 7);
  const map = read(path.join(skill, 'references/routing/rule-map.md'));
  sections.forEach((section, i) => {
    assert.ok(fs.existsSync(path.join(skill, 'references/routing', keys[i] + '.md')));
    section[2].trim().split(/\n\n+/).forEach((_, block) => assert.ok(map.includes(`| ${i + 1}.${block + 1} |`)));
  });
  const manifest = JSON.parse(read(path.join(fixture, 'before-manifest.json')));
  assert.deepEqual(digest(original), manifest['SKILL.md']);
  // Current obligations are checked independently in context-concision.test.cjs;
  // byte equality applies only to the historical fixture, not its concise wording.
});

test('chart shares all independent conditions and paths with the canonical table and is current', () => {
  const rows = routes();
  assert.deepEqual(rows.map(r => r.id), ['S', 'A', 'C', 'W', 'F', 'D', 'R']);
  assert.equal(new Set(rows.map(r => r.target)).size, 7);
  const actual = read(path.join(skill, 'references/routing/chart.md'));
  assert.equal(actual, chart());
  assert.ok(actual.includes('START{"HARNESS_WORKER?"}'));
  assert.ok(actual.includes('START -->|No| STATUS['));
  assert.ok(actual.includes('START -->|Yes| ASSIGNED['));
  assert.ok(actual.includes('STATUS --> ACTIVE{'));
  assert.ok(!actual.includes('START["status:'));
  rows.forEach((r, i) => {
    assert.ok(fs.existsSync(path.join(skill, r.target)), r.target);
    assert.ok(actual.includes(`${r.id}: ${r.condition}`));
    const next = rows[i + 1]?.id || 'END';
    assert.ok(actual.includes(`${r.id}_READ --> ${next}`), 'Yes must continue to next independent condition');
    assert.ok(actual.includes(`${r.id} -->|No| ${next}`));
  });
  assert.equal(check(skill, { skillOnly: true }).errors.length, 0);
});

test('common boundaries expose OFF, worker, approval, conflict and re-read guards before detail', () => {
  const entry = read(path.join(skill, 'SKILL.md'));
  assert.equal(entry.slice(0, entry.indexOf('# Codex Harness')), original.slice(0, original.indexOf('# Codex Harness')), 'unchanged valid name/description frontmatter');
  for (const text of ['HARNESS_WORKER', 'active=false', 'delegation OFF', 'review ON', 'persistence OFF', 'measurement OFF', 'improvement_loop OFF', '明示承認', '原文', '同じ版', 'compact', '全行を再判定', '再読不要']) assert.ok(entry.includes(text), text);
  assert.ok(entry.indexOf('HARNESS_WORKER') < entry.indexOf('Node.js 22+'));
  assert.ok(entry.includes('純相談・調査だけに実装承認・コード委譲・Git工程を追加しない'));
  assert.ok(routes().find(r => r.id === 'F').condition.includes('UI・文書等'));
  assert.ok(routes().find(r => r.id === 'R').condition.includes('measurement ON'));
  assert.ok(routes().find(r => r.id === 'R').condition.includes('起動statusを含む'));
  assert.ok(routes().find(r => r.id === 'F').condition.includes('制作を委譲する'));
  assert.ok(read(path.join(skill, 'references/routing/web.md')).includes('](<実際の外部ページの絶対URL>)'));
  assert.ok(!read(path.join(skill, 'references/routing/web.md')).includes('../../実際の根拠ページURL'));
  assert.ok(routes().find(r => r.id === 'R').condition.includes('通常回答の終了だけは除外'));
  assert.ok(routes().find(r => r.id === 'R').condition.includes('仕様パケット'));
  assert.ok(Buffer.byteLength(entry) < Buffer.byteLength(original) / 4);
});

test('reproducible scenario accounting keeps bootstrap/leaf parity and inactive/worker/retained boundaries', () => {
  const data = report(), byId = Object.fromEntries(data.scenarios.map(s => [s.id, s]));
  for (const s of data.scenarios) {
    const sum = list => list.reduce((n, key) => n + data.files[key].bytes, 0);
    assert.equal(sum(s.beforeFiles), s.before.bytes, s.id);
    assert.equal(sum(s.afterFiles), s.after.bytes, s.id);
    assert.equal(s.before.bytes - s.after.bytes, s.savedBytes);
    assert.equal(new Set(s.beforeFiles).size, s.beforeFiles.length);
    assert.equal(new Set(s.afterFiles).size, s.afterFiles.length);
    const leaves = (side, list) => list.map(key => data.files[key].path).filter(file => file !== '@bootstrap' && file !== 'SKILL.md' && !file.startsWith('references/routing/')).sort();
    assert.deepEqual(leaves('before', s.beforeFiles), leaves('after', s.afterFiles));
  }
  for (const id of ['inactive', 'worker']) {
    const s = byId[id];
    assert.ok(![...s.beforeFiles, ...s.afterFiles].some(key => data.files[key].path === 'SKILL.md'));
    assert.equal(s.savedBytes, 0);
  }
  assert.equal(byId.inactive.beforeInstructionBytes, 0);
  assert.equal(byId.inactive.afterInstructionBytes, 0);
  assert.equal(byId['version-update'].commonBootstrapBytes, 0);
  assert.equal(byId['same-version'].after.bytes, 0);
  assert.equal(byId['same-version'].before.bytes, 0);
  assert.deepEqual(byId['mixed'].yes, routes().map(r => r.id));
  assert.ok(byId['mixed'].savedBytes < 0, 'all-branch overhead must stay visible');
  assert.ok(byId['advice-to-code'].savedBytes < 0, 'baseline retained root must not be double charged');
  assert.ok(!byId['advice-to-code'].beforeFiles.some(k => data.files[k].path === 'SKILL.md'));
  for (const id of ['advice', 'claude', 'web']) assert.ok(!byId[id].yes.includes('A') && !byId[id].yes.includes('D'));
  for (const s of data.scenarios.filter(s => s.measurement && !s.retained && !s.retainedMeasurement)) {
    assert.ok(s.beforeFiles.some(k => data.files[k].path === 'references/measurement.md'), s.id + ': original measurement retained');
    assert.ok(s.afterFiles.some(k => data.files[k].path === 'references/measurement.md'), s.id + ': measurement retained');
    assert.ok(s.afterFiles.some(k => data.files[k].path === 'references/routing/continuity.md'), s.id + ': continuity reached');
  }
  for (const id of ['advice-to-code', 'version-update', 'same-version']) {
    assert.ok(!byId[id].afterFiles.some(k => ['references/commands.md', 'references/measurement.md', 'references/routing/continuity.md'].includes(data.files[k].path)), id + ': retained documents not double charged');
  }
  assert.ok(!byId['loop-off'].yes.includes('F'));
  assert.ok(byId['delegated-creative-loop-off'].yes.includes('F'));
  assert.ok(byId['delegated-creative-loop-off'].afterFiles.some(k => data.files[k].path === 'references/roles.md'));
  assert.deepEqual(byId['advice-measurement-off'].yes, ['R']);
  for (const s of data.scenarios.filter(s => s.commands && !s.retained && !s.retainedCommands)) {
    for (const side of ['beforeFiles', 'afterFiles']) assert.ok(s[side].some(k => data.files[k].path === 'references/commands.md'), s.id + ': startup commands retained on both sides');
  }
  assert.equal(byId['advice'].before.bytes + byId['advice-to-code'].before.bytes, byId['simple-code'].before.bytes);
  assert.equal(byId['advice'].after.bytes + byId['advice-to-code'].after.bytes, byId['simple-code'].after.bytes);
  const off = byId['storage-off'];
  assert.ok(!off.afterFiles.some(k => ['references/measurement.md', 'references/creative-loop.md'].includes(data.files[k].path)));
  assert.ok(byId['ambiguous'].afterFiles.filter(k => k.endsWith(':first-paragraph')).length === 2);
  assert.deepEqual(byId['after-compact'].after, byId['simple-code'].after);
  assert.ok(scenarios.some(s => s.id === 'version-update'));
  const external = JSON.parse(read(path.join(fixture, 'shared-manifest.json')));
  for (const [file, metrics] of Object.entries(external)) assert.deepEqual(data.files['before:' + file], { path: file, side: 'before', range: 'full file', ...metrics }, 'historical original authoring snapshot');
  const checked = spawnSync(process.execPath, ['scripts/context-routing.cjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
});

test('all routing materials are required and travel in install/build/plugin archives', () => {
  const installer = require('../dist/skill/install.js');
  for (const file of [...routes().map(r => r.target), 'references/routing/chart.md', 'references/routing/rule-map.md', 'references/early-compaction.md']) {
    assert.ok(installer.REQUIRED_SOURCE_FILES.includes(file), file);
    for (const base of ['dist/skill', 'dist/plugins/codex-harness/skills/harness']) assert.ok(fs.existsSync(path.join(root, base, file)), base + '/' + file);
  }
});
