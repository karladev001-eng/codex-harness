#!/usr/bin/env node
// Read-only, dependency-free section extraction. No cache, model calls or routing decisions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const usage = 'Usage: node "<skill-dir>/read-sections.cjs" <document> <section>... [--json] [--held <receipt>] | --list [document] | <document> all';
function readSections(root, document, requested, heldReceipt) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'references/section-index.json'), 'utf8'));
  const entry = Object.hasOwn(index.documents, document) ? index.documents[document] : null;
  if (!entry) throw Error('Unknown document; use --list or read the original full reference.');
  const file = path.resolve(root, entry.path);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw Error('Reference escapes skill directory');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file));
  if (hash(content) !== entry.sha256) throw Error('Reference version differs from section index; read the original full reference and repair/rebuild the index.');
  const lines = content.split('\n');
  function close(ids) {
    const selected = new Set();
    function visit(id, trail = []) {
      if (!Object.hasOwn(entry.sections, id)) throw Error('Unknown section: ' + id + '; use --list or read the original full reference.');
      if (trail.includes(id)) throw Error('Cyclic section dependency: ' + [...trail, id].join(' -> '));
      if (selected.has(id)) return;
      for (const dependency of entry.sections[id].requires || []) visit(dependency, [...trail, id]);
      selected.add(id);
    }
    for (const id of entry.common || []) visit(id);
    for (const id of ids) visit(id);
    return selected;
  }
  if (!requested.length) throw Error('Select sections explicitly; use --list or all for the original full reference.');
  if (requested.includes('all') && requested.length !== 1) throw Error('Use all alone.');
  const selected = close(requested[0] === 'all' ? Object.keys(entry.sections) : requested);
  // Bind receipts to the source AND its mapping, so changed ranges/dependencies cannot
  // turn an old claim of retained text into a claim to have read a different range.
  const mapHash = hash(JSON.stringify(entry));
  let held = new Set();
  if (heldReceipt !== undefined) {
    const fields = typeof heldReceipt === 'string' ? heldReceipt.split('.') : [];
    if (fields.length !== 5 || fields[0] !== '1' || fields[1] !== document || fields[2] !== entry.sha256 || fields[3] !== mapHash) throw Error('Invalid, stale or different-document held receipt; omit --held and read the required reference again.');
    const ids = fields[4].split(',');
    if (!ids.length || ids.some(id => !id || !Object.hasOwn(entry.sections, id)) || new Set(ids).size !== ids.length) throw Error('Invalid held section IDs; omit --held and read again.');
    held = close(ids);
    if (held.size !== ids.length || ids.some(id => !held.has(id))) throw Error('Held receipt omits common/dependency sections; omit --held and read again.');
  }
  function merge(ids) {
    const ranges = [...ids].flatMap(id => entry.sections[id].ranges.map(([start, end]) => ({ start, end, id }))).sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of ranges) {
      if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 1 || range.end < range.start || range.end > lines.length - (content.endsWith('\n') ? 1 : 0)) throw Error('Invalid section range; read the original full reference.');
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
      else merged.push({ start: range.start, end: range.end });
    }
    return merged;
  }
  const retainedRanges = merge(held);
  const merged = merge(selected).flatMap(range => {
    let parts = [range];
    for (const retained of retainedRanges) parts = parts.flatMap(part => {
      if (retained.end < part.start || retained.start > part.end) return [part];
      const remaining = [];
      if (retained.start > part.start) remaining.push({ start: part.start, end: retained.start - 1 });
      if (retained.end < part.end) remaining.push({ start: retained.end + 1, end: part.end });
      return remaining;
    });
    return parts;
  }).map(range => ({ ...range, sections: [...selected].filter(id => entry.sections[id].ranges.some(([start, end]) => start <= range.end && end >= range.start)) }));
  const chunks = merged.map(range => {
    const text = lines.slice(range.start - 1, range.end).join('\n') + (range.end < lines.length ? '\n' : '');
    return { ...range, sections: [...new Set(range.sections)], bytes: Buffer.byteLength(text), characters: [...text].length, text };
  });
  const known = new Set([...held, ...selected]);
  const receipt = ['1', document, entry.sha256, mapHash, Object.keys(entry.sections).filter(id => known.has(id)).join(',')].join('.');
  return { document, receipt, path: entry.path, sha256: entry.sha256, requested, selected: [...selected], chunks, bytes: chunks.reduce((n, c) => n + c.bytes, 0) };
}
function main(argv, root = __dirname) {
  if (argv.includes('--help')) { process.stdout.write(usage + '\n--held: use only while this reader retains the previous text; omit after compact/content loss or when handing work to another reader. No cache is stored.\n'); return; }
  if (argv.includes('--list')) {
    const index = JSON.parse(fs.readFileSync(path.join(root, 'references/section-index.json'), 'utf8'));
    const documents = argv.filter(arg => arg !== '--list');
    if (documents.length > 1 || (documents.length && !Object.hasOwn(index.documents, documents[0]))) throw Error('Unknown document for --list. ' + usage);
    for (const [name, doc] of Object.entries(index.documents).filter(([name]) => !documents.length || name === documents[0])) {
      console.log(name + ': ' + Object.entries(doc.sections).map(([id, section]) => id + (section.requires?.length ? ' (requires ' + section.requires.join(',') + ')' : '')).join('; ') + '; common=' + doc.common.join(','));
    }
    return;
  }
  let json = false, held;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') { if (json) throw Error('Duplicate --json'); json = true; }
    else if (argv[i] === '--held') {
      if (held !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('Use --held <receipt> once.');
      held = argv[++i];
    } else if (argv[i].startsWith('--')) throw Error('Unknown option: ' + argv[i]);
    else args.push(argv[i]);
  }
  const result = readSections(root, args[0], args.slice(1), held);
  if (json) process.stdout.write(JSON.stringify(result) + '\n');
  else {
    process.stdout.write('# ' + result.path + ' sha256=' + result.sha256 + ' selected=' + result.selected.join(',') + ' receipt=' + result.receipt + (result.bytes ? '' : '; already retained; body-bytes 0') + '\n');
    for (const chunk of result.chunks) process.stdout.write('<!-- lines ' + chunk.start + '-' + chunk.end + '; body-bytes ' + chunk.bytes + ' -->\n' + chunk.text);
  }
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message + '\n' + usage); process.exitCode = 1; }
}
module.exports = { readSections, main };
