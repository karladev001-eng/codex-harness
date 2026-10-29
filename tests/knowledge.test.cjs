const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Store, atomic, validateCapture, canonical, filesFor, MAX_MESSAGE } = require('../knowledge/core.cjs');
const { sync, gitBlobSha, Gh } = require('../knowledge/github.cjs');
const { frame, decoder, handle } = require('../knowledge/native.cjs');
const { register } = require('../knowledge/cli.cjs');
const extension = 'a'.repeat(32), library = crypto.randomUUID();
const capture = (url = 'https://example.com/a') => ({ schema_version: 1, operation_id: crypto.randomUUID(), captured_at: '2026-10-04T00:00:00.000Z', source: { url, title: '資料', kind: 'page', details: {}, limitations: ['表示範囲のみ'] }, content: { text: '取得本文', selection: '選択', headings: ['見出し'] }, note: '私のメモ', tags: ['tag'] });
async function fixture(t, configured = true) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); const store = new Store(root); const config = { schema_version: 1, repo: 'me/knowledge', branch: 'main', library_id: library, gh_path: process.execPath, extension_id: extension }; if (configured) await atomic(path.join(root, 'config.json'), config); return { store, config, root }; }
class FakeGh {
  constructor() { this.private = true; this.head = 'head0'; this.commits = { head0: { tree: { sha: 'tree0' } } }; this.trees = { tree0: {} }; this.blobs = {}; this.calls = []; this.counter = 0; this.loseResponse = false; this.conflict = false; }
  async api(endpoint, method = 'GET', body) {
    this.calls.push({ endpoint, method, body }); const repo = 'repos/me/knowledge';
    if (endpoint === repo) return { private: this.private };
    if (endpoint.includes('/git/ref/heads/')) return { object: { sha: this.head } };
    const commitMatch = endpoint.match(/\/git\/commits\/([^/?]+)$/); if (commitMatch) return this.commits[commitMatch[1]];
    const treeMatch = endpoint.match(/\/git\/trees\/([^/?]+)\?recursive=1/); if (treeMatch) return { tree: Object.entries(this.trees[treeMatch[1]]).map(([path, sha]) => ({ path, type: 'blob', sha })), truncated: !!this.truncated };
    const blobMatch = endpoint.match(/\/git\/blobs\/([^/?]+)$/); if (blobMatch) return { encoding: 'base64', content: this.blobs[blobMatch[1]] };
    if (endpoint.endsWith('/git/blobs') && method === 'POST') { const sha = gitBlobSha(Buffer.from(body.content, 'base64')); this.blobs[sha] = body.content; return { sha }; }
    if (endpoint.endsWith('/git/trees') && method === 'POST') { const sha = `tree${++this.counter}`; this.trees[sha] = { ...this.trees[body.base_tree] }; body.tree.forEach(entry => this.trees[sha][entry.path] = entry.sha); return { sha }; }
    if (endpoint.endsWith('/git/commits') && method === 'POST') { const sha = `head${++this.counter}`; this.commits[sha] = { tree: { sha: body.tree }, parents: body.parents }; return { sha }; }
    if (endpoint.includes('/git/refs/heads/') && method === 'PATCH') {
      assert.equal(body.force, false);
      if (this.conflict) { this.conflict = false; const base = this.commits[this.head].tree.sha; this.trees.concurrent = { ...this.trees[base], 'other-pc.md': gitBlobSha('other') }; this.commits.other = { tree: { sha: 'concurrent' } }; this.head = 'other'; throw new Error('conflict'); }
      assert.equal(this.commits[body.sha].parents[0], this.head); this.head = body.sha; if (this.loseResponse) { this.loseResponse = false; throw new Error('lost'); } return {};
    }
    throw new Error('fake endpoint unsupported ' + endpoint);
  }
  current() { return this.trees[this.commits[this.head].tree.sha]; }
}
test('schema rejects config injection, oversized source and non-web URLs; canonical IDs', () => {
  const input = capture(); assert.equal(validateCapture(input), input);
  assert.throws(() => validateCapture({ ...input, repo: 'other/repo' })); assert.throws(() => validateCapture({ ...input, content: { ...input.content, text: '界'.repeat(200000) } }));
  assert.throws(() => validateCapture({ ...input, source: { ...input.source, url: 'javascript:alert(1)' } }));
  assert.equal(canonical('https://youtu.be/abcdefghijk?t=24'), canonical('https://www.youtube.com/watch?v=abcdefghijk&t=3'));
});
test('durable queue survives restart and replay; collisions and unknown locks preserved', async t => {
  const { store, root } = await fixture(t, false); const input = capture();
  const response = await handle(store, { action: 'save', capture: input }); assert.equal(response.durable, true);
  const restarted = new Store(root); const saved = await restarted.stage(input); assert.equal(saved.destination, null);
  await assert.rejects(() => restarted.stage({ ...input, note: 'different' }), /COLLISION/);
  await fs.mkdir(path.join(root, 'lock')); await assert.rejects(() => restarted.locked(() => restarted.stage(capture())), /LOCKED/); assert.ok(await fs.stat(path.join(root, 'lock')));
});
test('one atomic commit, ambiguous response replay and intentional resave preserve note/history', async t => {
  const { store } = await fixture(t); const gh = new FakeGh(); gh.loseResponse = true; const input = capture(); await store.stage(input);
  assert.equal((await sync(store, {}, gh)).results[0].state, 'sent'); const patchCount = gh.calls.filter(c => c.method === 'PATCH').length; assert.equal(patchCount, 1);
  const firstFiles = { ...gh.current() }; const second = { ...capture(), note: 'second note', source: { ...input.source, title: 'new title' } }; await store.stage(second); assert.equal((await sync(store, {}, gh)).results[0].state, 'sent');
  const base = filesFor((await store.operations())[0]).base; assert.equal(gh.current()[`${base}/note.md`], firstFiles[`${base}/note.md`]);
  assert.ok(gh.current()[`${base}/captures/${input.operation_id}/note.md`]); assert.ok(gh.current()[`${base}/captures/${second.operation_id}/note.md`]);
  const before = gh.calls.length; await sync(store, {}, gh); assert.equal(gh.calls.length, before);
});
test('other PC ref race rebases new capture and retains unrelated additions', async t => { const { store } = await fixture(t); const gh = new FakeGh(); await store.stage(capture()); await sync(store, {}, gh); gh.calls = []; gh.conflict = true; await store.stage(capture('https://example.com/race')); assert.equal((await sync(store, {}, gh)).results[0].state, 'sent'); assert.ok(gh.current()['other-pc.md']); assert.equal(gh.calls.filter(c => c.method === 'PATCH').length, 2); });
test('private repo, schema mismatch, truncated tree and offline never mark sent', async t => {
  for (const mode of ['public', 'schema', 'truncated', 'offline']) {
    const { store } = await fixture(t); const gh = new FakeGh(); await store.stage(capture());
    if (mode === 'public') gh.private = false; if (mode === 'schema') { const bytes = JSON.stringify({ schema_version: 99, library_id: library }); const sha = gitBlobSha(bytes); gh.trees.tree0['kb.json'] = sha; gh.blobs[sha] = Buffer.from(bytes).toString('base64'); }
    if (mode === 'truncated') gh.truncated = true; if (mode === 'offline') gh.api = async () => { throw new Error('GH_REQUEST_FAILED'); };
    assert.equal((await sync(store, {}, gh)).results[0].state, 'pending'); assert.equal((await store.operations())[0].state, 'pending'); assert.equal(gh.calls.filter(c => c.method === 'PATCH').length, 0);
  }
});
test('unbound operations require explicit bind, configured target cannot silently change', async t => {
  const { store, config, root } = await fixture(t, false); await store.stage(capture()); await atomic(path.join(root, 'config.json'), config); const gh = new FakeGh();
  assert.equal((await sync(store, {}, gh)).results[0].reason, 'DESTINATION_NOT_BOUND'); assert.equal((await sync(store, { bind: true }, gh)).results[0].state, 'sent');
  await store.stage(capture('https://example.com/second')); await atomic(path.join(root, 'config.json'), { ...config, branch: 'changed' }); assert.equal((await sync(store, { bind: true }, gh)).results[0].reason, 'DESTINATION_CHANGED');
});
test('corrupt materialized captures cannot enter transport', async t => { const { store } = await fixture(t); const op = await store.stage(capture()); op.materialized = { ...op.input, note: 'tampered' }; op.materialized_digest = 'wrong'; await atomic(store.file(op.input.operation_id), op); await assert.rejects(() => sync(store, {}, new FakeGh()), /CORRUPT/); });

