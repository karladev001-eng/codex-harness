const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const harness = path.join(root, 'plugins/codex-harness/skills/harness');
const html = path.join(root, 'authoring-skills/codex-html-plan');
const { readSections } = require(path.join(harness, 'read-sections.cjs'));
const read = file => fs.readFileSync(file, 'utf8');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');

// Historical hashes stay immutable. Only blocks remains unchanged; commands/roles
// evolve with features and retain semantic guards plus live hash/range coverage.
const originals = {
  commands: 'a8e91c2f5a344e8a8c1179d7d2036a62ad25136f8b4e2e00a9d546cf128063b0',
  roles: '00d197b1781b2fed7e13859fa91206ed16d3aad2511a5706e890b2802f29c282',
  blocks: '65ea755ccde08fd7c798590f5bebf222afc43a40de8bbf603439ad16df9cce6a',
};
test('section IDs cover every current rule byte, preserve whole references and exclude no lines', () => {
  for (const base of [harness, html]) {
    const index = JSON.parse(read(path.join(base, 'references/section-index.json')));
    for (const [id, document] of Object.entries(index.documents)) {
      const original = read(path.join(base, document.path));
      if (id === 'blocks') assert.equal(digest(original), originals[id], id + ': unchanged snapshot');
      assert.equal(digest(original), document.sha256, id + ': current source hash');
      const all = readSections(base, id, ['all']);
      assert.equal(all.chunks.map(c => c.text).join(''), original, id + ': lossless union of all sections');
      assert.equal(all.bytes, Buffer.byteLength(original));
      for (const section of Object.keys(document.sections)) {
        const selected = readSections(base, id, [section]);
        for (const required of document.sections[section].requires) assert.ok(selected.selected.includes(required), id + ':' + section + ' requires ' + required);
        for (const common of document.common) assert.ok(selected.selected.includes(common));
        assert.equal(selected.bytes, selected.chunks.reduce((n, chunk) => n + Buffer.byteLength(chunk.text), 0));
      }
    }
  }
});

test('command/role/block selections close dependencies, preserve guards and merge overlaps without duplicate bytes', () => {
  const status = readSections(harness, 'commands', ['status']);
  const text = status.chunks.map(c => c.text).join('');
  for (const rule of ['シェル', '--home', /状態確認はファイルを作(?:らない|りません)/, 'inactive', /statusは保存先のmetadata(?:のみ|だけ)/]) assert.ok(rule instanceof RegExp ? rule.test(text) : text.includes(rule), String(rule));
  assert.ok(!text.includes('npm login'));
  assert.ok(!text.includes('remote_content/remote_sha'));
  const preferences = readSections(harness, 'commands', ['preferences']);
  const prefText = preferences.chunks.map(c => c.text).join('');
  for (const rule of ['公開repositoryへの送信は拒否', '必ずreadのrevision', /古い版の自動mergeは行(?:わない|いません)/, 'persistence=false', 'measurementは独立']) assert.ok(rule instanceof RegExp ? rule.test(prefText) : prefText.includes(rule), String(rule));
  const measure = readSections(harness, 'commands', ['measure']);
  for (const rule of ['overlap=false', '未取得はnull']) assert.ok(measure.chunks.some(c => c.text.includes(rule)));
  const parent = readSections(harness, 'roles', ['coordinator']);
  for (const rule of ['pin', /候補一覧(?:なし|がない)/, '黙って代替せず', 'persistence=false']) assert.ok(parent.chunks.some(c => rule instanceof RegExp ? rule.test(c.text) : c.text.includes(rule)), String(rule));
  for (const role of ['implementation', 'integration']) assert.ok(readSections(harness, 'roles', [role]).chunks.some(c => /子を起動し(?:ない|ません)/.test(c.text)));
  const minimal = readSections(html, 'blocks', ['doc-code', 'doc-changes', 'doc-note']);
  assert.ok(minimal.bytes < Buffer.byteLength(read(path.join(html, 'references/blocks.md'))) / 2);
  for (const required of ['common', 'doc-plan', 'pack']) assert.ok(minimal.selected.includes(required));
  const machine = readSections(html, 'blocks', ['doc-machine']);
  assert.ok(machine.selected.includes('doc-mock'));
  const ask = readSections(html, 'blocks', ['doc-ask']);
  assert.ok(ask.selected.includes('doc-note'));
  const combined = readSections(html, 'blocks', ['doc-machine', 'doc-mock', 'doc-machine']);
  assert.equal(combined.bytes, machine.bytes);
  const full = readSections(html, 'blocks', ['all']);
  assert.ok(combined.bytes < full.bytes);
});

