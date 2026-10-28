const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers.cjs');

// Each helper keeps its own copy of the send-approval check so it stays self-contained.
// The copies must not drift: only the default peer line may differ.
const skills = path.join(root, 'plugins/codex-harness/skills/harness');
const helpers = {
  'consult-codex': { file: path.join(skills, 'consult-codex/scripts/consult.mjs'), peer: 'codex' },
  'consult-claude': { file: path.join(skills, 'consult-claude/scripts/consult.mjs'), peer: 'claude' },
  'codex-image': { file: path.join(skills, 'codex-image/scripts/image.mjs'), peer: 'codex' },
};
const BEGIN = '// BEGIN shared send-approval check (keep identical across consult-codex, consult-claude, codex-image)';
const END = '// END shared send-approval check';
const PEER_LINE = /^const APPROVAL_PEER = '(\w+)';$/;

function block(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const begin = lines.indexOf(BEGIN), end = lines.indexOf(END);
  assert.ok(begin !== -1 && end > begin, `${file} has one BEGIN/END shared send-approval block`);
  assert.equal(lines.lastIndexOf(BEGIN), begin); assert.equal(lines.lastIndexOf(END), end);
  return lines.slice(begin, end + 1);
}

test('the three helpers carry an identical send-approval block apart from the default peer', () => {
  const blocks = Object.entries(helpers).map(([name, { file, peer }]) => {
    const lines = block(file);
    const peers = lines.filter(line => PEER_LINE.test(line));
    assert.deepEqual(peers, [`const APPROVAL_PEER = '${peer}';`], `${name} defines its default peer once`);
    return { name, text: lines.filter(line => !PEER_LINE.test(line)).join('\n') };
  });
  for (const { name, text } of blocks.slice(1)) assert.equal(text, blocks[0].text, `${name} matches consult-codex`);
  assert.match(blocks[0].text, /export async function checkApproval\(\{ project, purpose, peer = APPROVAL_PEER \}\)/);
});

test('the three skills describe the same approval record update steps', () => {
  const steps = Object.keys(helpers).map(name => {
    const lines = fs.readFileSync(path.join(skills, name, 'SKILL.md'), 'utf8').split('\n');
    const start = lines.findIndex(line => line.includes('`purpose_missing` のときだけ'));
    assert.ok(start > 0, `${name} has the purpose_missing step`);
    assert.equal(lines.filter(line => line.includes('`purpose_missing` のときだけ')).length, 1, name);
    return { name, text: lines.slice(start - 1, start + 3).join('\n') };
  });
  for (const { name, text } of steps.slice(1)) assert.equal(text, steps[0].text, `${name} matches consult-codex`);
  for (const phrase of ['既存の記録の `purposes` に今回のpurposeだけを追記', '`missing` のときは、テンプレートどおりに新しく作ります', '黙って直しません', '`purposes` は今回ユーザーが承認した範囲だけ', '古い記述は消しません', '再承認なしに戻しません'])
    assert.ok(steps[0].text.includes(phrase), phrase);
});

test('every helper exposes the shared check with the same decisions', async t => {
  const base = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'send-approval-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const project = fs.realpathSync(base), dir = path.join(project, 'docs/harness/authorizations');
  fs.mkdirSync(dir, { recursive: true });
  const front = (peer, extra = '') => `---\npeer: ${peer}\nproject: ${project}\npurposes: [advice]\nstatus: approved\nrecorded: 2026-10-28\n${extra}---\n\n# record\n`;
  fs.writeFileSync(path.join(dir, 'codex-send.md'), front('codex', 'note: ignored\n'));
  fs.writeFileSync(path.join(dir, 'claude-send.md'), front('claude'));
  for (const [name, { file, peer }] of Object.entries(helpers)) {
    const { checkApproval, PURPOSES } = await import(require('node:url').pathToFileURL(file).href);
    assert.deepEqual(PURPOSES, ['advice', 'review', 'image'], name);
    const approved = await checkApproval({ project, purpose: 'advice' });
    assert.deepEqual(approved, { ok: true, approved: true, reason: 'approved', record: path.join(dir, `${peer}-send.md`), purposes: ['advice'] }, name);
    assert.equal((await checkApproval({ project, purpose: 'image' })).reason, 'purpose_missing', name);
    await assert.rejects(checkApproval({ project: 'relative', purpose: 'advice' }), error => error.code === 'invalid_options', name);
    // There is no purpose-free approval: an omitted or unknown purpose is an option error.
    for (const purpose of [undefined, '', 'chat']) await assert.rejects(checkApproval({ project, purpose }), error => error.code === 'invalid_options' && /--purpose is required/.test(error.message), `${name} ${purpose}`);
  }
});

test('inline purposes reject empty items, and an empty list approves no purpose', async t => {
  const base = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'send-approval-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const project = fs.realpathSync(base), dir = path.join(project, 'docs/harness/authorizations');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, { file, peer }] of Object.entries(helpers)) {
    const { checkApproval, PURPOSES } = await import(require('node:url').pathToFileURL(file).href);
    const record = purposes => fs.writeFileSync(path.join(dir, `${peer}-send.md`), `---\npeer: ${peer}\nproject: ${project}\npurposes: ${purposes}\nstatus: approved\nrecorded: 2026-10-28\n---\n`);
    for (const list of ['[advice,,review]', '[advice,]', '[,]', '[ , advice]']) {
      record(list);
      const result = await checkApproval({ project, purpose: 'advice' });
      assert.deepEqual([result.approved, result.reason], [false, 'malformed'], `${name} ${list}`);
      assert.match(result.message, /^line 4: purposes has an empty item/, `${name} ${list}`);
    }
    for (const list of ['[]', '[ ]']) {
      record(list);
      for (const purpose of PURPOSES) {
        const result = await checkApproval({ project, purpose });
        assert.deepEqual([result.approved, result.reason, result.purposes], [false, 'purpose_missing', []], `${name} ${list} ${purpose}`);
      }
    }
    record('[advice, review]');
    assert.equal((await checkApproval({ project, purpose: 'review' })).reason, 'approved', name);
  }
});