test('GitHub source API takes README once, freezes enrichment and records fallback', async t => {
  const { store } = await fixture(t); const input = capture('https://github.com/source/repo'); input.source.kind = 'github'; input.source.details = { repository:'source/repo' }; input.source.limitations = ['GitHub README: 表示DOMの取得範囲のみ。API取得前。'];
  const gh = new FakeGh(); const baseApi = gh.api.bind(gh); let reads = 0;
  gh.api = async (endpoint, method, body) => { if (endpoint === 'repos/source/repo') return {description:'source repo'}; if (endpoint === 'repos/source/repo/readme') { reads++; return {encoding:'base64',content:Buffer.from('# Official README').toString('base64'),size:17,path:'README.md',sha:'source-sha',html_url:input.source.url}; } return baseApi(endpoint,method,body); };
  await store.stage(input); gh.loseResponse=true; assert.equal((await sync(store,{},gh)).results[0].state,'sent'); assert.equal(reads,1); const op=(await store.operations())[0]; assert.equal(op.materialized.content.text,'# Official README'); assert.equal(op.input.content.text,'取得本文'); assert.equal(op.materialized.source.details.readme_method,'github-api');
  const fallback={...capture('https://github.com/missing/repo')};fallback.source.kind='github';await store.stage(fallback);assert.equal((await sync(store,{},gh)).results[0].state,'sent');assert.ok((await store.operations()).some(op=>op.materialized?.source.limitations.some(s=>s.includes('APIからREADMEを取得できず'))));
});

