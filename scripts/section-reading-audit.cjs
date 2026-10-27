#!/usr/bin/env node
'use strict';

// A cooperative audit surface, not an OS sandbox. Readers must use this surface
// for every document read; the coordinator checks the tool transcript as well.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const MAX_STDOUT_BYTES = 24000;
const DOCUMENT_ROOTS = ['plugins/codex-harness/skills/harness', 'authoring-skills/codex-html-plan'];
const TOOLS = {
  harness: 'plugins/codex-harness/skills/harness/read-sections.cjs',
  'html-plan': 'authoring-skills/codex-html-plan/read-sections.cjs',
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };

function flags(args) {
  const result = { rest: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') { result.rest.push(...args.slice(i + 1)); break; }
    if (!args[i].startsWith('--')) fail(`Expected an option, got ${args[i]}`);
    const key = args[i].slice(2);
    if (!args[i + 1] || args[i + 1].startsWith('--')) fail(`Missing value for --${key}`);
    if (Object.hasOwn(result, key)) fail(`Duplicate --${key}`);
    result[key] = args[++i];
  }
  return result;
}
function exactKeys(options, allowed) {
  for (const key of Object.keys(options)) if (key !== 'rest' && !allowed.includes(key)) fail(`Unknown --${key}`);
}
function validateReaderArguments(tool, args) {
  const documents = tool === 'harness' ? ['commands', 'roles'] : ['blocks'];
  if (args.includes('--list')) {
    const names = args.filter(arg => arg !== '--list');
    if (args.filter(arg => arg === '--list').length !== 1 || names.length > 1 || (names.length && !documents.includes(names[0]))) fail('Use --list alone or with one document supported by this reader');
    return;
  }
  const positional = [];
  let json = false, receipt;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') {
      if (json) fail('Duplicate --json');
      json = true;
    } else if (arg === '--held') {
      if (receipt !== undefined || !args[index + 1]) fail('Use --held <receipt> once');
      receipt = args[++index];
      if (!/^1\.[a-z0-9-]+\.[a-f0-9]{64}\.[a-f0-9]{64}\.[a-z0-9-]+(?:,[a-z0-9-]+)*$/.test(receipt)) fail('Invalid --held receipt syntax');
    } else {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(arg)) fail('Only reader document/section keys, --json, --list and --held <receipt> are allowed');
      positional.push(arg);
    }
  }
  if (positional.length < 2 || !documents.includes(positional[0])) fail('Select a supported document and at least one section');
  if (receipt && receipt.split('.')[1] !== positional[0]) fail('Held receipt must name the selected document');
}
function realInside(root, relative) {
  if (!relative || path.isAbsolute(relative)) fail('Use a root-relative path');
  const resolved = fs.realpathSync(path.resolve(root, relative));
  if (!DOCUMENT_ROOTS.some(base => resolved.startsWith(`${path.join(root, base)}${path.sep}`))) fail('Path outside the two allowed skill roots');
  return resolved;
}
function document(root, relative) {
  const resolved = realInside(root, relative);
  if (!resolved.endsWith('.md')) fail('Only Markdown document reads are allowed');
  const buffer = fs.readFileSync(resolved);
  const body = buffer.toString('utf8');
  if (!Buffer.from(body).equals(buffer)) fail('Document is not valid UTF-8');
  const lines = body.match(/[^\n]*\n|[^\n]+$/g) || [];
  return { relative: path.relative(root, resolved), buffer, lines };
}
function runConfig(run) {
  const directory = fs.realpathSync(run);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'));
  return { directory, manifest };
}
function events(directory) {
  const filename = path.join(directory, 'events.jsonl');
  if (!fs.existsSync(filename)) return [];
  return fs.readFileSync(filename, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}
function selection(doc, ranges) {
  return ranges.map(([start, end]) => ({
    path: doc.relative, start, end,
    sourceSha256: hash(doc.buffer),
    lines: doc.lines.slice(start - 1, end).map((body, i) => ({ line: start + i, bytes: Buffer.byteLength(body), sha256: hash(body) })),
  }));
}
function append(directory, data, stdout, stderr = Buffer.alloc(0)) {
  const prior = events(directory);
  const sequence = prior.length + 1;
  const prefix = `${String(sequence).padStart(4, '0')}`;
  const stdoutFile = `${prefix}.stdout`;
  const stderrFile = `${prefix}.stderr`;
  fs.writeFileSync(path.join(directory, stdoutFile), stdout, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, stderrFile), stderr, { flag: 'wx' });
  const seen = new Set(prior.flatMap(event => (event.selections || []).flatMap(item => item.lines.map(line => `${item.path}:${item.sourceSha256}:${line.line}:${line.sha256}`))));
  let duplicateBodyBytes = 0;
  for (const item of data.selections || []) for (const line of item.lines) {
    const key = `${item.path}:${item.sourceSha256}:${line.line}:${line.sha256}`;
    if (seen.has(key)) duplicateBodyBytes += line.bytes;
    seen.add(key);
  }
  const event = {
    sequence, at: new Date().toISOString(), previousEventSha256: prior.at(-1)?.eventSha256 || null,
    ...data, duplicateBodyBytes,
    stdoutFile, stdoutBytes: stdout.length, stdoutSha256: hash(stdout),
    stderrFile, stderrBytes: stderr.length, stderrSha256: hash(stderr),
  };
  event.eventSha256 = hash(JSON.stringify(event));
  fs.appendFileSync(path.join(directory, 'events.jsonl'), `${JSON.stringify(event)}\n`, { flag: 'a' });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
}
function rangesFor(doc, options) {
  if (options.lines && options.heading) fail('Choose --lines or --heading');
  if (options.lines) {
    const match = /^(\d+):(\d+)$/.exec(options.lines);
    if (!match) fail('Line range must be inclusive START:END');
    const start = Number(match[1]), end = Number(match[2]);
    if (start < 1 || end < start || end > doc.lines.length) fail('Line range outside document');
    return [[start, end]];
  }
  if (options.heading) {
    const matches = doc.lines.map((line, index) => ({ line: index + 1, match: /^(#{1,6})\s+(.+?)\s*$/.exec(line.trimEnd()) })).filter(item => item.match && item.match[2] === options.heading);
    if (matches.length !== 1) fail('Heading must match exactly once (without #)');
    const { line: start, match } = matches[0];
    const next = doc.lines.findIndex((line, index) => index >= start && /^(#{1,6})\s+/.test(line) && /^(#+)/.exec(line)[1].length <= match[1].length);
    return [[start, next < 0 ? doc.lines.length : next]];
  }
  return doc.lines.length ? [[1, doc.lines.length]] : [];
}

function readerSelection(root, executableRelative, args, stdout) {
  if (args.includes('--list')) return { bodyBytes: 0, metadataBytes: 0, indexBytes: stdout.length, selections: [] };
  let relative, sourceSha256, chunks;
  if (args.includes('--json')) {
    const result = JSON.parse(stdout.toString('utf8'));
    relative = result.path; sourceSha256 = result.sha256; chunks = result.chunks;
  } else {
    const headerEnd = stdout.indexOf(10);
    const header = /^# (.+) sha256=([a-f0-9]{64}) selected=.+$/.exec(stdout.subarray(0, headerEnd).toString('utf8'));
    if (!header) fail('Unexpected reader stdout header');
    relative = header[1]; sourceSha256 = header[2]; chunks = [];
    let offset = headerEnd + 1;
    while (offset < stdout.length) {
      const end = stdout.indexOf(10, offset);
      const match = /^<!-- lines (\d+)-(\d+); body-bytes (\d+) -->$/.exec(stdout.subarray(offset, end).toString('utf8'));
      if (!match) fail('Unexpected reader chunk metadata');
      const bytes = Number(match[3]);
      const body = stdout.subarray(end + 1, end + 1 + bytes);
      if (body.length !== bytes) fail('Reader chunk is truncated');
      chunks.push({ start: Number(match[1]), end: Number(match[2]), bytes, text: body.toString('utf8') });
      offset = end + 1 + bytes;
    }
  }
  if (typeof relative !== 'string' || !Array.isArray(chunks)) fail('Unexpected reader schema');
  const doc = document(root, path.join(path.dirname(executableRelative), relative));
  if (hash(doc.buffer) !== sourceSha256) fail('Reader source hash mismatch');
  let bodyBytes = 0;
  const ranges = chunks.map(chunk => {
    if (!Number.isInteger(chunk.start) || !Number.isInteger(chunk.end) || chunk.start < 1 || chunk.end < chunk.start || chunk.end > doc.lines.length) fail('Invalid reader range');
    const original = doc.lines.slice(chunk.start - 1, chunk.end).join('');
    if (original !== chunk.text || Buffer.byteLength(original) !== chunk.bytes) fail('Reader body differs from source range');
    bodyBytes += chunk.bytes;
    return [chunk.start, chunk.end];
  });
  return { bodyBytes, metadataBytes: stdout.length - bodyBytes, indexBytes: 0, selections: selection(doc, ranges) };
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = flags(args);
  if (command === 'init') {
    exactKeys(options, ['root', 'run', 'label', 'scenario', 'model', 'effort']);
    for (const name of ['root', 'run', 'label', 'scenario', 'model', 'effort']) if (!options[name]) fail(`Missing --${name}`);
    if (!['code', 'mixed'].includes(options.scenario)) fail('Scenario must be code or mixed');
    const root = fs.realpathSync(options.root);
    for (const relative of DOCUMENT_ROOTS) fs.realpathSync(path.join(root, relative));
    fs.mkdirSync(options.run, { recursive: false });
    const fixture = path.resolve(__dirname, '../benchmarks/section-reading', `${options.scenario}.md`);
    const manifest = {
      schema: 1, root, label: options.label, scenario: options.scenario, model: options.model, effort: options.effort,
      fixtureSha256: hash(fs.readFileSync(fixture)), auditSha256: hash(fs.readFileSync(__filename)),
      config: { active: true, delegation: true, review: true, persistence: true, measurement: true, improvement_loop: true, max_agents: 3, model_selection: 'auto', pins: [] },
      scope: 'Independent coordinator document-selection rehearsal; no code work, children, web browsing, or task completion',
      maxStdoutBytes: MAX_STDOUT_BYTES, toolMaxOutputTokens: 30000, createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(options.run, 'run.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  exactKeys(options, ['run', 'path', 'lines', 'heading', 'tool']);
  if (!options.run) fail('Missing --run');
  const { directory, manifest } = runConfig(options.run);
  if (command === 'summary') {
    const log = events(directory);
    let previous = null;
    for (const event of log) {
      const { eventSha256, ...body } = event;
      if (event.previousEventSha256 !== previous || hash(JSON.stringify(body)) !== eventSha256) fail('Event chain mismatch');
      previous = eventSha256;
      for (const kind of ['stdout', 'stderr']) {
        const bytes = fs.readFileSync(path.join(directory, event[`${kind}File`]));
        if (bytes.length !== event[`${kind}Bytes`] || hash(bytes) !== event[`${kind}Sha256`]) fail(`${kind} artifact mismatch`);
      }
    }
    const sum = key => log.reduce((total, event) => total + (event[key] || 0), 0);
    process.stdout.write(`${JSON.stringify({ ...manifest, events: log.length, stdoutBytes: sum('stdoutBytes'), bodyBytes: sum('bodyBytes'), metadataBytes: sum('metadataBytes'), indexBytes: sum('indexBytes'), stderrBytes: sum('stderrBytes'), duplicateBodyBytes: sum('duplicateBodyBytes'), failedInvocations: log.filter(event => event.exitCode).length, finalEventSha256: previous }, null, 2)}\n`);
    return;
  }
  let stdout, stderr = Buffer.alloc(0), data;
  if (command === 'read' || command === 'headings') {
    const doc = document(manifest.root, options.path);
    if (command === 'headings') {
      stdout = Buffer.from(doc.lines.map((line, i) => /^#{1,6}\s+/.test(line) ? `${i + 1}: ${line.trimEnd()}\n` : '').join(''));
      data = { operation: command, path: doc.relative, sourceSha256: hash(doc.buffer), bodyBytes: 0, metadataBytes: 0, indexBytes: stdout.length, selections: [], exitCode: 0 };
    } else {
      const ranges = rangesFor(doc, options);
      stdout = Buffer.from(ranges.map(([start, end]) => doc.lines.slice(start - 1, end).join('')).join(''));
      data = { operation: command, path: doc.relative, ranges, bodyBytes: stdout.length, metadataBytes: 0, indexBytes: 0, selections: selection(doc, ranges), exitCode: 0 };
    }
  } else if (command === 'reader') {
    const relative = TOOLS[options.tool];
    if (!relative) fail('Tool must be harness or html-plan');
    const executable = realInside(manifest.root, relative);
    validateReaderArguments(options.tool, options.rest);
    const result = spawnSync(process.execPath, [executable, ...options.rest], { cwd: manifest.root, encoding: null, maxBuffer: 1024 * 1024, timeout: 10000 });
    if (result.error) fail(result.error.message);
    stdout = result.stdout; stderr = result.stderr;
    data = { operation: command, tool: relative, arguments: options.rest, toolSha256: hash(fs.readFileSync(executable)), bodyBytes: 0, metadataBytes: stdout.length, indexBytes: 0, selections: [], exitCode: result.status ?? 1 };
    if (!data.exitCode) Object.assign(data, readerSelection(manifest.root, relative, options.rest, stdout));
  } else fail('Commands: init, read, headings, reader, summary');
  if (stdout.length > MAX_STDOUT_BYTES) fail(`Output would exceed ${MAX_STDOUT_BYTES} bytes; select a smaller range. No document output was returned.`);
  append(directory, data, stdout, stderr);
  if (data.exitCode) process.exitCode = data.exitCode;
}
try { main(); } catch (error) {
  const stderr = Buffer.from(`section-reading-audit: ${error.message}\n`);
  const args = process.argv.slice(2);
  const runIndex = args.indexOf('--run');
  if (['read', 'headings', 'reader'].includes(args[0]) && runIndex >= 0) {
    try {
      const { directory } = runConfig(args[runIndex + 1]);
      append(directory, { operation: args[0], arguments: args.slice(1), bodyBytes: 0, metadataBytes: 0, indexBytes: 0, selections: [], exitCode: 1, error: error.message }, Buffer.alloc(0), stderr);
    } catch { process.stderr.write(stderr); }
  } else process.stderr.write(stderr);
  process.exitCode = 1;
}
