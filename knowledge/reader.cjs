'use strict';
// Reference data is read as Git objects; no checkout, filters, hooks or submodules.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { run } = require('./process.cjs');
const { atomic, read, sha, json, uuid, validateCapture, canonical } = require('./core.cjs');
const { Gh, gitBlobSha } = require('./github.cjs');
const HASH = /^[0-9a-f]{40}$/;
const destination = config => ({ repo: config.repo, branch: config.branch, library_id: config.library_id });
const sameDestination = (a, b) => a && ['repo','branch','library_id'].every(k => a[k] === b[k]);
const safeError = e => /^[A-Z][A-Z0-9_]{1,80}$/.test(e?.message || '') ? e.message : 'KNOWLEDGE_READ_FAILED';
async function recoveryClaim(lock,candidate) {
  // Append-only numbered tickets avoid ABA when reclaiming an abandoned mutex.
  // A killed recoverer leaves its unique ticket; no new process reuses that path.
  const root=lock+'.recovery';await fs.mkdir(root,{recursive:true,mode:0o700});
  const rootStat=await fs.lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');
  let ticket;
  for(;;) {
    const names=await fs.readdir(root);if(names.some(name=>!/^\d{10}(\.done)?$/.test(name)))throw new Error('UNSAFE_READ_LOCK');
    if(names.length>20000)throw new Error('READ_LOCK_TICKET_LIMIT');
    const next=names.reduce((max,name)=>Math.max(max,Number(name.split('.')[0])),0)+1;
    ticket=path.join(root,String(next).padStart(10,'0'));
    // Every contender reserves exactly the same numeric pathname for this next
    // sequence. The hard link publishes its already-written PID atomically.
    try{await fs.link(candidate,ticket);break;}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  const markDone=async()=>{try{const handle=await fs.open(ticket+'.done','wx',0o600);await handle.close();}catch(e){if(e.code!=='EEXIST')throw e;}};
  for(const name of (await fs.readdir(root)).filter(name=>/^\d{10}$/.test(name)&&name<path.basename(ticket))) {
    const prior=path.join(root,name);const stat=await fs.lstat(prior);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');
    const owner=await read(prior);let done=false;try{const stat=await fs.lstat(prior+'.done');if(!stat.isFile()||stat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');done=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(done)continue;
    if(!Number.isInteger(owner.pid)||owner.pid<=0)throw new Error('UNSAFE_READ_LOCK');
    try{process.kill(owner.pid,0);await markDone();return null;}catch(e){if(e.code!=='ESRCH'){await markDone();return null;}}
  }
  return markDone;
}
function remaining(deadline,timeout=20000) {const value=deadline?Math.min(timeout,deadline-Date.now()):timeout;if(value<=0)throw new Error('READ_TIMEOUT');return value;}
async function libraryLock(config, fn) {
  const lock = path.join(os.tmpdir(), `codex-knowledge-${sha(json(destination(config))).slice(0,32)}.lock`);
  const token = crypto.randomUUID();
  const candidate=lock+'.'+token+'.candidate';
  await fs.writeFile(candidate,json({pid:process.pid,token}),{flag:'wx',mode:0o600});
  let acquired=false;
  try {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await fs.link(candidate,lock); acquired=true;break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let primaryStat;try{primaryStat=await fs.lstat(lock);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(!primaryStat.isFile()||primaryStat.isSymbolicLink())throw new Error('UNSAFE_READ_LOCK');
      // Ordinary contention needs no recovery ticket; only dead owners reclaim.
      const current=await read(lock);if(current){if(!Number.isInteger(current.pid)||current.pid<=0)throw new Error('UNSAFE_READ_LOCK');try{process.kill(current.pid,0);return {state:'busy'};}catch(error){if(error.code!=='ESRCH')return {state:'busy'};}}
      const releaseClaim=await recoveryClaim(lock,candidate);if(!releaseClaim)return {state:'busy'};
      try {
      let stat;try{stat=await fs.lstat(lock);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('UNSAFE_READ_LOCK');
      let owner; try { owner = await read(lock); } catch { throw new Error('UNSAFE_READ_LOCK'); }
      if (!owner)throw new Error('UNSAFE_READ_LOCK');
      else {
        if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== 'string') throw new Error('UNSAFE_READ_LOCK');
        try { process.kill(owner.pid,0); return { state: 'busy' }; } catch (error) { if (error.code !== 'ESRCH') return { state: 'busy' }; }
      }
      // Rename before removal: contenders never remove a newly acquired lock.
      const stale = `${lock}.${crypto.randomUUID()}.stale`;
      try { await fs.rename(lock,stale); await fs.unlink(stale); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (attempt === 1) return { state: 'busy' };
      } finally {await releaseClaim();}
    }
  }
  if(!acquired)return {state:'busy'};
  try {return await fn(); }
  finally { const owner = await read(lock); if (owner?.token === token) await fs.unlink(lock); }
  } finally {await fs.rm(candidate,{force:true});}
}
function gitClient(config, gitDir, options = {}) {
  const git = options.git || 'git';
  // Ignore user/system Git configuration, templates and inherited repository selectors.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_CONFIG_SYSTEM:os.devNull,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
  const fixed = ['-c','core.hooksPath='+os.devNull,'-c','protocol.file.allow=never','-c','protocol.ext.allow=never','-c','fetch.recurseSubmodules=false','-c','submodule.recurse=false','-c','gc.auto=0'];
  const invoke = (args, limits={}) => run(git,[...fixed,'--git-dir='+gitDir,...args],{env,...limits,timeout:remaining(options.deadline,limits.timeout||20000)});
  return { invoke, async init() { await fs.mkdir(path.dirname(gitDir),{recursive:true,mode:0o700}); await run(git,[...fixed,'init','--bare','--template=',gitDir],{env,timeout:remaining(options.deadline)});await fs.writeFile(path.join(gitDir,'config'),'[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = true\n',{mode:0o600}); },
    async fetch() {
      const configFile=path.join(gitDir,'config');const stat=await fs.lstat(configFile);
      if(!stat.isFile()||stat.isSymbolicLink())throw new Error('UNSAFE_GIT_CACHE');
      // fetch must never honor credential helpers, includes, url rewrites or filters
      // planted in a previously used cache. init's minimal bare config is the only allowed form.
      const local=await fs.readFile(configFile,'utf8');
      if(!/^\[core\]\r?\n\s*repositoryformatversion = 0\r?\n\s*filemode = (true|false)\r?\n\s*bare = true\r?\n$/.test(local))throw new Error('UNSAFE_GIT_CACHE_CONFIG');
      const remote = options.remote || `https://github.com/${config.repo}.git`;
      if(/[\r\n\0]/.test(config.gh_path))throw new Error('UNSAFE_GH_PATH');
      const credential = "!" + "'" + (process.platform==='win32'?config.gh_path.replace(/\\/g,'/'):config.gh_path).replace(/'/g,"'\\''") + "' auth git-credential";
      const auth = options.remote ? ['-c','protocol.file.allow=always'] : ['-c','credential.helper=','-c','credential.helper='+credential];
      await invoke([...auth,'fetch','--no-tags','--no-recurse-submodules','--depth=1',remote,`+refs/heads/${config.branch}:refs/knowledge/current`],{timeout:options.timeout||20000});
      const head = (await invoke(['rev-parse','refs/knowledge/current'])).toString().trim(); if (!HASH.test(head)) throw new Error('INVALID_GIT_HEAD'); return head;
    } };
}
async function snapshot(store, config) {
  const value = await read(path.join(store.root,'read','snapshot.json'));
  if (!value) return null;
  if (value.schema_version !== 1 || !sameDestination(value.destination,config) || !HASH.test(value.commit || '') || !Array.isArray(value.captures)) throw new Error('INVALID_READ_SNAPSHOT');
  return value;
}
function captureFromBlobs(base, blobs) {
  const decode = name => blobs[name]?.bytes.toString('utf8');
  let capture, metadata; try { capture = JSON.parse(decode('capture.json')); metadata = JSON.parse(decode('metadata.json')); } catch { throw new Error('KB_CAPTURE_SCHEMA_CONFLICT'); }
  const input = { schema_version:1,operation_id:capture.capture_id,captured_at:capture.captured_at,source:capture.source,content:{text:decode('content.md'),headings:[],selection:''},note:decode('note.md'),tags:metadata.tags };
  validateCapture(input);
  const item = sha(canonical(input.source.url)).slice(0,32);
  if (capture.schema_version !== 1 || metadata.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(capture.operation_digest || '') || metadata.item_id !== item || metadata.canonical_url !== canonical(input.source.url) || base !== `items/${item}/captures/${input.operation_id}` || metadata.kind !== input.source.kind || metadata.title !== input.source.title) throw new Error('KB_CAPTURE_SCHEMA_CONFLICT');
  return { capture_id:input.operation_id,path:base,captured_at:input.captured_at,source:input.source,title:metadata.title,tags:metadata.tags,note:input.note,content:input.content.text,blobs:Object.fromEntries(Object.entries(blobs).map(([key,value])=>[key,value.sha])),image:blobs['screenshot.jpg']?.bytes.toString('base64') || null,analysis:decode('analysis.json') ? parseAnalysis(decode('analysis.json')) : null };
}
function parseAnalysis(bytes) { try { return require('./analysis.cjs').validateAnalysis(JSON.parse(bytes)); } catch { return {invalid:true}; } }
async function buildSnapshot(store,config,client,head,previous,deadline) {
  const raw = await client.invoke(['ls-tree','-r','-z','--full-tree',head],{max:2*1024*1024});
  const entries = new Map();
  for (const line of raw.toString().split('\0').filter(Boolean)) {
    const m = line.match(/^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/); if (!m) throw new Error('INVALID_GIT_TREE');
    if (m[2] === 'commit' || m[1] === '120000') throw new Error('KB_UNSAFE_TREE');
    entries.set(m[4],{mode:m[1],type:m[2],sha:m[3]});
  }
  const blob = async (name,max=1500000) => { const entry=entries.get(name); if (!entry || entry.type !== 'blob' || entry.mode !== '100644') throw new Error('KB_SCHEMA_CONFLICT'); return client.invoke(['cat-file','blob',entry.sha],{max}); };
  let kb; try { kb=JSON.parse((await blob('kb.json',10000)).toString()); } catch { throw new Error('KB_SCHEMA_CONFLICT'); }
  if (kb.schema_version !== 1 || kb.library_id !== config.library_id || kb.format !== 'codex-knowledge-capture' || entries.get('schemas/capture-v1.json')?.sha !== gitBlobSha(json(require('./schemas/capture-v1.json')))) throw new Error('KB_SCHEMA_CONFLICT');
  const bases = [...entries.keys()].filter(name=>/^items\/[a-f0-9]{32}\/captures\/[a-f0-9-]+\/capture.json$/.test(name)).map(name=>name.slice(0,-13));
  if (bases.length > 1000) throw new Error('KB_CAPTURE_LIMIT');
  const prior = new Map((previous?.captures || []).map(row=>[row.path,row])); const captures=[]; let size=0;
  for (const base of bases) {
    remaining(deadline);
    if (!uuid(base.split('/').at(-1))) throw new Error('KB_CAPTURE_SCHEMA_CONFLICT');
    const names = ['capture.json','metadata.json','note.md','content.md',...['screenshot.jpg','analysis.json'].filter(name=>entries.has(`${base}/${name}`))];
    const old=prior.get(base); if (old && names.length === Object.keys(old.blobs).length && names.every(name=>old.blobs[name] === entries.get(`${base}/${name}`)?.sha)) { captures.push(old); continue; }
    const blobs={}; for (const name of names) { const bytes=await blob(`${base}/${name}`,name==='analysis.json'?50000:1500000); size+=bytes.length; if(size>32*1024*1024)throw new Error('KB_SIZE_LIMIT'); blobs[name]={sha:entries.get(`${base}/${name}`).sha,bytes}; }
    captures.push(captureFromBlobs(base,blobs));
  }
  const total=Buffer.byteLength(JSON.stringify(captures)); if(total>48*1024*1024)throw new Error('KB_SIZE_LIMIT');
  return {schema_version:1,destination:destination(config),commit:head,checked_at:new Date().toISOString(),captures};
}
async function pull(store,options = {}) {
  const config=await store.config(); if(!config)return {state:'unconfigured'};
  return libraryLock(config,async()=>{
    const deadline=Date.now()+(options.timeoutTotal||60000);
    const previous=await snapshot(store,config); const root=path.join(store.root,'read');
    const last=await read(path.join(root,'attempt.json'));
    const interval=options.interval ?? 300;
    if(!Number.isFinite(interval)||interval<0||interval>86400)throw new Error('INVALID_INTERVAL');
    if(!options.force && sameDestination(last?.destination,config) && Date.now()-Date.parse(last.at)<interval*1000)return {state:'throttled',commit:previous?.commit || null,checked_at:previous?.checked_at || null};
    await atomic(path.join(root,'attempt.json'),{destination:destination(config),at:new Date().toISOString()});
    try {
      if(!options.remote) { const info=await (options.gh || new Gh(config.gh_path,{timeout:remaining(deadline,options.timeout||20000)})).api(`repos/${config.repo}`); if(info.private!==true||info.archived||info.disabled)throw new Error('PRIVATE_READABLE_REPOSITORY_REQUIRED'); }
      const dir=path.join(root,sha(json(destination(config))).slice(0,32)+'.git'); const client=options.client || gitClient(config,dir,{...options,deadline});
      try { const stat=await fs.lstat(dir); if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('UNSAFE_GIT_CACHE');try{await fs.lstat(path.join(dir,'config'));}catch(e){if(e.code==='ENOENT')await client.init();else throw e;} } catch(e) { if(e.code==='ENOENT')await client.init();else throw e; }
      const head=await client.fetch();
      const next=head===previous?.commit?{...previous,checked_at:new Date().toISOString()}:await buildSnapshot(store,config,client,head,previous,deadline);
      next.analysis_pending=next.captures.filter(row=>require('./analysis.cjs').analysisState(row,row.analysis)!=='current').map(row=>row.capture_id);
      remaining(deadline);await atomic(path.join(root,'snapshot.json'),next);
      await atomic(path.join(root,'health.json'),{state:'current',at:next.checked_at});
      return {state:'current',commit:head,checked_at:next.checked_at,captures:next.captures.length};
    } catch(e) { const reason=safeError(e); await atomic(path.join(root,'health.json'),{state:'offline',reason,at:new Date().toISOString()}); return {state:'offline',reason,commit:previous?.commit || null,checked_at:previous?.checked_at || null}; }
  });
}
module.exports={run,libraryLock,gitClient,pull,snapshot,destination,sameDestination,safeError,parseAnalysis,HASH};
