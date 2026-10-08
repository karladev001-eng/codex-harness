'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const MAX_MESSAGE = 4 * 1024 * 1024;
const HOST = 'com.codex_harness.knowledge';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const exact = (value, keys) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('INVALID_SCHEMA'); };
function string(value, max) { if (typeof value !== 'string' || Buffer.byteLength(value) > max || value.includes('\0')) throw new Error('INVALID_TEXT'); return value; }
function sourceUrl(value) { const u = new URL(string(value, 8192)); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('INVALID_URL'); return u; }
function canonical(value) {
  const u = sourceUrl(value); u.hash = '';
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname)) {
    const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1];
    if (/^[\w-]{11}$/.test(id || '')) return `https://www.youtube.com/watch?v=${id}`;
  }
  if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(u.hostname)) {
    const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/); if (m) return `https://x.com/i/status/${m[2]}`;
  }
  if (u.hostname === 'github.com') { const m = u.pathname.match(/^\/([^/]+)\/([^/]+)/); if (m) return `https://github.com/${m[1]}/${m[2].replace(/\.git$/, '')}`; }
  return u.href;
}
function validateCapture(input) {
  exact(input, ['schema_version', 'operation_id', 'captured_at', 'source', 'content', 'note', 'tags', 'html', 'screenshot']);
  if (input.schema_version !== 1 || !uuid(input.operation_id) || typeof input.captured_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.captured_at) || !Number.isFinite(Date.parse(input.captured_at))) throw new Error('INVALID_SCHEMA');
  exact(input.source, ['url', 'title', 'kind', 'details', 'limitations', 'viewport']);
  const originUrl = sourceUrl(input.source.url); string(input.source.title, 8192);
  if (!['page', 'youtube', 'github', 'x'].includes(input.source.kind)) throw new Error('INVALID_KIND');
  if (input.source.kind === 'github' && (originUrl.hostname !== 'github.com' || !/^\/[\w.-]+\/[\w.-]+/.test(originUrl.pathname))) throw new Error('INVALID_SOURCE_IDENTITY');
  if (input.source.kind === 'youtube' && (!['www.youtube.com','youtube.com','m.youtube.com','youtu.be'].includes(originUrl.hostname) || !canonical(input.source.url).startsWith('https://www.youtube.com/watch?v='))) throw new Error('INVALID_SOURCE_IDENTITY');
  if (input.source.kind === 'x' && (!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(originUrl.hostname) || !/^\/[^/]+\/status\/\d+/.test(originUrl.pathname))) throw new Error('INVALID_SOURCE_IDENTITY');
  // Site-specific fields are bounded JSON data, never configuration or commands.
  if (!input.source.details || typeof input.source.details !== 'object' || Array.isArray(input.source.details) || Buffer.byteLength(JSON.stringify(input.source.details)) > 300000) throw new Error('INVALID_DETAILS');
  if (!Array.isArray(input.source.limitations) || input.source.limitations.length > 50) throw new Error('INVALID_LIMITATIONS');
  input.source.limitations.forEach(s => string(s, 1000));
  exact(input.content, ['text', 'headings', 'selection']); string(input.content.text, 500000); string(input.content.selection, 100000);
  if (!Array.isArray(input.content.headings) || input.content.headings.length > 300) throw new Error('INVALID_HEADINGS');
  input.content.headings.forEach(s => string(s, 2000)); string(input.note, 50000);
  if (!Array.isArray(input.tags) || input.tags.length > 30) throw new Error('INVALID_TAGS'); input.tags.forEach(s => string(s, 100));
  if (input.html !== undefined) string(input.html, 500000);
  if (input.screenshot !== undefined && (typeof input.screenshot !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.screenshot) || input.screenshot.length > 1500000)) throw new Error('INVALID_SCREENSHOT');
  if (Buffer.byteLength(JSON.stringify(input)) > MAX_MESSAGE) throw new Error('MESSAGE_TOO_LARGE');
  return input;
}
function validateConfig(config) {
  exact(config, ['schema_version', 'repo', 'branch', 'library_id', 'gh_path', 'extension_id']);
  if (config.schema_version !== 1 || !/^[\w.-]+\/[\w.-]+$/.test(config.repo) || !uuid(config.library_id) || !/^[a-p]{32}$/.test(config.extension_id)) throw new Error('INVALID_CONFIG');
  if (typeof config.branch !== 'string' || !config.branch || config.branch.length > 200 || /[\s~^:?*\[\\]/.test(config.branch) || config.branch.includes('..') || config.branch.includes('@{') || config.branch.endsWith('/') || config.branch.endsWith('.') || config.branch.startsWith('-') || config.branch.split('/').some(p => !p || p.startsWith('.') || p.endsWith('.lock'))) throw new Error('INVALID_BRANCH');
  if (!path.isAbsolute(config.gh_path)) throw new Error('GH_ABSOLUTE_PATH_REQUIRED');
  return config;
}
async function read(file) { try { const value = JSON.parse(await fs.readFile(file, 'utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CORRUPT_LOCAL_STATE'); return value; } catch (e) { if (e.code === 'ENOENT') return null; throw new Error('CORRUPT_LOCAL_STATE'); } }
async function atomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${crypto.randomUUID()}.tmp`; const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(json(value)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temp, file);
  // Directory fsync is unsupported on Windows; the file was flushed before rename.
  try { const dir = await fs.open(path.dirname(file), 'r'); try { await dir.sync(); } finally { await dir.close(); } } catch (e) { if (process.platform !== 'win32') throw e; }
}

function validateOperation(op) {
  exact(op, ['schema_version','digest','input','destination','state','materialized','materialized_digest']);
  if (op.schema_version !== 1 || !['pending','sent'].includes(op.state)) throw new Error('CORRUPT_LOCAL_STATE');
  validateCapture(op.input); if (op.digest !== sha(JSON.stringify(op.input))) throw new Error('CORRUPT_LOCAL_STATE');
  if (op.destination !== null) {
    exact(op.destination, ['repo','branch','library_id']);
    validateConfig({schema_version:1, ...op.destination, extension_id:'a'.repeat(32), gh_path:process.execPath});
  }
  if (op.materialized !== undefined) {
    validateCapture(op.materialized);
    if (sha(JSON.stringify(op.materialized)) !== op.materialized_digest || op.materialized.operation_id !== op.input.operation_id) throw new Error('CORRUPT_LOCAL_STATE');
  } else if (op.materialized_digest !== undefined) throw new Error('CORRUPT_LOCAL_STATE');
}

class Store {
  constructor(root = process.env.KNOWLEDGE_HOME || path.join(os.homedir(), '.codex', 'knowledge')) { this.root = path.resolve(root); }
  async config() { const v = await read(path.join(this.root, 'config.json')); return v && validateConfig(v); }
  async locked(fn) {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 }); const lock = path.join(this.root, 'lock');
    try { await fs.mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw new Error('LOCKED_MANUAL_INSPECTION_REQUIRED'); throw e; }
    try { return await fn(); } finally { await fs.rmdir(lock); }
  }
  file(id) { if (!uuid(id)) throw new Error('INVALID_OPERATION_ID'); return path.join(this.root, 'operations', `${id}.json`); }
  async stage(input) {
    validateCapture(input); const digest = sha(JSON.stringify(input)); const file = this.file(input.operation_id); const existing = await read(file);
    if (existing) { validateOperation(existing); if (existing.digest !== digest || sha(JSON.stringify(existing.input)) !== digest) throw new Error('OPERATION_COLLISION_OR_CORRUPTION'); return existing; }
    const config = await this.config(); const op = { schema_version: 1, digest, input, destination: config ? { repo: config.repo, branch: config.branch, library_id: config.library_id } : null, state: 'pending' };
    await atomic(file, op); return op;
  }
  async operations() { let names; try { names = await fs.readdir(path.join(this.root, 'operations')); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } const result = []; for (const name of names.filter(n => n.endsWith('.json'))) { const op = await read(path.join(this.root, 'operations', name)); validateOperation(op); validateCapture(op.input); if (op.digest !== sha(JSON.stringify(op.input)) || !['pending', 'sent'].includes(op.state) || name !== `${op.input.operation_id}.json`) throw new Error('CORRUPT_LOCAL_STATE'); result.push(op); } return result; }
}
function filesFor(op) {
  const input = op.materialized || op.input; const canonicalUrl = canonical(input.source.url); const item = sha(canonicalUrl).slice(0, 32); const base = `items/${item}`; const capture = `${base}/captures/${input.operation_id}`;
  const metadata = { schema_version: 1, item_id: item, canonical_url: canonicalUrl, kind: input.source.kind, title: input.source.title, tags: input.tags };
  const files = { [`${capture}/capture.json`]: json({ schema_version: 1, capture_id: input.operation_id, operation_digest: op.digest, captured_at: input.captured_at, source: input.source }), [`${capture}/metadata.json`]: json(metadata), [`${capture}/note.md`]: input.note, [`${capture}/content.md`]: input.content.text + (input.content.headings.length ? '\n\n## 取得した見出し\n' + input.content.headings.join('\n') : '') + (input.content.selection ? '\n\n## 保存時の選択範囲\n' + input.content.selection : ''), [`operations/${input.operation_id}.json`]: json({ schema_version: 1, operation_id: input.operation_id, digest: op.digest, item_id: item, capture_path: capture }) };
  if (input.html !== undefined) files[`${capture}/structure.html`] = input.html;
  if (input.screenshot !== undefined) files[`${capture}/screenshot.jpg`] = Buffer.from(input.screenshot.split(',')[1], 'base64');
  return { files, base, metadata };
}
module.exports = { Store, MAX_MESSAGE, HOST, sha, json, uuid, exact, validateCapture, validateConfig, atomic, read, canonical, filesFor, validateOperation };