test('native decoder chunks UTF8, coalesced frames, oversized and truncated input', () => {
  const output = [], errors = []; const bytes = Buffer.concat([frame({ text: '日本語' }), frame({ action: 'status' })]); const d = decoder(v => output.push(v), e => errors.push(e)); for (const byte of bytes) d.push(Buffer.from([byte])); d.end(); assert.equal(output.length, 2); assert.equal(errors.length, 0);
  const huge = Buffer.alloc(4); huge.writeUInt32LE(MAX_MESSAGE + 1); decoder(() => assert.fail(), e => errors.push(e)).push(huge); assert.equal(errors.length, 1);
  const incomplete = decoder(() => assert.fail(), e => errors.push(e)); incomplete.push(bytes.subarray(0, 7)); incomplete.end(); assert.equal(errors.length, 2);
});
test('native subprocess writes framing only and validates origin; generated absolute launchers', async t => {
  const { store, root } = await fixture(t, false); const generated = await register(store, { extension, output: path.join(root, 'host'), platform: 'darwin' }); const manifest = JSON.parse(await fs.readFile(generated.manifest)); assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${extension}/`]); assert.ok(path.isAbsolute(manifest.path));
  const cli = path.resolve('knowledge/cli.cjs'); const input = capture(); const body = Buffer.from(JSON.stringify({ action: 'save', capture: input })); const head = Buffer.alloc(4); head.writeUInt32LE(body.length);
  const result = spawnSync(process.execPath, [cli, 'native', `chrome-extension://${extension}/`], { input: Buffer.concat([head, body]), env: { ...process.env, KNOWLEDGE_HOME: root }, timeout: 5000 }); assert.equal(result.status, 0, result.stderr?.toString()); const responses = []; decoder(v => responses.push(v), e => assert.fail(e.message)).push(result.stdout); assert.equal(responses[0].durable, true);
  const denied = spawnSync(process.execPath, [cli, 'native', `chrome-extension://${'b'.repeat(32)}/`], { input: frame({ action: 'status' }), env: { ...process.env, KNOWLEDGE_HOME: root }, timeout: 5000 }); assert.equal(denied.status, 1); assert.equal(denied.stdout.length, 0);
  const windows = await register(store, { extension, output: path.join(root, 'win'), platform: 'win32' }); assert.match(await fs.readFile(windows.launcher, 'utf8'), /@echo off/);
});
// The fake gh is a POSIX shebang script, which Windows cannot execute.
test('gh transport uses explicit hostname and JSON stdin, strips server errors', { skip: process.platform === 'win32' }, async t => {
  const { root } = await fixture(t); const fake = path.join(root, 'fake-gh'); await fs.writeFile(fake, '#!/usr/bin/env node\nlet b="";process.stdin.on("data",x=>b+=x);process.stdin.on("end",()=>process.stdout.write(JSON.stringify({args:process.argv.slice(2),body:JSON.parse(b)})));', { mode: 0o700 });
  const result = await new Gh(fake).api('repos/me/knowledge/git/refs/heads/main', 'PATCH', { sha: 'abc', force: false }); assert.deepEqual(result.body, { sha: 'abc', force: false }); assert.ok(result.args.includes('github.com')); assert.ok(result.args.includes('--input'));
});
test('extension snapshot detects tab switch/same URL reload; durable browser retry keeps operation', async () => {
  const { acquire } = await import('../knowledge/extension/capture.js'); const { deliver, serialized } = await import('../knowledge/extension/worker.js');
  const data = { source: capture().source, content: capture().content, document_url: 'https://example.com/a', time_origin: 1 }; let scripts = 0;
  const api = { scripting: { executeScript: async () => ++scripts === 1 ? [{ result: structuredClone(data) }] : [{ result: { url: data.document_url, time: 2 } }] }, tabs: { query: async () => [{ id: 1, url: data.document_url }], captureVisibleTab: async () => 'data:image/jpeg;base64,YWJj' } };
  await assert.rejects(() => acquire(api, { id: 1, windowId: 3, url: data.document_url }, { screenshot: true }), /変わりました/);
  scripts = 0; api.tabs.query = async () => [{ id: 2, url: data.document_url }]; await assert.rejects(() => acquire(api, { id: 1, windowId: 3, url: data.document_url }, { screenshot: true }), /切り替わりました/);
  let stored, sent = []; const nativeApi = { storage: { local: { get: async () => ({ pending: stored }), set: async value => { stored = structuredClone(value.pending); }, remove: async () => { stored = undefined; } } }, runtime: { connectNative() { let responseListener; return { onMessage: { addListener(fn) { responseListener = fn; } }, onDisconnect: { addListener() {} }, disconnect() {}, postMessage(message) { sent.push(message); queueMicrotask(() => responseListener(message.action === 'save' ? { durable: true, operation_id: message.capture.operation_id, state: 'pending' } : { results: [{ operation_id: message.operation_id, state: 'pending' }] })); } }; } } };
  const input = capture(); assert.equal((await deliver(nativeApi, input)).state, 'pending'); assert.equal(stored, undefined); assert.equal(sent[0].capture.operation_id, sent[1].operation_id);
  stored = input; await assert.rejects(() => deliver(nativeApi, { ...input, note: 'changed' }), /内容が変わりました/); assert.equal(stored.note, input.note);
  const order = []; await Promise.all([serialized(async () => { await new Promise(resolve => setTimeout(resolve, 10)); order.push(1); }), serialized(async () => order.push(2))]); assert.deepEqual(order, [1,2]);
});
test('distribution includes installable MV3, host and versioned schema', async () => { const manifest = JSON.parse(await fs.readFile('dist/knowledge/extension/manifest.json')); assert.equal(manifest.manifest_version, 3); assert.deepEqual(manifest.permissions, ['activeTab','scripting','storage','nativeMessaging']); assert.equal(manifest.host_permissions, undefined); for (const file of ['cli.cjs','core.cjs','github.cjs','native.cjs','schemas/capture-v1.json','extension/popup.html','extension/worker.js','extension/inputs.js']) assert.ok(await fs.stat(path.join('dist/knowledge', file))); });