test('unknown IDs, invalid ranges, stale references and missing helpers fail visibly without partial stdout', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sections-'));
  try {
    fs.cpSync(html, temp, { recursive: true });
    const cli = (...args) => spawnSync(process.execPath, [path.join(temp, 'read-sections.cjs'), ...args], { encoding: 'utf8' });
    for (const args of [['blocks', 'typo'], ['unknown', 'doc-code'], ['blocks']]) {
      const r = cli(...args); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /full reference/);
    }
    fs.appendFileSync(path.join(temp, 'references/blocks.md'), '\nChanged.\n');
    const stale = cli('blocks', 'doc-code'); assert.equal(stale.status, 1); assert.equal(stale.stdout, ''); assert.match(stale.stderr, /version differs/);
    fs.copyFileSync(path.join(html, 'references/blocks.md'), path.join(temp, 'references/blocks.md'));
    const indexPath = path.join(temp, 'references/section-index.json');
    const index = JSON.parse(read(indexPath)); index.documents.blocks.sections['doc-code'].requires = ['doc-code'];
    fs.writeFileSync(indexPath, JSON.stringify(index));
    const cyclic = cli('blocks', 'doc-code'); assert.equal(cyclic.status, 1); assert.match(cyclic.stderr, /Cyclic/);
    index.documents.blocks.sections['doc-code'].requires = []; index.documents.blocks.sections['doc-code'].ranges = [[0, 2]];
    fs.writeFileSync(indexPath, JSON.stringify(index));
    const invalid = cli('blocks', 'doc-code'); assert.equal(invalid.status, 1); assert.equal(invalid.stdout, ''); assert.match(invalid.stderr, /Invalid section range/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('the independent HTML skill and built/plugin skills carry functional self-contained readers and required manifests', () => {
  assert.equal(read(path.join(harness, 'read-sections.cjs')), read(path.join(html, 'read-sections.cjs')));
  const installer = require('../dist/skill/install.js');
  for (const file of ['read-sections.cjs', 'references/section-index.json', 'references/section-map.md', 'authoring-skills/codex-html-plan/read-sections.cjs', 'authoring-skills/codex-html-plan/references/section-index.json']) assert.ok(installer.REQUIRED_SOURCE_FILES.includes(file), file);
  for (const base of ['dist/skill', 'dist/plugins/codex-harness/skills/harness']) {
    const skill = path.join(root, base);
    const reader = require(path.join(skill, 'read-sections.cjs'));
    assert.ok(reader.readSections(skill, 'commands', ['status']).bytes > 0);
    assert.equal(reader.readSections(skill, 'commands', ['all']).chunks.map(c => c.text).join(''), read(path.join(skill, 'references/commands.md')));
    const independent = path.join(skill, 'authoring-skills/codex-html-plan');
    assert.ok(require(path.join(independent, 'read-sections.cjs')).readSections(independent, 'blocks', ['doc-machine']).selected.includes('doc-mock'));
  }
  const result = spawnSync(process.execPath, [path.join(html, 'read-sections.cjs'), 'blocks', 'doc-code', '--json'], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const help = spawnSync(process.execPath, [path.join(html, 'read-sections.cjs'), '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /Usage:/);
  for (const args of [['--list', 'blocks'], ['blocks', '--list']]) {
    const list = spawnSync(process.execPath, [path.join(html, 'read-sections.cjs'), ...args], { encoding: 'utf8' });
    assert.equal(list.status, 0); assert.match(list.stdout, /blocks:/);
  }
  const json = JSON.parse(result.stdout);
  assert.equal(json.bytes, json.chunks.reduce((n, c) => n + c.bytes, 0));
  assert.ok(json.chunks.every(c => c.start > 0 && c.end >= c.start));
  assert.ok(read(path.join(harness, 'SKILL.md')).includes('不明・旧版・実行不能'));
  assert.ok(read(path.join(html, 'SKILL.md')).includes('ハーネスなしでも同じ手順'));
});

test('standalone install requires both reader and index before creating any project files', () => {
  const { authoring } = require('../dist/skill/authoring.js');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'section-install-'));
  try {
    const project = path.join(temp, 'project'); fs.mkdirSync(project);
    const source = path.join(temp, 'source'); fs.mkdirSync(source);
    for (const missing of ['read-sections.cjs', 'references/section-index.json']) {
      const target = path.join(source, 'codex-html-plan'); fs.cpSync(html, target, { recursive: true });
      fs.unlinkSync(path.join(target, missing));
      assert.throws(() => authoring({ project, action: 'install', skill: ['codex-html-plan'] }, source), error => error.message.includes('incomplete') && error.message.includes(missing));
      assert.deepEqual(fs.readdirSync(project), []);
      fs.rmSync(target, { recursive: true });
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('stateless receipts avoid repeated common and dependency ranges while preserving the combined rule set', () => {
  for (const [base, document, requests] of [
    [harness, 'roles', [['coordinator'], ['implementation'], ['integration']]],
    [html, 'blocks', [['doc-code', 'doc-note'], ['doc-flow'], ['doc-machine', 'doc-ask']]],
    [harness, 'commands', [['status'], ['task', 'measure'], ['install', 'preferences']]],
  ]) {
    let receipt, total = 0;
    const seen = new Set();
    for (const requested of requests) {
      const result = readSections(base, document, requested, receipt);
      assert.ok(result.receipt);
      for (const chunk of result.chunks) for (let line = chunk.start; line <= chunk.end; line++) {
        assert.ok(!seen.has(line), document + ': no repeated source line ' + line);
        seen.add(line);
      }
      total += result.bytes; receipt = result.receipt;
    }
    const combined = readSections(base, document, requests.flat());
    assert.equal(total, combined.bytes, document + ': incremental and combined bodies contain exactly the same bytes');
    const combinedLines = combined.chunks.flatMap(chunk => Array.from({ length: chunk.end - chunk.start + 1 }, (_, i) => chunk.start + i));
    assert.deepEqual([...seen].sort((a, b) => a - b), combinedLines);
    const retained = readSections(base, document, requests.flat(), receipt);
    assert.equal(retained.bytes, 0); assert.deepEqual(retained.chunks, []);
    const allDelta = readSections(base, document, ['all'], receipt);
    assert.equal(total + allDelta.bytes, readSections(base, document, ['all']).bytes);
    // Losing content means omitting the receipt, which restores all common guards.
    const restored = readSections(base, document, requests[0]);
    assert.ok(restored.bytes > 0); assert.ok(restored.selected.includes('common'));
  }
});

test('held receipts fail closed for another document/version/map, invalid IDs and missing common/dependency closure', () => {
  const first = readSections(html, 'blocks', ['doc-machine']);
  const fields = first.receipt.split('.');
  const bad = [
    '', first.receipt + '.1:999',
    [fields[0], 'roles', ...fields.slice(2)].join('.'),
    [fields[0], fields[1], '0'.repeat(64), ...fields.slice(3)].join('.'),
    [...fields.slice(0, 3), '0'.repeat(64), fields[4]].join('.'),
    [...fields.slice(0, 4), fields[4] + ',typo'].join('.'),
    [...fields.slice(0, 4), fields[4] + ',common'].join('.'),
    [...fields.slice(0, 4), 'doc-machine'].join('.'),
    [...fields.slice(0, 4), fields[4].split(',').filter(id => id !== 'doc-mock').join(',')].join('.'),
  ];
  for (const receipt of bad) {
    const result = spawnSync(process.execPath, [path.join(html, 'read-sections.cjs'), 'blocks', 'doc-machine', '--held', receipt, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 1, receipt); assert.equal(result.stdout, ''); assert.match(result.stderr, /held|receipt/);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'held-map-'));
  try {
    fs.cpSync(html, temp, { recursive: true });
    const file = path.join(temp, 'references/section-index.json');
    const index = JSON.parse(read(file));
    index.documents.blocks.sections['doc-code'].ranges = [[1, 1]];
    fs.writeFileSync(file, JSON.stringify(index));
    assert.throws(() => readSections(temp, 'blocks', ['doc-code'], first.receipt), /Invalid, stale/);
    fs.appendFileSync(path.join(temp, 'references/blocks.md'), '\nChanged\n');
    assert.throws(() => readSections(temp, 'blocks', ['doc-machine'], first.receipt), /version differs/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  const zero = spawnSync(process.execPath, [path.join(html, 'read-sections.cjs'), 'blocks', 'doc-machine', '--held', first.receipt], { encoding: 'utf8' });
  assert.equal(zero.status, 0, zero.stderr); assert.match(zero.stdout, /already retained; body-bytes 0/);
  assert.ok(Buffer.byteLength(zero.stdout) < 500);
});
