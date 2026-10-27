'use strict';
const { run } = require('./process.cjs');
const path = require('node:path');
const { atomic, filesFor, json, sha, validateCapture } = require('./core.cjs');
class Gh {
  constructor(binary, { timeout = 20000 } = {}) { this.binary = binary; this.timeout = timeout; }
  api(endpoint, method = 'GET', body) {
    return (async () => {
      const args = ['api', '--hostname', 'github.com', endpoint, '--method', method, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28'];
      if (body !== undefined) args.push('--input', '-');
      let bytes;try{bytes=await run(this.binary,args,{timeout:this.timeout,max:12*1024*1024,input:body===undefined?undefined:JSON.stringify(body),env:{...process.env,GH_DEBUG:'',GH_HOST:'github.com'}});}catch(e){throw new Error(({PROCESS_UNAVAILABLE:'GH_UNAVAILABLE',PROCESS_TIMEOUT:'GH_TIMEOUT',PROCESS_AUTHENTICATION:'GH_AUTHENTICATION',PROCESS_FORBIDDEN:'GH_FORBIDDEN',PROCESS_NETWORK:'GH_NETWORK'})[e.message]||'GH_REQUEST_FAILED');}
      try{return JSON.parse(bytes.toString('utf8'));}catch{throw new Error('GH_INVALID_RESPONSE');}
    })();
  }
}
const gitBlobSha = value => { const crypto = require('node:crypto'); const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value); return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex'); };
async function enrich(op, gh) {
  if (op.materialized) return;
  const input = structuredClone(op.input);
  if (input.source.kind === 'github') {
    const m = new URL(input.source.url).pathname.match(/^\/([\w.-]+)\/([\w.-]+)/);
    if (m) {
      try {
        const repository = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
        const info = await gh.api(`repos/${repository}`); const readme = await gh.api(`repos/${repository}/readme`);
        if (readme.encoding !== 'base64' || typeof readme.content !== 'string' || readme.size > 500000) throw new Error('README_LIMIT');
        const text = Buffer.from(readme.content, 'base64').toString('utf8'); if (Buffer.byteLength(text) > 500000) throw new Error('README_LIMIT');
        input.content.text = text; input.content.headings = [];
        input.source.details = { ...input.source.details, repository, description: info.description || '', topics: info.topics || [], language: info.language || null, readme_path: readme.path, readme_blob_sha: readme.sha, readme_url: readme.html_url, readme_method: 'github-api', api_fetched_at: new Date().toISOString() };
        input.source.limitations = input.source.limitations.filter(s => s !== 'GitHub README: 表示DOMの取得範囲のみ。API取得前。');
      } catch { input.source.limitations.push('GitHub APIからREADMEを取得できず、表示DOMの範囲のみを保存。'); }
    }
  }
  validateCapture(input);
  op.materialized = input; op.materialized_digest = sha(JSON.stringify(input));
}
async function syncOperation(store, op, config, gh = new Gh(config.gh_path)) {
  if (op.state === 'sent') return { state: 'sent', operation_id: op.input.operation_id };
  if (!op.destination) return { state: 'pending', reason: 'DESTINATION_NOT_BOUND', operation_id: op.input.operation_id };
  if (['repo', 'branch', 'library_id'].some(key => op.destination[key] !== config[key])) return { state: 'pending', reason: 'DESTINATION_CHANGED', operation_id: op.input.operation_id };
  const repo = `repos/${config.repo}`;
  const info = await gh.api(repo); if (info.private !== true || info.archived || info.disabled) throw new Error('PRIVATE_WRITABLE_REPOSITORY_REQUIRED');
  await enrich(op, gh); await atomic(store.file(op.input.operation_id), op);
  if (op.materialized_digest !== sha(JSON.stringify(op.materialized))) throw new Error('CORRUPT_LOCAL_STATE');
  const bundle = filesFor(op);
  // Each attempt rebuilds from the current ref. Marker and entire capture are atomic.
  for (let attempt = 0; attempt < 4; attempt++) {
    const ref = await gh.api(`${repo}/git/ref/heads/${config.branch.split('/').map(encodeURIComponent).join('/')}`);
    const head = ref.object.sha; const commit = await gh.api(`${repo}/git/commits/${head}`);
    const tree = await gh.api(`${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('TREE_INCOMPLETE');
    const entries = new Map(tree.tree.map(entry => [entry.path, entry]));
    const readJson = async file => { const entry = entries.get(file); if (!entry || entry.type !== 'blob') throw new Error('KB_SCHEMA_CONFLICT'); const blob = await gh.api(`${repo}/git/blobs/${entry.sha}`); if (blob.encoding !== 'base64') throw new Error('KB_SCHEMA_CONFLICT'); try { return JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')); } catch { throw new Error('KB_SCHEMA_CONFLICT'); } };
    const kb = { schema_version: 1, library_id: config.library_id, format: 'codex-knowledge-capture' };
    const extra = {};
    if (entries.has('kb.json')) {
      const existing = await readJson('kb.json'); if (existing.schema_version !== 1 || existing.library_id !== kb.library_id || existing.format !== kb.format) throw new Error('KB_SCHEMA_CONFLICT');
      const schema = entries.get('schemas/capture-v1.json'); if (!schema || schema.sha !== gitBlobSha(json(require('./schemas/capture-v1.json')))) throw new Error('KB_SCHEMA_CONFLICT');
    } else {
      if (tree.tree.some(entry => entry.type === 'blob' && !['README.md', '.gitignore'].includes(entry.path))) throw new Error('NONEMPTY_UNKNOWN_REPOSITORY');
      extra['kb.json'] = json(kb); extra['schemas/capture-v1.json'] = json(require('./schemas/capture-v1.json'));
    }
    const markerPath = `operations/${op.input.operation_id}.json`;
    if (entries.has(markerPath)) {
      const marker = await readJson(markerPath); if (marker.schema_version !== 1 || marker.digest !== op.digest || marker.operation_id !== op.input.operation_id || marker.capture_path !== `${bundle.base}/captures/${op.input.operation_id}`) throw new Error('REMOTE_OPERATION_COLLISION');
      for (const [file, value] of Object.entries(bundle.files)) if (entries.get(file)?.sha !== gitBlobSha(value)) throw new Error('REMOTE_CAPTURE_CONFLICT');
      op.state = 'sent'; await atomic(store.file(op.input.operation_id), op); return { state: 'sent', operation_id: op.input.operation_id };
    }
    if (entries.has(`${bundle.base}/metadata.json`)) {
      const metadata = await readJson(`${bundle.base}/metadata.json`); if (metadata.schema_version !== 1 || metadata.item_id !== bundle.metadata.item_id || metadata.canonical_url !== bundle.metadata.canonical_url) throw new Error('ITEM_CONFLICT');
      if (!entries.has(`${bundle.base}/note.md`)) throw new Error('ITEM_CONFLICT');
    } else {
      if ([...entries.keys()].some(p => p.startsWith(`${bundle.base}/`))) throw new Error('ITEM_CONFLICT');
      extra[`${bundle.base}/metadata.json`] = json(bundle.metadata); extra[`${bundle.base}/note.md`] = op.input.note;
    }
    if (attempt === 3) throw new Error('REF_CONFLICT_OR_UNCONFIRMED');
    const files = { ...bundle.files, ...extra }; const additions = [];
    for (const [file, value] of Object.entries(files)) {
      if (entries.has(file)) throw new Error('REMOTE_PATH_CONFLICT');
      const blob = await gh.api(`${repo}/git/blobs`, 'POST', { encoding: 'base64', content: (Buffer.isBuffer(value) ? value : Buffer.from(value)).toString('base64') });
      if (blob.sha !== gitBlobSha(value)) throw new Error('GH_BLOB_MISMATCH');
      additions.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await gh.api(`${repo}/git/trees`, 'POST', { base_tree: commit.tree.sha, tree: additions });
    const newCommit = await gh.api(`${repo}/git/commits`, 'POST', { message: `Capture ${op.input.operation_id}`, tree: newTree.sha, parents: [head] });
    try { await gh.api(`${repo}/git/refs/heads/${config.branch.split('/').map(encodeURIComponent).join('/')}`, 'PATCH', { sha: newCommit.sha, force: false }); }
    catch { continue; } // Includes response loss: read marker from fresh ref before retrying.
    // Do not mark sent until a read confirms ref includes the exact marker/files.
  }
  throw new Error('REF_CONFLICT_OR_UNCONFIRMED');
}
async function sync(store, { bind = false, operationId } = {}, gh) {
  return store.locked(async () => {
    const config = await store.config(); if (!config) return { state: 'pending', reason: 'NOT_CONFIGURED' };
    const ops = await store.operations(); const results = [];
    for (const op of ops.filter(op => (!operationId || op.input.operation_id === operationId) && op.state !== 'sent')) {
      if (!op.destination && bind) { op.destination = { repo: config.repo, branch: config.branch, library_id: config.library_id }; await atomic(store.file(op.input.operation_id), op); }
      try { results.push(await syncOperation(store, op, config, gh)); }
      catch (e) { results.push({ operation_id: op.input.operation_id, state: 'pending', reason: /^(GH_|KB_|REMOTE_|ITEM_|PRIVATE_|TREE_|REF_|NONEMPTY_|CORRUPT_)/.test(e.message) ? e.message : 'SYNC_FAILED' }); }
    }
    return { results };
  });
}
module.exports = { Gh, gitBlobSha, syncOperation, sync };