test('registration rejects an existing OS host before changing generated files or origin', async t => {
  const { store, root } = await fixture(t, false); const home=path.join(root,'fake-home'); const output=path.join(root,'host');
  const options={extension,output,platform:'darwin',install:true}; const generated=await register(store,options,{home,platform:'darwin'});
  const nativeFile=path.join(root,'native.json'); const before=await Promise.all([generated.launcher,generated.manifest,nativeFile].map(file=>fs.readFile(file)));
  await assert.rejects(()=>register(store,{...options,extension:'b'.repeat(32)},{home,platform:'darwin'}),/EXISTING_REGISTRATION/);
  const after=await Promise.all([generated.launcher,generated.manifest,nativeFile].map(file=>fs.readFile(file)));assert.deepEqual(after,before);
  // A Windows key points at this same manifest: no generated artifact may be overwritten.
  const win=await register(store,{extension,output:path.join(root,'win'),platform:'win32'});const winBefore=await Promise.all([win.launcher,win.manifest,nativeFile].map(file=>fs.readFile(file)));
  await assert.rejects(()=>register(store,{extension:'b'.repeat(32),output:path.join(root,'win'),platform:'win32',install:true},{platform:'win32',registry:()=>({status:0})}),/EXISTING_OR_UNKNOWN/);
  assert.deepEqual(await Promise.all([win.launcher,win.manifest,nativeFile].map(file=>fs.readFile(file))),winBefore);
});
test('registration failure restores existing host state and removes only its new OS manifest', async t => {
  for (const fail of ['launcher','manifest','native','before-install','installed']) {
    const {store,root}=await fixture(t,false);const output=path.join(root,'host'),home=path.join(root,'fake-home');const generated=await register(store,{extension,output,platform:'darwin'});const native=path.join(root,'native.json');const files=[generated.launcher,generated.manifest,native];const before=await Promise.all(files.map(file=>fs.readFile(file)));
    await assert.rejects(()=>register(store,{extension,output,platform:'darwin',node:path.join(root,'updated-node'),install:true},{home,platform:'darwin',phase:async name=>{if(name===fail)throw Error('INJECTED_INSTALL_FAILURE')}}),/INJECTED/);
    assert.deepEqual(await Promise.all(files.map(file=>fs.readFile(file))),before);
    const target=path.join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.codex_harness.knowledge.json');await assert.rejects(()=>fs.stat(target),{code:'ENOENT'});
  }
});
test('falsy parsed operation/config/native JSON is corruption and is preserved', async t => {
  for(const value of ['null','false','0','""']) {
    const {store,root}=await fixture(t,false);const input=capture();const file=store.file(input.operation_id);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);
    await assert.rejects(()=>store.stage(input),/CORRUPT/);assert.equal(await fs.readFile(file,'utf8'),value);
    const configFile=path.join(root,'config.json');await fs.writeFile(configFile,value);await assert.rejects(()=>store.config(),/CORRUPT/);assert.equal(await fs.readFile(configFile,'utf8'),value);await fs.unlink(configFile);
    const native=path.join(root,'native.json');await fs.writeFile(native,value);await assert.rejects(()=>register(store,{extension,output:path.join(root,'host'),platform:'darwin'}),/CORRUPT/);assert.equal(await fs.readFile(native,'utf8'),value);
    const denied=spawnSync(process.execPath,[path.resolve('knowledge/cli.cjs'),'native',`chrome-extension://${extension}/`],{input:frame({action:'status'}),env:{...process.env,KNOWLEDGE_HOME:root},timeout:5000});assert.equal(denied.status,1);assert.equal(denied.stdout.length,0);
  }
});
test('oversized Japanese note is rejected before browser enqueue and remains editable', async()=>{
  const {validateUserInput}=await import('../knowledge/extension/inputs.js');const {deliver}=await import('../knowledge/extension/worker.js');const note='界'.repeat(17000);assert.throws(()=>validateUserInput(note,[]),/50,000バイト/);
  let enqueue=0,native=0;const api={storage:{local:{get:async()=>{enqueue++;return{}},set:async()=>{enqueue++}}},runtime:{connectNative(){native++;throw Error('unexpected')}}};const input={...capture(),note};await assert.rejects(()=>deliver(api,input),/短くしてください/);assert.equal(enqueue,0);assert.equal(native,0);
  input.note='界'.repeat(16000);assert.doesNotThrow(()=>validateUserInput(input.note,input.tags));validateCapture(input);
});

