const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('./helpers.cjs');

// A home directory path names the local account. Shared files write ~/, <repo> or <tmp> instead.
// Placeholders such as /Users/<name>/ stay allowed.
const HOME_PATH = [
  /(?<![\w.~/-])\/(?:Users|home)\/(?!<)[\w.-]+\//,
  /(?<![\w])[A-Za-z]:[\\/]+Users[\\/]+(?!<)[\w.-]+/i,
];

test('tracked files carry no personal home directory path', t => {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (listed.error || listed.status !== 0) { t.skip('git is unavailable or this is not a checkout'); return; }
  const hits = [];
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    // This file holds sample paths for the pattern test below.
    if (file === 'tests/personal-path.test.cjs') continue;
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const buffer = fs.readFileSync(full);
    if (buffer.includes(0)) continue;
    buffer.toString('utf8').split('\n').forEach((line, index) => {
      if (HOME_PATH.some(pattern => pattern.test(line))) hits.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(hits, [], 'replace these with ~/, <repo> or <tmp>');
});

test('the pattern catches macOS, Linux and Windows home paths but not placeholders', () => {
  const caught = line => HOME_PATH.some(pattern => pattern.test(line));
  for (const line of ['root: /Users/alice/dev', '"/home/bob/.codex"', 'C:\\Users\\carol\\repo', 'c:/Users/dave/x']) assert.ok(caught(line), line);
  for (const line of ['/Users/<name>/dev', '~/dev/harness', '/absolute/user/home/.codex/skills', '<repo>/docs', 'https://example.com/home/page/']) assert.ok(!caught(line), line);
});
