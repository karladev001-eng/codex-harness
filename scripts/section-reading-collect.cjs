#!/usr/bin/env node
'use strict';
// Offline collector for the fixed, captured reader runs. It never reruns readers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const base = path.resolve(__dirname, '../benchmarks/section-reading');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const parse = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const metrics = ['stdoutBytes', 'bodyBytes', 'metadataBytes', 'indexBytes', 'stderrBytes', 'duplicateBodyBytes'];
function totals(events) {
  const result = Object.fromEntries(metrics.map(key => [key, events.reduce((sum, event) => sum + (event[key] || 0), 0)]));
  result.events = events.length;
  result.failedInvocations = events.filter(event => event.exitCode).length;
  result.stdoutPlusStderrBytes = result.stdoutBytes + result.stderrBytes;
  if (result.stdoutBytes !== result.bodyBytes + result.metadataBytes + result.indexBytes) throw Error('Unclassified stdout bytes');
  return result;
}
function attribution(event, stdout) {
  let sourcePath = event.path || event.selections?.[0]?.path;
  if (!sourcePath && event.operation === 'reader') {
    const header = /^# (.+) sha256=/.exec(stdout);
    if (header) sourcePath = path.posix.join(path.posix.dirname(event.tool), header[1]);
    else if (stdout.startsWith('{')) {
      const body = JSON.parse(stdout);
      if (body.path) sourcePath = path.posix.join(path.posix.dirname(event.tool), body.path);
    }
    if (!sourcePath) {
      const doc = (event.arguments || []).find(arg => ['commands', 'roles', 'blocks'].includes(arg));
      if (doc) sourcePath = path.posix.join(path.posix.dirname(event.tool), `references/${doc}.md`);
    }
  }
  if (!sourcePath && event.arguments?.includes('--path')) sourcePath = event.arguments[event.arguments.indexOf('--path') + 1];
  const group = ['commands', 'roles', 'blocks'].find(name => sourcePath?.endsWith(`/references/${name}.md`)) || 'other';
  return { sourcePath: sourcePath || null, group };
}
function grouped(events) {
  return Object.fromEntries(['commands', 'roles', 'blocks', 'other'].map(group => [group, totals(events.filter(event => event.group === group))]));
}
function main() {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode)) throw Error('Use --write or --check; neither mode executes a reader');
  const manifestFile = path.join(base, 'runs/manifest.json');
  const manifest = parse(manifestFile);
  const wrappers = ['versions/audit-v1.cjs', '../../scripts/section-reading-audit.cjs'].map(file => ({ file, sha256: hash(fs.readFileSync(path.resolve(base, file))) }));
  const runs = manifest.runs.map(record => {
    const directory = path.join(base, 'runs', record.id);
    for (const artifact of record.artifacts) {
      const bytes = fs.readFileSync(path.join(directory, artifact.file));
      if (bytes.length !== artifact.bytes || hash(bytes) !== artifact.sha256) throw Error(`${record.id}/${artifact.file}: raw artifact mismatch`);
    }
    const verified = spawnSync(process.execPath, [path.join(__dirname, 'section-reading-audit.cjs'), 'summary', '--run', directory], { encoding: 'utf8' });
    if (verified.status !== 0) throw Error(verified.stderr);
    const summary = JSON.parse(verified.stdout);
    if (!wrappers.some(wrapper => wrapper.sha256 === summary.auditSha256)) throw Error(`${record.id}: unknown audit version`);
    if (JSON.stringify(summary) !== JSON.stringify(parse(path.join(directory, 'summary.json')))) throw Error(`${record.id}: summary mismatch`);
    const logFile = path.join(directory, 'events.jsonl');
    const events = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const attributed = events.map(event => ({ ...event, ...attribution(event, fs.readFileSync(path.join(directory, event.stdoutFile), 'utf8')) }));
    const initialFile = path.join(directory, 'initial-summary.json');
    const initialSummary = fs.existsSync(initialFile) ? parse(initialFile) : null;
    const initialEvents = initialSummary ? attributed.slice(0, initialSummary.events) : [];
    if (initialSummary) {
      const initialTotals = totals(initialEvents);
      for (const key of [...metrics, 'events', 'failedInvocations']) if (initialSummary[key] !== initialTotals[key]) throw Error(`${record.id}: initial ${key} mismatch`);
      if (initialEvents.at(-1)?.eventSha256 !== initialSummary.finalEventSha256) throw Error(`${record.id}: initial chain endpoint mismatch`);
    }
    const currentFixtureHash = hash(fs.readFileSync(path.join(base, `${summary.scenario}.md`)));
    if (currentFixtureHash !== summary.fixtureSha256) throw Error(`${record.id}: fixture changed`);
    return {
      id: record.id, originalDirectory: record.originalDirectory, stage: record.stage, excluded: record.excluded, exclusionReason: record.exclusionReason,
      summary, initial: initialSummary ? totals(initialEvents) : null,
      supplement: initialSummary ? totals(attributed.slice(initialSummary.events)) : null,
      groups: grouped(attributed), initialGroups: initialSummary ? grouped(initialEvents) : null,
      eventAttribution: attributed.map(event => ({ sequence: event.sequence, operation: event.operation, sourcePath: event.sourcePath, group: event.group, stdoutBytes: event.stdoutBytes, stderrBytes: event.stderrBytes, exitCode: event.exitCode })),
      failures: attributed.filter(event => event.exitCode).map(event => ({ sequence: event.sequence, error: event.error || null, stderr: fs.readFileSync(path.join(directory, event.stderrFile), 'utf8') })),
    };
  });
  const condition = summary => ({ model: summary.model, effort: summary.effort, config: summary.config, maxStdoutBytes: summary.maxStdoutBytes, toolMaxOutputTokens: summary.toolMaxOutputTokens });
  const conditions = condition(runs[0].summary);
  if (runs.some(run => JSON.stringify(condition(run.summary)) !== JSON.stringify(conditions))) throw Error('Model/config/budget differs across runs');
  const result = {
    schema: 1,
    scope: 'Single-run independent coordinator document-selection rehearsals, not completed tasks or whole-conversation token measurements',
    rawManifestSha256: hash(fs.readFileSync(manifestFile)),
    sourceInventorySha256: hash(fs.readFileSync(path.join(base, 'source-inventory.json'))),
    conditions, wrappers,
    attribution: 'commands/roles/blocks groups include stdout attributed to that same source Markdown, including document-specific indexes and helper metadata; unattributed shared indexes stay in other. All stdout is included exactly once.',
    runs,
  };
  const filename = path.join(base, 'measurements.json');
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (mode === '--write') fs.writeFileSync(filename, output);
  else if (fs.readFileSync(filename, 'utf8') !== output) throw Error('measurements.json is stale');
  process.stdout.write(`${mode === '--check' ? 'Verified' : 'Collected'} ${runs.length} preserved runs; raw hashes, event chains, summaries, initial boundaries and fixture hashes match.\n`);
}
try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