test('generation cannot change an existing origin with or without an OS install; same-origin refresh works', async t => {
  for (const platform of ['darwin','win32']) {
    const {store,root}=await fixture(t,false);const home=path.join(root,'home');const output=path.join(root,'host');let registryPresent=false;
    const registry=args=>{if(args[0]==='query')return {status:registryPresent?0:1};if(args[0]==='add'){registryPresent=true;return{status:0}};throw Error('unexpected registry action');};
    const installed=await register(store,{extension,output,platform,install:true},{home,platform,registry});const native=path.join(root,'native.json');const files=[installed.launcher,installed.manifest,native];const before=await Promise.all(files.map(file=>fs.readFile(file)));
    const input=capture();await store.stage(input);const queueBefore=await fs.readFile(store.file(input.operation_id));
    for(const nextOutput of [output,path.join(root,'new-output')]) {
      await assert.rejects(()=>register(store,{extension:'b'.repeat(32),output:nextOutput,platform},{home,platform,registry}),/EXISTING_ORIGIN_MANUAL_REVIEW/);
      assert.deepEqual(await Promise.all(files.map(file=>fs.readFile(file))),before);assert.deepEqual(await fs.readFile(store.file(input.operation_id)),queueBefore);
      if(nextOutput!==output)await assert.rejects(()=>fs.stat(nextOutput),{code:'ENOENT'});
    }
    const node=path.join(root,'updated-node');await register(store,{extension,output,platform,node},{home,platform,registry});assert.ok((await fs.readFile(installed.launcher,'utf8')).includes(node));assert.equal(JSON.parse(await fs.readFile(native)).extension_id,extension);assert.deepEqual(await fs.readFile(store.file(input.operation_id)),queueBefore);
  }
});

test('worker survives popup closure, exposes status promptly and acknowledges only its own result', async () => {
  const { handleMessage } = await import('../knowledge/extension/worker.js');
  const state = {}, ports = [], badges = [];
  const api = { storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, state[key]])),
    set: async value => Object.assign(state, structuredClone(value)), remove: async key => { delete state[key]; }
  } }, action: { setBadgeText: async value => badges.push(value.text), setBadgeBackgroundColor: async () => {} }, runtime: {
    connectNative() { const port = { onMessage: { addListener(fn) { port.receive = fn; } }, onDisconnect: { addListener(fn) { port.fail = fn; } }, disconnect() {}, postMessage(message) { port.message = message; } }; ports.push(port); return port; }
  } };
  const waitForPort = async n => { for (let i = 0; ports.length < n && i < 100; i++) await new Promise(r => setTimeout(r, 1)); assert.equal(ports.length, n); };
  const input = capture(), saving = handleMessage(api, { action: 'save', capture: input });
  await waitForPort(1);
  assert.deepEqual(await handleMessage(api, { action: 'captureStatus' }).then(row => [row.pending, row.saving]), [true, true]);
  assert.equal(state.pending.operation_id, input.operation_id);
  // The original popup no longer needs to consume this promise for the worker to finish.
  ports[0].receive({ durable: true, state: 'sent', operation_id: input.operation_id });
  assert.equal((await saving).state, 'sent'); assert.equal(state.pending, undefined);
  assert.equal(state.captureResult.unread, true); assert.equal(badges.at(-1), '✓');
  assert.equal(state.captureResult.note, undefined); assert.equal(state.captureResult.content, undefined);
  await handleMessage(api, { action: 'acknowledge', operation_id: 'old-operation' });
  assert.equal(state.captureResult.unread, true); assert.equal(badges.at(-1), '✓');
  await handleMessage(api, { action: 'acknowledge', operation_id: input.operation_id });
  assert.equal(state.captureResult.unread, false); assert.equal(badges.at(-1), '');
  const next = capture(), failing = handleMessage(api, { action: 'save', capture: next }); await waitForPort(2);
  const staleAck = handleMessage(api, { action: 'acknowledge', operation_id: input.operation_id });
  api.runtime.lastError = { message: 'offline' }; ports[1].fail(); await failing; await staleAck;
  assert.equal(state.captureResult.unread, true);
  assert.equal(state.pending.operation_id, next.operation_id); assert.equal(state.captureResult.state, 'error');
  const competing = await handleMessage(api, { action: 'save', capture: capture() });
  assert.equal(competing.state, 'error'); assert.equal(state.pending.operation_id, next.operation_id); assert.equal(ports.length, 2);
  const retry = handleMessage(api, { action: 'retry' }); await waitForPort(3);
  assert.equal(ports[2].message.capture.operation_id, next.operation_id);
  ports[2].receive({ durable: true, state: 'pending', operation_id: next.operation_id }); await waitForPort(4);
  ports[3].receive({ results: [{ operation_id: next.operation_id, state: 'pending', reason: 'GH_REQUEST_FAILED' }] });
  assert.equal((await retry).state, 'pending'); assert.equal(state.pending, undefined); assert.equal(badges.at(-1), '!');
  // An orphaned saving marker after service-worker restart must allow queued replay.
  state.captureResult = { state: 'saving', operation_id: next.operation_id, unread: true };
  assert.equal((await handleMessage(api, { action: 'captureStatus' })).result.state, 'pending');
  await handleMessage(api, { action: 'acknowledge', operation_id: next.operation_id });
  assert.equal(state.captureResult.state, 'pending');
  state.captureResult = { state: 'saving', operation_id: next.operation_id }; state.pending = next;
  assert.equal((await handleMessage(api, { action: 'captureStatus' })).saving, false);
});

async function popupHarness({ initial = {}, response = { state: 'sent' }, restricted = false, delayInitialStatus = false } = {}) {
  const vm = require('node:vm'), { validateUserInput } = await import('../knowledge/extension/inputs.js');
  const ids = ['heading','editor','preview','title','url','scope','body','limitations','status','note','tags','save','acquire','retry','html','screenshot'];
  const elements = Object.fromEntries(ids.map(id => [id, { hidden: ['preview','acquire','retry'].includes(id), disabled: id === 'save', checked: true, value: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, replaceChildren(...rows) { this.rows = rows; }, focus() { this.focused = true; } }]));
  const events = {}, settings = {}, calls = []; let acquisitions = 0, release, changed, releaseStatus, statusCalls = 0;
  const emit = (value) => changed?.({captureResult:{newValue:value}}, 'local');
  const api = { storage: { onChanged:{addListener:fn=>{changed=fn;}}, local: { get: async () => settings, set: async value => Object.assign(settings, value) } }, tabs: { query: async () => [{ id: 1, url: restricted ? 'chrome://settings' : 'https://example.com/a' }] }, runtime: { sendMessage: async message => {
    calls.push(message); if (message.action === 'captureStatus') {
      if (delayInitialStatus && statusCalls++ === 0) { const snapshot=structuredClone(initial); return new Promise(resolve=>{releaseStatus=()=>resolve(snapshot);}); }
      return initial;
    }
    if (message.action === 'save') return new Promise(resolve => { release = () => resolve(response); });
    return response;
  } } };
  const document = { getElementById: id => elements[id], createElement: () => ({}), addEventListener: (type, fn) => { events[type] = fn; } };
  const source = (await fs.readFile('knowledge/extension/popup.js','utf8')).replace(/^import .*;\n/gm, '');
  vm.runInNewContext(source, { document, chrome: api, crypto, validateUserInput, acquire: async (_, tab, options) => {
    acquisitions++; if (!/^https:/.test(tab.url)) throw Error('このページでは取得できません');
    const row = capture(); row.html = options.html ? '<p>本文</p>' : ''; row.screenshot = options.screenshot ? 'image' : undefined; return row;
  } });
  const settle = async () => { await new Promise(r => setTimeout(r, 5)); };
  await settle();
  return { elements, events, settings, calls, settle, emit, releaseStatus:()=>releaseStatus(), acquired: () => acquisitions, release: () => release() };
}

test('compact popup acquires automatically, preserves note across options, prevents double submission and recovers from input limits', async () => {
  const ui = await popupHarness(); const e = ui.elements;
  assert.equal(ui.acquired(),1); assert.equal(e.note.focused,true); assert.equal(e.save.disabled,false);
  e.note.value='界'.repeat(17000); e.save.listeners.click(); await ui.settle();
  assert.match(e.status.textContent,/50,000/); assert.equal(ui.calls.filter(row=>row.action==='save').length,0); assert.equal(e.save.disabled,false);
  e.note.value='後で見返す'; e.html.checked=false; e.html.listeners.change(); await ui.settle();
  assert.equal(e.note.value,'後で見返す'); assert.equal(ui.acquired(),2); assert.equal(ui.settings.captureSettings.html,false);
  e.save.listeners.click(); ui.events.keydown({metaKey:true,key:'Enter',preventDefault(){}}); await ui.settle();
  const saves=ui.calls.filter(row=>row.action==='save'); assert.equal(saves.length,1); assert.equal(saves[0].capture.note,'後で見返す'); assert.equal(saves[0].capture.html,'');
  ui.release(); await ui.settle(); assert.equal(e.editor.hidden,true); assert.equal(e.heading.textContent,'保存しました');
});

test('popup reopening distinguishes pending, historical success and restricted pages', async () => {
  const pending = await popupHarness({ initial: { pending:true, source_url:'https://example.com/old' } });
  assert.equal(pending.acquired(),0); assert.equal(pending.elements.retry.hidden,false); assert.equal(pending.elements.save.disabled,true);
  const old = await popupHarness({ initial: { result: { state:'sent',unread:false,source_url:'https://example.com/a' } } });
  assert.equal(old.acquired(),1); assert.equal(old.elements.editor.hidden,false);
  const completed = await popupHarness({ initial: { result: { state:'sent',unread:true,operation_id:'complete',source_url:'https://example.com/a' } } });
  assert.equal(completed.acquired(),0); assert.equal(completed.elements.editor.hidden,true); assert.ok(completed.calls.some(row=>row.action==='acknowledge'));
  const restricted = await popupHarness({ restricted:true }); assert.equal(restricted.elements.acquire.hidden,false); assert.equal(restricted.elements.save.disabled,true); assert.match(restricted.elements.status.textContent,/取得できません/);
  const pendingResult = await popupHarness({ response:{state:'pending',reason:'GH_REQUEST_FAILED'} }); pendingResult.elements.save.listeners.click(); await pendingResult.settle(); pendingResult.release(); await pendingResult.settle();
  assert.equal(pendingResult.elements.heading.textContent,'PC送信待ち'); assert.match(pendingResult.elements.status.textContent,/送信待ち/);
});

test('popup only follows the operation it initiated or resumed, even at the same URL', async () => {
  for (const source_url of ['https://example.com/old','https://example.com/a']) {
    const initial = {}, ui = await popupHarness({initial}); ui.elements.note.value='新しい下書き';
    const old = { state:'sent',unread:true,operation_id:'unrelated-old',source_url };
    initial.result=old; ui.emit(old); await ui.settle();
    assert.equal(ui.elements.editor.hidden,false); assert.equal(ui.elements.note.value,'新しい下書き');
    assert.equal(ui.calls.some(row=>row.action==='acknowledge'),false);
  }
  const initial={saving:true,pending:true,operation_id:'resumed',source_url:'https://example.com/a'};
  const resumed=await popupHarness({initial}); assert.equal(resumed.acquired(),0);
  initial.saving=false; initial.pending=false; initial.result={state:'sent',unread:true,operation_id:'resumed',source_url:initial.source_url};
  resumed.emit(initial.result); await resumed.settle();
  assert.equal(resumed.elements.editor.hidden,true);
  assert.ok(resumed.calls.some(row=>row.action==='acknowledge'&&row.operation_id==='resumed'));
});

test('saving phase always includes durable browser body before badge or native, including worker restart', async () => {
  const {saveTracked}=await import('../knowledge/extension/worker.js');
  const restarted=await import('../knowledge/extension/worker.js?durability-restart');
  const state={}, input=capture(); let releaseBadge, nativeCalls=0;
  const api={storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,state[key]])),set:async value=>Object.assign(state,structuredClone(value))}},action:{setBadgeText:async({text})=>{if(text==='…')await new Promise(resolve=>{releaseBadge=resolve;});}},runtime:{connectNative(){nativeCalls++;throw Error('simulated interruption before native');}}};
  const saving=saveTracked(api,input);
  for(let i=0;!releaseBadge&&i<100;i++)await new Promise(r=>setTimeout(r,1));
  assert.ok(releaseBadge); assert.equal(nativeCalls,0); assert.deepEqual(state.pending,input); assert.equal(state.captureResult.state,'saving');
  const status=await restarted.captureStatus(api); assert.equal(status.pending,true); assert.equal(status.saving,false); assert.equal(status.result.state,'error'); assert.equal(status.operation_id,input.operation_id);
  releaseBadge(); await saving; assert.deepEqual(state.pending,input);
  const failedState={}, failedApi={...api,storage:{local:{get:async()=>failedState,set:async()=>{throw Error('quota');}}}};
  await assert.rejects(()=>saveTracked(failedApi,capture()),/quota/);
  assert.deepEqual(failedState,{}); assert.equal(nativeCalls,1);
});

test('worker module loads in ordinary browser with chrome but no extension runtime', async () => {
  const previous=global.chrome; global.chrome={};
  try { await import('../knowledge/extension/worker.js?ordinary-browser'); }
  finally { if(previous===undefined)delete global.chrome;else global.chrome=previous; }
});

test('popup queues completion arriving before the initial status snapshot establishes operation identity', async () => {
  const initial={saving:true,pending:true,operation_id:'bootstrap-save',source_url:'https://example.com/a'};
  const ui=await popupHarness({initial,delayInitialStatus:true});
  initial.saving=false; initial.pending=false;
  initial.result={state:'sent',unread:true,operation_id:'bootstrap-save',source_url:initial.source_url};
  ui.emit(initial.result); ui.releaseStatus(); await ui.settle();
  assert.equal(ui.elements.editor.hidden,true); assert.equal(ui.elements.heading.textContent,'保存しました');
  assert.equal(ui.acquired(),0); assert.ok(ui.calls.some(row=>row.action==='acknowledge'&&row.operation_id==='bootstrap-save'));
  // Buffered unrelated completion must still be checked by operation ID after bootstrap.
  const otherInitial={saving:true,pending:true,operation_id:'current-save',source_url:'https://example.com/a'};
  const other=await popupHarness({initial:otherInitial,delayInitialStatus:true});
  otherInitial.saving=false; otherInitial.pending=false;
  otherInitial.result={state:'sent',unread:true,operation_id:'older-save',source_url:otherInitial.source_url};
  other.emit(otherInitial.result); other.releaseStatus(); await other.settle();
  assert.equal(other.elements.editor.hidden,false); assert.equal(other.calls.some(row=>row.action==='acknowledge'),false);
});
